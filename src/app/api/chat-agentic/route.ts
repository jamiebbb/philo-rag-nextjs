import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateChatCompletion, generateEmbedding } from '@/lib/openai'

// Query classification types
type QueryType = 
  | 'catalog_browse'        // "outline all books", "list documents"
  | 'specific_search'       // "books about warren buffett", "investing strategies"
  | 'direct_question'       // "what is value investing", "explain diversification"
  | 'recommendation'        // "recommend books for beginners", "best investment books"
  | 'hybrid'               // Needs both retrieved context AND general knowledge

interface QueryClassification {
  type: QueryType
  confidence: number
  reasoning: string
  contentFilter?: 'books' | 'videos' | 'all'
  needsPagination?: boolean
  pageRequested?: number
}

// Enhanced message with conversation context for better classification
function enhanceMessageWithContext(message: string, chatHistory: any[] = []): string {
  const queryLower = message.toLowerCase()
  
  // Handle context-dependent queries
  if (/\b(another\s+one|more|next|continue|similar|like\s+that|give\s+me\s+another)\b/i.test(message)) {
    // Look for the most recent system response for context
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const historyItem = chatHistory[i]
      if (historyItem.role === 'assistant' && historyItem.content) {
        const content = historyItem.content.toLowerCase()
        
        // If the previous response mentioned books, assume they want another book
        if (content.includes('book') || content.includes('author') || content.includes('investment') || content.includes('recommend')) {
          return `${message} (referring to: recommend another book similar to the previous recommendation)`
        }
        
        // If previous response was about a topic, they likely want more on that topic
        const topicMatch = content.match(/\b(value investing|dividend|growth|analysis|strategy|portfolio)\b/i)
        if (topicMatch) {
          return `${message} (referring to: more information about ${topicMatch[0]})`
        }
        
        break // Only check the most recent assistant response
      }
    }
    
    // Default enhancement for contextual requests
    return `${message} (contextual request - provide another recommendation or continue from previous topic)`
  }
  
  // For other vague requests, add context if available
  if (/\b(that|this|it)\b/i.test(message) && chatHistory.length > 0) {
    const lastAssistantMsg = chatHistory.slice().reverse().find(item => item.role === 'assistant')
    if (lastAssistantMsg?.content) {
      // Extract key topic from previous response
      const content = lastAssistantMsg.content
      const topicMatch = content.match(/(?:about|regarding|on)\s+([^.,!?]+)/i)
      if (topicMatch) {
        return `${message} (referring to: ${topicMatch[1].trim()})`
      }
    }
  }
  
  return message
}

async function classifyQuery(message: string): Promise<QueryClassification> {
  const queryLower = message.toLowerCase()
  
  // Detect pagination requests
  const paginationMatch = message.match(/(?:next|another|more)\s+(\d+)|(?:show|display)\s+(?:next|another)\s+(\d+)?/i)
  const pageRequested = paginationMatch ? parseInt(paginationMatch[1] || paginationMatch[2] || '1') : 1
  
  // Content type detection
  let contentFilter: 'books' | 'videos' | 'all' = 'all'
  if (/\b(books?|documents?)\b/i.test(message) && !/\b(videos?|talks?)\b/i.test(message)) {
    contentFilter = 'books'
  } else if (/\b(videos?|talks?|presentations?)\b/i.test(message) && !/\b(books?|documents?)\b/i.test(message)) {
    contentFilter = 'videos'
  }

  // Catalog browsing patterns
  if (/\b(all|every|complete|catalog|inventory|outline|list|show)\s+(books?|documents?|content|items)/i.test(message) ||
      /\b(what|which)\s+(books?|documents?|content)\s+(do\s+you\s+have|are\s+available)/i.test(message) ||
      /\b\d+\s+(books?|documents?|items)\b/i.test(message)) {
    return {
      type: 'catalog_browse',
      confidence: 0.95,
      reasoning: 'User wants to browse/list available content',
      contentFilter,
      needsPagination: true,
      pageRequested
    }
  }

  // Recommendation patterns (including context-dependent "another" requests)
  if (/\b(recommend|suggest|best|top|should\s+i\s+read|what\s+to\s+read|beginner|starter)/i.test(message) ||
      /\b(good|great)\s+(books?|resources?)\s+(for|about)/i.test(message) ||
      /\b(another\s+one|give\s+me\s+another|more\s+like|similar)\b/i.test(message)) {
    return {
      type: 'recommendation',
      confidence: 0.90,
      reasoning: 'User asking for recommendations or suggestions (including contextual "another" requests)',
      contentFilter
    }
  }

  // Specific search patterns
  if (/\b(about|on|regarding)\s+\w+/i.test(message) ||
      /\b(books?|documents?|content)\s+(about|on|covering|discussing)/i.test(message) ||
      /\b(find|search|looking\s+for)\b/i.test(message)) {
    return {
      type: 'specific_search',
      confidence: 0.85,
      reasoning: 'User searching for specific topics or content',
      contentFilter
    }
  }

  // Direct knowledge questions - but most should check context first (hybrid)
  if (/\b(what\s+is|explain|define|how\s+does|why\s+does|tell\s+me\s+about)\b/i.test(message) ||
      /\?$/.test(message.trim())) {
    
    // Most "what is" questions should check context first since investment knowledge base likely has better info
    const isInvestmentTerm = /\b(scuttlebutt|value\s+investing|dividend|compound|diversification|portfolio|risk|return|equity|bond|stock|market|finance|investment|trading|analysis)\b/i.test(message)
    const hasSpecificTerms = /\b(warren\s+buffett|benjamin\s+graham|fisher|munger|charlie\s+munger)\b/i.test(message)
    
    // Default to hybrid for investment-related questions to check context first
    if (isInvestmentTerm || hasSpecificTerms) {
      return {
        type: 'hybrid',
        confidence: 0.85,
        reasoning: 'Investment/finance question - check knowledge base first then supplement with general knowledge',
        contentFilter
      }
    }
    
    // Only use direct for very general questions
    return {
      type: 'direct_question',
      confidence: 0.70,
      reasoning: 'General non-investment question - use general knowledge',
      contentFilter
    }
  }

  // Default to hybrid for complex queries
  return {
    type: 'hybrid',
    confidence: 0.60,
    reasoning: 'Complex query that may need both retrieved context and general knowledge',
    contentFilter
  }
}

async function handleCatalogBrowse(
  message: string, 
  classification: QueryClassification, 
  supabase: any
) {
  console.log('📚 Handling catalog browse request')
  
  // Get all items
  const { data: allDocs, error } = await supabase
    .from('documents_enhanced')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Database error: ${error.message}`)
  }

  // Deduplicate into unique items
  const itemsMap = new Map()
  allDocs?.forEach((doc: any) => {
    const title = doc.title?.trim()
    const author = doc.author?.trim()
    
    if (!title) return

    const itemKey = `${title.toLowerCase()}-${(author || 'unknown').toLowerCase()}`
    
    if (!itemsMap.has(itemKey)) {
      itemsMap.set(itemKey, {
        title,
        author: author || 'Unknown Author',
        doc_type: doc.doc_type || 'Unknown',
        genre: doc.genre,
        topic: doc.topic,
        difficulty: doc.difficulty,
        summary: doc.summary,
        content_chunks: [],
        total_chunks: 0
      })
    }

    const item = itemsMap.get(itemKey)
    item.content_chunks.push(doc.content || '')
    item.total_chunks++
  })

  let allItems = Array.from(itemsMap.values())
    .sort((a, b) => a.title.localeCompare(b.title))

  // Apply content filtering
  if (classification.contentFilter === 'books') {
    allItems = allItems.filter(item => item.doc_type !== 'Video')
  } else if (classification.contentFilter === 'videos') {
    allItems = allItems.filter(item => item.doc_type === 'Video')
  }

  // Pagination - show up to 20 items per page
  const itemsPerPage = 20
  const currentPage = classification.pageRequested || 1
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedItems = allItems.slice(startIndex, endIndex)
  
  const totalPages = Math.ceil(allItems.length / itemsPerPage)
  const hasMore = currentPage < totalPages

  console.log(`📋 Showing page ${currentPage}/${totalPages} - ${paginatedItems.length} items`)

  const contextForAI = `AVAILABLE ${classification.contentFilter?.toUpperCase() || 'CONTENT'} (Page ${currentPage} of ${totalPages})

Showing ${paginatedItems.length} of ${allItems.length} total ${classification.contentFilter || 'items'} (displaying up to 20 at a time)

${paginatedItems.map((item, i) => 
  `${startIndex + i + 1}. "${item.title}" by ${item.author}
     Type: ${item.doc_type} | Genre: ${item.genre || 'N/A'} | Topic: ${item.topic || 'N/A'}
     Difficulty: ${item.difficulty || 'N/A'}
     Summary: ${item.summary || 'No summary available'}`
).join('\n\n')}

PAGINATION STATUS:
- Current Page: ${currentPage} of ${totalPages}
- Total ${classification.contentFilter || 'items'} available: ${allItems.length}
- Showing up to 20 items per page
${hasMore ? `- **${allItems.length - endIndex} more ${classification.contentFilter || 'items'} available** - ask "show me the next 20" to continue` : '- This is the complete list'}

INSTRUCTIONS:
- Present this as a clear, numbered list
- Mention that only 20 items are shown at a time out of ${allItems.length} total
- If there are more pages, clearly indicate how many more items are available and how to see them
- Use engaging, helpful language`

  return {
    contextForAI,
    sources: paginatedItems.map(item => ({
      title: item.title,
      author: item.author,
      doc_type: item.doc_type,
      topic: item.topic,
      genre: item.genre,
      difficulty: item.difficulty,
      content: item.content_chunks[0]?.substring(0, 300) || '',
      chunks_available: item.total_chunks
    })),
    metadata: {
      currentPage,
      totalPages,
      totalItems: allItems.length,
      itemsPerPage,
      hasMore,
      contentFilter: classification.contentFilter
    }
  }
}

async function handleSpecificSearch(
  message: string,
  classification: QueryClassification,
  supabase: any
) {
  console.log('🎯 Handling specific search request')
  
  // Use vector search for better accuracy
  const embedding = await generateEmbedding(message)
  
  const { data: vectorResults, error: vectorError } = await supabase.rpc(
    'match_documents_enhanced',
    {
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: 50
    }
  )

  if (vectorError) {
    throw new Error(`Vector search failed: ${vectorError.message}`)
  }

  // Deduplicate and filter
  const itemsMap = new Map()
  vectorResults?.forEach((doc: any) => {
    const title = doc.title?.trim()
    const author = doc.author?.trim()
    
    if (!title) return

    // Apply content filtering
    if (classification.contentFilter === 'books' && doc.doc_type === 'Video') return
    if (classification.contentFilter === 'videos' && doc.doc_type !== 'Video') return

    const itemKey = `${title.toLowerCase()}-${(author || 'unknown').toLowerCase()}`
    
    if (!itemsMap.has(itemKey)) {
      itemsMap.set(itemKey, {
        title,
        author: author || 'Unknown Author',
        doc_type: doc.doc_type,
        genre: doc.genre,
        topic: doc.topic,
        difficulty: doc.difficulty,
        content: doc.content,
        similarity: doc.similarity,
        chunks_available: 1
      })
    } else {
      const existing = itemsMap.get(itemKey)
      existing.chunks_available++
      if (doc.similarity > existing.similarity) {
        existing.content = doc.content
        existing.similarity = doc.similarity
      }
    }
  })

  const relevantItems = Array.from(itemsMap.values())
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, 10)

  const contextForAI = `SEARCH RESULTS for "${message}" (${relevantItems.length} relevant items found)

${relevantItems.map((item, i) => 
  `${i + 1}. "${item.title}" by ${item.author}
     Type: ${item.doc_type} | Relevance: ${((item.similarity || 0) * 100).toFixed(1)}%
     Genre: ${item.genre || 'N/A'} | Topic: ${item.topic || 'N/A'}
     Content: ${item.content?.substring(0, 300) || 'No content available'}...`
).join('\n\n')}

SEARCH DETAILS:
- Query: "${message}"
- Results found: ${relevantItems.length}
- Content filter: ${classification.contentFilter || 'all types'}
- Search method: Vector similarity search

INSTRUCTIONS:
- Answer based on the search results above
- If no relevant results, acknowledge this and offer alternatives
- Mention the relevance scores if helpful`

  return {
    contextForAI,
    sources: relevantItems.map(item => ({
      title: item.title,
      author: item.author,
      doc_type: item.doc_type,
      topic: item.topic,
      genre: item.genre,
      difficulty: item.difficulty,
      content: item.content?.substring(0, 300) || '',
      relevance_score: item.similarity,
      chunks_available: item.chunks_available
    })),
    metadata: {
      searchQuery: message,
      resultsFound: relevantItems.length,
      contentFilter: classification.contentFilter,
      searchMethod: 'vector_similarity'
    }
  }
}

async function handleDirectQuestion(message: string) {
  console.log('💭 Handling direct knowledge question')
  
  // For direct questions, we rely on the AI's general knowledge
  const systemPrompt = `You are a knowledgeable assistant specializing in business, finance, and investment topics. 

The user has asked a direct question that doesn't require searching through specific documents. Provide a comprehensive, accurate answer based on your general knowledge.

Be helpful, informative, and concise. If the question is outside your expertise, acknowledge the limitations and suggest where they might find better information.

User Question: ${message}`

  const response = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ])

  return {
    contextForAI: `DIRECT KNOWLEDGE RESPONSE (No document retrieval needed)

Question: ${message}
Response: Based on general knowledge without requiring specific document search.`,
    sources: [],
    metadata: {
      responseType: 'direct_knowledge',
      documentsUsed: false
    },
    directResponse: response
  }
}

async function handleRecommendation(
  message: string,
  classification: QueryClassification,
  supabase: any
) {
  console.log('🎯 Handling recommendation request')
  
  // Get available content for recommendations
  const catalogResult = await handleCatalogBrowse(message, {
    ...classification,
    type: 'catalog_browse',
    pageRequested: 1
  }, supabase)

  const systemPrompt = `You are a knowledgeable advisor for business and investment content. The user is asking for recommendations.

AVAILABLE CONTENT IN KNOWLEDGE BASE:
${catalogResult.contextForAI}

GENERAL KNOWLEDGE: You also have access to general knowledge about business, finance, and investment topics.

User Request: ${message}

IMPORTANT: If the user's request seems to reference previous conversation (e.g., "give me another one", "similar", etc.), treat this as a request for additional recommendations in the same category or topic area. Look for patterns that suggest they want more content similar to what was previously discussed.

Provide recommendations that:
1. First highlight relevant items from the available content above
2. Then provide additional general recommendations if helpful
3. Explain why each recommendation is valuable
4. Consider the user's apparent level/interests
5. If this appears to be a follow-up request, acknowledge the context and provide different/additional recommendations

Be specific about which recommendations come from the knowledge base vs general knowledge.`

  const response = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ])

  return {
    contextForAI: catalogResult.contextForAI,
    sources: catalogResult.sources,
    metadata: {
      ...catalogResult.metadata,
      responseType: 'recommendation',
      combinesAvailableAndGeneral: true
    },
    directResponse: response
  }
}

async function handleHybridQuery(
  message: string,
  classification: QueryClassification,
  supabase: any
) {
  console.log('🔄 Handling hybrid query (retrieved + direct knowledge)')
  
  // Get relevant context
  const searchResult = await handleSpecificSearch(message, classification, supabase)
  
  const systemPrompt = `You are a knowledgeable assistant with access to both a specialized investment/business knowledge base and general knowledge.

RETRIEVED CONTEXT FROM KNOWLEDGE BASE:
${searchResult.contextForAI}

INSTRUCTIONS:
1. **PRIORITIZE** information from the knowledge base when available - it likely contains more detailed, specific information than general knowledge
2. If the knowledge base has relevant information, lead with that and be comprehensive
3. Only supplement with general knowledge if the knowledge base information is incomplete
4. If no relevant context is found, then provide general knowledge but mention that the knowledge base didn't have specific information
5. For investment/finance terms, the knowledge base likely has more valuable insights than general knowledge
6. Be specific about sources: "Based on the documents in my knowledge base..." vs "From general knowledge..."

User Question: ${message}`

  const response = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ])

  return {
    contextForAI: searchResult.contextForAI,
    sources: searchResult.sources,
    metadata: {
      ...searchResult.metadata,
      responseType: 'hybrid',
      combinesRetrievedAndGeneral: true
    },
    directResponse: response
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🤖 Agentic Chat API called with message:', message)

    const supabase = createServerSupabaseClient()

    // Enhanced message with conversation context for better classification
    const enhancedMessage = enhanceMessageWithContext(message, chatHistory)
    
    // Classify the query (using enhanced message for better context understanding)
    const classification = await classifyQuery(enhancedMessage)
    
    console.log('🔍 Original Query:', message)
    console.log('🔍 Enhanced Query:', enhancedMessage)
    console.log('🎯 Query classified as:', classification)

    let result
    let response

    // Route to appropriate handler (use enhanced message for better context)
    const queryToUse = enhancedMessage !== message ? enhancedMessage : message
    
    switch (classification.type) {
      case 'catalog_browse':
        result = await handleCatalogBrowse(queryToUse, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful assistant. ${result.contextForAI}\n\nProvide a clear, organized response based on the content above. The user originally asked: "${message}"` },
          { role: 'user', content: queryToUse }
        ])
        break

      case 'specific_search':
        result = await handleSpecificSearch(queryToUse, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful assistant. ${result.contextForAI}\n\nAnswer the user's question based on the search results above. The user originally asked: "${message}"` },
          { role: 'user', content: queryToUse }
        ])
        break

      case 'direct_question':
        result = await handleDirectQuestion(queryToUse)
        response = result.directResponse
        break

      case 'recommendation':
        result = await handleRecommendation(queryToUse, classification, supabase)
        response = result.directResponse
        break

      case 'hybrid':
        result = await handleHybridQuery(queryToUse, classification, supabase)
        response = result.directResponse
        break

      default:
        // Fallback to simple search
        result = await handleSpecificSearch(queryToUse, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful assistant. ${result.contextForAI}\n\nAnswer based on the available information. The user originally asked: "${message}"` },
          { role: 'user', content: queryToUse }
        ])
    }

    console.log('✅ Generated response via', classification.type, 'handler')

    return NextResponse.json({
      response,
      sources: result.sources || [],
      metadata: {
        queryType: classification.type,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        ...result.metadata
      },
      classification,
      method: 'agentic_routing'
    })

  } catch (error) {
    console.error('❌ Error in agentic chat API:', error)
    return NextResponse.json(
      { error: 'Chat error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 