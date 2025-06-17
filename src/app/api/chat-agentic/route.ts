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

  // Recommendation patterns
  if (/\b(recommend|suggest|best|top|should\s+i\s+read|what\s+to\s+read|beginner|starter)/i.test(message) ||
      /\b(good|great)\s+(books?|resources?)\s+(for|about)/i.test(message)) {
    return {
      type: 'recommendation',
      confidence: 0.90,
      reasoning: 'User asking for recommendations or suggestions',
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

  // Direct knowledge questions
  if (/\b(what\s+is|explain|define|how\s+does|why\s+does|tell\s+me\s+about)\b/i.test(message) ||
      /\?$/.test(message.trim())) {
    
    // Check if it might need context too (hybrid)
    const hasSpecificTerms = /\b(warren\s+buffett|benjamin\s+graham|fisher|munger|specific\s+author|book\s+title)/i.test(message)
    
    return {
      type: hasSpecificTerms ? 'hybrid' : 'direct_question',
      confidence: 0.80,
      reasoning: hasSpecificTerms ? 'Question that needs both context and general knowledge' : 'General knowledge question',
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
     Difficulty: ${item.difficulty || 'N/A'} | Chunks Available: ${item.total_chunks}
     Content Sample: ${item.content_chunks[0]?.substring(0, 150) || 'No content preview'}...`
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

Provide recommendations that:
1. First highlight relevant items from the available content above
2. Then provide additional general recommendations if helpful
3. Explain why each recommendation is valuable
4. Consider the user's apparent level/interests

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
  
  const systemPrompt = `You are a knowledgeable assistant with access to both a document knowledge base and general knowledge.

RETRIEVED CONTEXT FROM KNOWLEDGE BASE:
${searchResult.contextForAI}

INSTRUCTIONS:
1. Use the retrieved context when available and relevant
2. Supplement with general knowledge when helpful
3. Clearly distinguish between information from the knowledge base vs general knowledge
4. If the knowledge base has limited information, acknowledge this and provide general knowledge
5. Be comprehensive and helpful

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

    // Classify the query
    const classification = await classifyQuery(message)
    console.log('🎯 Query classified as:', classification)

    let result
    let response

    // Route to appropriate handler
    switch (classification.type) {
      case 'catalog_browse':
        result = await handleCatalogBrowse(message, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful assistant. ${result.contextForAI}\n\nProvide a clear, organized response based on the content above.` },
          { role: 'user', content: message }
        ])
        break

      case 'specific_search':
        result = await handleSpecificSearch(message, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful assistant. ${result.contextForAI}\n\nAnswer the user's question based on the search results above.` },
          { role: 'user', content: message }
        ])
        break

      case 'direct_question':
        result = await handleDirectQuestion(message)
        response = result.directResponse
        break

      case 'recommendation':
        result = await handleRecommendation(message, classification, supabase)
        response = result.directResponse
        break

      case 'hybrid':
        result = await handleHybridQuery(message, classification, supabase)
        response = result.directResponse
        break

      default:
        // Fallback to simple search
        result = await handleSpecificSearch(message, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful assistant. ${result.contextForAI}\n\nAnswer based on the available information.` },
          { role: 'user', content: message }
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