import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateChatCompletion, generateEmbedding } from '@/lib/openai'
import { CitationFormatter } from '@/lib/citation-formatter'

// Helper function to extract page numbers from content
function extractPageFromContent(content: string): number | null {
  if (!content) return null

  const pagePatterns = [
    /(?:page|p\.)\s*(\d+)/i,
    /\[page\s*(\d+)\]/i,
    /\(p\.?\s*(\d+)\)/i,
    /page\s*#?\s*(\d+)/i
  ]

  for (const pattern of pagePatterns) {
    const match = content.match(pattern)
    if (match) {
      const pageNum = parseInt(match[1])
      if (pageNum > 0 && pageNum < 10000) {
        return pageNum
      }
    }
  }

  return null
}

// Clean 4-bucket system with clear purposes
type QueryType = 
  | 'catalog'          // "Show me what you have" - browse/inventory
  | 'search'           // "Find me content about X" - targeted search within knowledge base
  | 'recommend'        // "Suggest something good" - curated recommendations
  | 'ask'             // "Answer my question" - hybrid knowledge + general advice

interface QueryClassification {
  type: QueryType
  confidence: number
  reasoning: string
  contentFilter?: 'books' | 'videos' | 'all'
}

// Enhanced message with conversation context
function enhanceMessageWithContext(message: string, chatHistory: any[] = []): string {
  const queryLower = message.toLowerCase()
  
  // Handle context-dependent queries
  if (/\b(another\s+one|more|next|continue|similar|like\s+that|give\s+me\s+another)\b/i.test(message)) {
    // Look for the most recent system response and the user's previous query for context
    let previousUserQuery = ''
    let previousAssistantResponse = ''
    
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const historyItem = chatHistory[i]
      if (historyItem.role === 'assistant' && !previousAssistantResponse) {
        previousAssistantResponse = historyItem.content.toLowerCase()
      } else if (historyItem.role === 'user' && !previousUserQuery) {
        previousUserQuery = historyItem.content.toLowerCase()
      }
      
      if (previousUserQuery && previousAssistantResponse) break
    }
    
    // Check if previous query was catalog browsing
    const wasCatalogQuery = /\b(list|name|show|tell\s+me|what)\s+.*\b(books?|in\s+.*memory|available)\b/i.test(previousUserQuery)
    const responseListedBooks = previousAssistantResponse.includes('here are') && 
                               (previousAssistantResponse.includes('books') || previousAssistantResponse.includes('in my knowledge base'))
    
    if (wasCatalogQuery || responseListedBooks) {
      // Continue catalog browsing
      if (/\b(\d+\s+)?more\b/i.test(message)) {
        return `${message} (referring to: show me more books from my knowledge base)`
      }
    }
    
    // Check for recommendation context
    if (previousAssistantResponse.includes('recommend') || 
        /\b(suggest|good\s+book|best\s+book)\b/i.test(previousUserQuery)) {
      return `${message} (referring to: recommend another book similar to the previous recommendation)`
    }
    
    // Default enhancement for contextual requests
    return `${message} (contextual request - continue from previous topic)`
  }
  
  return message
}

async function classifyQuery(message: string): Promise<QueryClassification> {
  const queryLower = message.toLowerCase()
  
  // Content type detection
  let contentFilter: 'books' | 'videos' | 'all' = 'all'
  if (/\b(books?|documents?)\b/i.test(message) && !/\b(videos?|talks?)\b/i.test(message)) {
    contentFilter = 'books'
  } else if (/\b(videos?|talks?|presentations?)\b/i.test(message) && !/\b(books?|documents?)\b/i.test(message)) {
    contentFilter = 'videos'
  }

  // 1. CATALOG - "Show me what you have" - browsing/inventory
  if (/\b(all|every|complete|catalog|inventory|outline)\s+(books?|documents?|content|items)/i.test(message) ||
      /\b(what|which)\s+(books?|documents?|content)\s+(do\s+you\s+have|are\s+available|in\s+your\s+memory|are\s+there)/i.test(message) ||
      /\b(list|name|show|tell\s+me)\s+.*\b(books?|documents?|in\s+.*memory|in\s+.*knowledge|available)/i.test(message) ||
      /\b(how\s+many|count)\s+(books?|documents?)/i.test(message)) {
    return {
      type: 'catalog',
      confidence: 0.95,
      reasoning: 'User wants to browse/inventory available content',
      contentFilter
    }
  }

  // 2. RECOMMEND - "Suggest something good" - curated recommendations
  if (/\b(recommend|suggest|best|top|should\s+i\s+read|what\s+to\s+read|good\s+book|give\s+me\s+a\s+book)/i.test(message) ||
      /\b(another\s+one|give\s+me\s+another|more\s+like|similar)\b/i.test(message) ||
      /\b(reading\s+list|book\s+for\s+me|what.*read)\b/i.test(message)) {
    return {
      type: 'recommend',
      confidence: 0.90,
      reasoning: 'User asking for curated recommendations',
      contentFilter
    }
  }

  // 3. SEARCH - "Find me content about X" - targeted search within knowledge base
  if (/\b(about|on|regarding|covering)\s+\w+/i.test(message) ||
      /\b(books?|documents?|content)\s+(about|on|covering|discussing|related\s+to)/i.test(message) ||
      /\b(find|search|looking\s+for)\s+(books?|content|documents?)/i.test(message) ||
      /\b(anything|something)\s+(about|on)\s+\w+/i.test(message)) {
    return {
      type: 'search',
      confidence: 0.85,
      reasoning: 'User searching for specific topics within knowledge base',
      contentFilter
    }
  }

  // 4. ASK - Everything else gets hybrid treatment (knowledge base + general knowledge)
  return {
    type: 'ask',
    confidence: 0.80,
    reasoning: 'General question - will search knowledge base first then supplement with general knowledge',
    contentFilter
  }
}

async function handleCatalog(message: string, classification: QueryClassification, supabase: any) {
  console.log('📚 Handling catalog browsing request')
  
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

  const items = Array.from(itemsMap.values())
  
  // Filter by content type if specified
  const filteredItems = classification.contentFilter !== 'all' 
    ? items.filter(item => item.doc_type?.toLowerCase().includes(classification.contentFilter === 'videos' ? 'video' : 'book'))
    : items

  // Handle pagination for "more" requests
  const isMoreRequest = /\b(\d+\s+)?more\b/i.test(message)
  const requestedCount = message.match(/\b(\d+)\s+(books?|items?|more)\b/i)?.[1]
  const count = requestedCount ? parseInt(requestedCount) : (isMoreRequest ? 5 : 10)
  
  const startIndex = isMoreRequest ? Math.min(10, filteredItems.length) : 0
  const endIndex = Math.min(startIndex + count, filteredItems.length)
  const displayItems = filteredItems.slice(startIndex, endIndex)
  const remainingCount = Math.max(0, filteredItems.length - endIndex)

  const contextForAI = `CATALOG INVENTORY (${filteredItems.length} total items, showing ${displayItems.length}):

${displayItems.map((item, i) => 
  `${startIndex + i + 1}. "${item.title}" by ${item.author}
   Type: ${item.doc_type} | Genre: ${item.genre || 'N/A'} | Topic: ${item.topic || 'N/A'}
   Difficulty: ${item.difficulty || 'N/A'} | Chunks: ${item.total_chunks}
   Summary: ${item.summary || 'No summary available'}`
).join('\n\n')}

${remainingCount > 0 ? `\n(${remainingCount} more items available - user can ask for "more" to see additional items)` : ''}

Statistics:
- Total unique items: ${filteredItems.length}
- Books: ${items.filter(i => i.doc_type?.toLowerCase().includes('book')).length}
- Videos: ${items.filter(i => i.doc_type?.toLowerCase().includes('video')).length}
- Other: ${items.filter(i => !i.doc_type?.toLowerCase().includes('book') && !i.doc_type?.toLowerCase().includes('video')).length}`

  return {
    contextForAI,
    sources: displayItems.map(item => ({
      title: item.title,
      author: item.author,
      doc_type: item.doc_type,
      genre: item.genre,
      topic: item.topic,
      difficulty: item.difficulty,
      similarity: 1.0,
      content: item.summary || `${item.doc_type} by ${item.author}`
    })),
    metadata: {
      responseType: 'catalog',
      totalItems: filteredItems.length,
      displayedItems: displayItems.length,
      remainingItems: remainingCount,
      startIndex,
      hasMore: remainingCount > 0
    },
    directResponse: null // Will be generated by main handler
  }
}

async function handleSearch(message: string, classification: QueryClassification, supabase: any) {
  console.log('🔍 Handling targeted search within knowledge base')
  
  // Use vector search to find relevant content
  const queryEmbedding = await generateEmbedding(message)
  
  const { data: vectorResults, error: vectorError } = await supabase.rpc(
    'match_documents_enhanced',
    {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 12
    }
  )

  let sources: any[] = []
  let contextForAI = ''

  if (!vectorError && vectorResults && vectorResults.length > 0) {
    // Deduplicate and enhance sources
    const sourcesMap = new Map()
    
    vectorResults.forEach((doc: any) => {
      if (!doc.title) return

      const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
      
      if (!sourcesMap.has(bookKey) || (doc.similarity > (sourcesMap.get(bookKey)?.similarity || 0))) {
        sourcesMap.set(bookKey, {
          title: doc.title,
          author: doc.author || 'Unknown Author',
          content: doc.content || '',
          doc_type: doc.doc_type,
          similarity: doc.similarity,
          page_number: extractPageFromContent(doc.content)
        })
      }
    })

    sources = Array.from(sourcesMap.values())
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 8)

    contextForAI = `SEARCH RESULTS FOR: "${message}"
Found ${sources.length} relevant sources:

${sources.map((doc: any, i: number) => 
  `SOURCE ${i + 1}: "${doc.title}" by ${doc.author} (Relevance: ${Math.round((doc.similarity || 0) * 100)}%)
Content: ${doc.content}`
).join('\n\n')}`
  } else {
    contextForAI = `No relevant content found in knowledge base for: "${message}"`
  }

  return {
    contextForAI,
    sources,
    metadata: {
      responseType: 'search',
      searchQuery: message,
      sourcesFound: sources.length,
      avgRelevance: sources.length > 0 ? Math.round(sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length * 100) : 0
    },
    directResponse: null // Will be generated by main handler
  }
}

async function handleRecommend(message: string, classification: QueryClassification, supabase: any, chatHistory: any[] = []) {
  console.log('🎯 Handling recommendation request')
  
  // Extract previously recommended books from chat history
  const previouslyRecommended = new Set<string>()
  chatHistory.forEach((item: any) => {
    if (item.role === 'assistant' && item.sources) {
      item.sources.forEach((source: any) => {
        if (source.title && source.author) {
          const bookKey = `${source.title.toLowerCase()}-${(source.author || 'unknown').toLowerCase()}`
          previouslyRecommended.add(bookKey)
        }
      })
    }
  })
  
  console.log('📚 Previously recommended books:', previouslyRecommended.size)
  
  // Get available content for recommendations via vector search for better relevance
  const queryEmbedding = await generateEmbedding(message)
  
  const { data: vectorResults, error: vectorError } = await supabase.rpc(
    'match_documents_enhanced',
    {
      query_embedding: queryEmbedding,
      match_threshold: 0.1, // Lower threshold for recommendations
      match_count: 25 // Increase count to have more options for filtering
    }
  )

  let sources: any[] = []
  let contextForAI = ''

  if (!vectorError && vectorResults && vectorResults.length > 0) {
    // Deduplicate books for recommendations
    const booksMap = new Map()
    
    vectorResults.forEach((doc: any) => {
      if (!doc.title) return

      const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
      
      // Skip if this book was already recommended
      if (previouslyRecommended.has(bookKey)) {
        console.log('⏭️ Skipping previously recommended book:', doc.title)
        return
      }
      
      if (!booksMap.has(bookKey)) {
        booksMap.set(bookKey, {
          title: doc.title,
          author: doc.author || 'Unknown Author',
          content: doc.content || '',
          doc_type: doc.doc_type,
          genre: doc.genre,
          topic: doc.topic,
          difficulty: doc.difficulty,
          summary: doc.summary,
          similarity: doc.similarity || 0.8, // High relevance for recommendations
          page_number: extractPageFromContent(doc.content)
        })
      }
    })

    sources = Array.from(booksMap.values())
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 10)

    contextForAI = `BOOKS AVAILABLE FOR RECOMMENDATIONS (${sources.length} books found):

${sources.map((book, i) => 
  `${i + 1}. "${book.title}" by ${book.author} (Match: ${Math.round((book.similarity || 0) * 100)}%)
   Type: ${book.doc_type} | Genre: ${book.genre || 'N/A'} | Topic: ${book.topic || 'N/A'}
   Difficulty: ${book.difficulty || 'N/A'}
   Summary: ${book.summary || 'No summary available'}`
).join('\n\n')}`
  } else {
    contextForAI = 'No books found in my knowledge base for this query.'
  }

  // Enhanced system prompt for follow-up recommendations
  const isFollowUpRequest = /\b(another\s+one|give\s+me\s+another|more|next|different|other)\b/i.test(message)
  const followUpNote = isFollowUpRequest ? 
    `\n\nIMPORTANT: This is a follow-up request for additional recommendations. The books listed above are NEW options that haven't been recommended before. Focus on these fresh recommendations and avoid repeating any previous suggestions.` : 
    ''

  const systemPrompt = `You are a knowledgeable book advisor with access to a personal library.

${contextForAI}${followUpNote}

INSTRUCTIONS:
1. First recommend the most relevant books from my knowledge base above (if any)
2. Explain why each recommendation is valuable and relevant to the request
3. Include specific details about the books (genre, difficulty, key topics)
4. Then provide 2-3 additional general recommendations if helpful
5. Be clear about which recommendations come from my knowledge base vs general knowledge
6. ${isFollowUpRequest ? 'Since this is a follow-up request, provide DIFFERENT books than any previous recommendations' : 'Provide your best recommendations for this request'}

User Request: ${message}`

  const response = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ])

  // Add citations if we have sources
  let finalResponse = response
  if (sources.length > 0) {
    finalResponse = CitationFormatter.addCitationsToResponse(response, sources)
  }

  return {
    contextForAI,
    sources,
    metadata: {
      responseType: 'recommend',
      knowledgeBaseBooks: sources.length,
      avgRelevance: sources.length > 0 ? Math.round(sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length * 100) : 0,
      combinesAvailableAndGeneral: true,
      excludedPreviouslyRecommended: previouslyRecommended.size,
      isFollowUpRequest
    },
    directResponse: finalResponse
  }
}

async function handleAsk(message: string, classification: QueryClassification, supabase: any) {
  console.log('💬 Handling general question with hybrid approach')
  
  // Search for relevant context first
  const queryEmbedding = await generateEmbedding(message)
  
  const { data: vectorResults, error: vectorError } = await supabase.rpc(
    'match_documents_enhanced',
    {
      query_embedding: queryEmbedding,
      match_threshold: 0.2,
      match_count: 10
    }
  )

  let contextFromKnowledgeBase = ''
  let sources: any[] = []

  if (!vectorError && vectorResults && vectorResults.length > 0) {
    // Deduplicate and enhance sources with full citation info
    const sourcesMap = new Map()
    
    vectorResults.forEach((doc: any) => {
      if (!doc.title) return

      const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
      
      if (!sourcesMap.has(bookKey) || (doc.similarity > (sourcesMap.get(bookKey)?.similarity || 0))) {
        sourcesMap.set(bookKey, {
          title: doc.title,
          author: doc.author || 'Unknown Author',
          content: doc.content || '',
          doc_type: doc.doc_type,
          similarity: doc.similarity,
          page_number: extractPageFromContent(doc.content)
        })
      }
    })

    sources = Array.from(sourcesMap.values())
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 8)

    contextFromKnowledgeBase = sources.map((doc: any, i: number) => 
      `SOURCE ${i + 1}: "${doc.title}" by ${doc.author} (Relevance: ${Math.round((doc.similarity || 0) * 100)}%)
Content: ${doc.content}`
    ).join('\n\n')
  }

  const systemPrompt = `You are a knowledgeable assistant with access to both a specialized knowledge base and general knowledge.

${contextFromKnowledgeBase ? `RELEVANT CONTENT FROM MY KNOWLEDGE BASE:
${contextFromKnowledgeBase}

` : 'No specific relevant content found in my knowledge base. '} 

INSTRUCTIONS:
1. If I have relevant content in my knowledge base above, prioritize that information and cite the sources
2. When referencing information from my knowledge base, use inline citations like: "According to The Intelligent Investor by Benjamin Graham..."
3. Supplement with general knowledge if needed to provide a complete answer
4. Be clear about what comes from my knowledge base vs general knowledge
5. If no relevant knowledge base content, provide helpful general knowledge but mention the limitation

User Question: ${message}`

  const response = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ])

  // Add formatted citations to the response if we have sources
  let finalResponse = response
  if (sources.length > 0) {
    finalResponse = CitationFormatter.addCitationsToResponse(response, sources)
  }

  return {
    contextForAI: contextFromKnowledgeBase || 'No relevant knowledge base content found',
    sources,
    metadata: {
      responseType: 'ask',
      hasKnowledgeBaseContent: contextFromKnowledgeBase.length > 0,
      combinesRetrievedAndGeneral: true,
      sourcesCount: sources.length,
      avgRelevance: sources.length > 0 ? Math.round(sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length * 100) : 0
    },
    directResponse: finalResponse
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🤖 Unified Chat API called with message:', message)

    const supabase = createServerSupabaseClient()

    // Enhanced message with conversation context
    const enhancedMessage = enhanceMessageWithContext(message, chatHistory)
    
    // Classify the query
    const classification = await classifyQuery(enhancedMessage)
    
    console.log('🎯 Query classified as:', classification.type)
    console.log('🔍 Confidence:', classification.confidence)

    let result
    let response

    // Route to appropriate handler
    const queryToUse = enhancedMessage !== message ? enhancedMessage : message
    
    switch (classification.type) {
      case 'catalog':
        result = await handleCatalog(queryToUse, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful librarian. ${result.contextForAI}\n\nProvide a clear, organized response showing the available content. Include totals and mention if there are more items available.` },
          { role: 'user', content: queryToUse }
        ])
        break

      case 'search':
        result = await handleSearch(queryToUse, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a research assistant. ${result.contextForAI}\n\nSummarize the findings and cite specific sources. If no content found, suggest related searches or recommendations.` },
          { role: 'user', content: queryToUse }
        ])
        break

      case 'recommend':
        result = await handleRecommend(queryToUse, classification, supabase, chatHistory)
        response = result.directResponse
        break

      case 'ask':
      default:
        result = await handleAsk(queryToUse, classification, supabase)
        response = result.directResponse
        break
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
      method: 'clean_4_bucket_system'
    })

  } catch (error) {
    console.error('❌ Error in unified chat API:', error)
    return NextResponse.json(
      { error: 'Chat error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}

 