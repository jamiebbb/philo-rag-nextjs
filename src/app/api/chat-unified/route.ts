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

// Simplified query classification - less rigid, more flexible
type QueryType = 
  | 'catalog_browse'        // "list books", "what books do you have"
  | 'specific_search'       // "books about X", "find documents on Y"
  | 'direct_question'       // "what is X", "explain Y" (general knowledge)
  | 'recommendation'        // "recommend books", "suggest reading"
  | 'hybrid'               // Default: check knowledge base + supplement with general knowledge

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
    
    // Check if previous query was asking for books from memory/database
    const wasMemoryQuery = /\b(name|list|show|tell\s+me)\s+.*\b(books?|in\s+(?:your\s+)?memory|in\s+(?:the\s+)?(?:database|collection|library))\b/i.test(previousUserQuery)
    const wasCatalogQuery = /\b(what|which)\s+books?\s+(?:do\s+you\s+have|are\s+available)\b/i.test(previousUserQuery)
    
    // Check if previous response was listing books from the knowledge base
    const responseListedBooks = previousAssistantResponse.includes('here are') && 
                               (previousAssistantResponse.includes('books') || previousAssistantResponse.includes('in my knowledge base'))
    
    if (wasMemoryQuery || wasCatalogQuery || responseListedBooks) {
      // If asking for "more" after a memory/catalog query, continue with catalog browsing
      if (/\b(\d+\s+)?more\b/i.test(message)) {
        return `${message} (referring to: show me more books from my knowledge base/memory)`
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

  // Catalog browsing patterns
  if (/\b(all|every|complete|catalog|inventory|outline|list|show)\s+(books?|documents?|content|items)/i.test(message) ||
      /\b(what|which)\s+(books?|documents?|content)\s+(do\s+you\s+have|are\s+available|in\s+your\s+memory)/i.test(message) ||
      /\b(name|tell\s+me)\s+.*\s+(books?|in\s+your\s+memory)/i.test(message)) {
    return {
      type: 'catalog_browse',
      confidence: 0.95,
      reasoning: 'User wants to browse/list available content',
      contentFilter
    }
  }

  // Recommendation patterns
  if (/\b(recommend|suggest|best|top|should\s+i\s+read|what\s+to\s+read|good\s+book)/i.test(message) ||
      /\b(another\s+one|give\s+me\s+another|more\s+like|similar)\b/i.test(message)) {
    return {
      type: 'recommendation',
      confidence: 0.90,
      reasoning: 'User asking for recommendations',
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
      reasoning: 'User searching for specific topics',
      contentFilter
    }
  }

  // Direct knowledge questions - ONLY for explicitly general knowledge requests
  if (/\b(from\s+your\s+own\s+knowledge|your\s+general\s+knowledge)\b/i.test(message) &&
      !/\b(book|document|uploaded|context|knowledge\s+base)\b/i.test(message)) {
    return {
      type: 'direct_question',
      confidence: 0.85,
      reasoning: 'User explicitly requesting general knowledge only',
      contentFilter
    }
  }

  // Default to hybrid for most queries - check knowledge base first, supplement with general knowledge
  return {
    type: 'hybrid',
    confidence: 0.80,
    reasoning: 'Default hybrid approach - check knowledge base first then supplement with general knowledge',
    contentFilter
  }
}

async function handleCatalogBrowse(message: string, classification: QueryClassification, supabase: any) {
  console.log('📚 Handling catalog browse request')
  
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

  // Detect if this is a "more" request and determine pagination
  const isMoreRequest = /\b(more|next|another\s+\d+|\d+\s+more)\b/i.test(message)
  const requestedCount = message.match(/\b(\d+)\b/)?.[1] ? parseInt(message.match(/\b(\d+)\b/)![1]) : 3
  
  let startIndex = 0
  let itemsToShow = requestedCount

  if (isMoreRequest) {
    // For "more" requests, try to start from where we left off
    // Since we can't track exact pagination, we'll show a different batch
    startIndex = Math.floor(Math.random() * Math.max(0, allItems.length - itemsToShow))
    console.log(`📄 "More" request detected - showing ${itemsToShow} items starting from index ${startIndex}`)
  } else {
    // For initial requests, show from the beginning
    itemsToShow = Math.min(requestedCount, 20) // Cap at 20 for initial requests
    console.log(`📄 Initial catalog request - showing first ${itemsToShow} items`)
  }

  const selectedItems = allItems.slice(startIndex, startIndex + itemsToShow)
  const remainingCount = Math.max(0, allItems.length - (startIndex + itemsToShow))

  const contextForAI = `AVAILABLE ${classification.contentFilter?.toUpperCase() || 'CONTENT'} 

${isMoreRequest ? 
  `Here are ${selectedItems.length} more ${classification.contentFilter || 'items'} from my knowledge base (${remainingCount} still remaining):` :
  `I have ${allItems.length} ${classification.contentFilter || 'items'} in my knowledge base. Here are ${selectedItems.length}:`
}

${selectedItems.map((item, i) => 
    `${startIndex + i + 1}. "${item.title}" by ${item.author}
     Type: ${item.doc_type} | Genre: ${item.genre || 'N/A'} | Topic: ${item.topic || 'N/A'}
     Summary: ${item.summary || 'No summary available'}`
  ).join('\n\n')}

${remainingCount > 0 ? `\n📚 I have ${remainingCount} more ${classification.contentFilter || 'items'} available. Ask "give me ${Math.min(remainingCount, requestedCount)} more" to see additional items.` : '\n✅ That\'s all the items in my knowledge base.'}

Present this as a clear, numbered list. ${isMoreRequest ? 'Make it clear these are additional items.' : 'Mention the total count and that more are available if requested.'}`

  return {
    contextForAI,
    sources: selectedItems.slice(0, 5).map(item => ({
      title: item.title,
      author: item.author,
      doc_type: item.doc_type,
      content: item.content_chunks[0]?.substring(0, 300) || ''
    })),
    metadata: {
      totalItems: allItems.length,
      shownItems: selectedItems.length,
      startIndex,
      remainingItems: remainingCount,
      isMoreRequest,
      contentFilter: classification.contentFilter
    }
  }
}

async function handleRecommendation(message: string, classification: QueryClassification, supabase: any) {
  console.log('🎯 Handling recommendation request')
  
  // Get available content for recommendations via vector search for better relevance
  const queryEmbedding = await generateEmbedding(message)
  
  const { data: vectorResults, error: vectorError } = await supabase.rpc(
    'match_documents_enhanced',
    {
      query_embedding: queryEmbedding,
      match_threshold: 0.1, // Lower threshold for recommendations
      match_count: 15
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

  const systemPrompt = `You are a knowledgeable book advisor with access to a personal library.

${contextForAI}

INSTRUCTIONS:
1. First recommend the most relevant books from my knowledge base above (if any)
2. Explain why each recommendation is valuable and relevant to the request
3. Include specific details about the books (genre, difficulty, key topics)
4. Then provide 2-3 additional general recommendations if helpful
5. Be clear about which recommendations come from my knowledge base vs general knowledge
6. If this appears to be a follow-up request ("another one"), provide different recommendations

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
      responseType: 'recommendation',
      knowledgeBaseBooks: sources.length,
      avgRelevance: sources.length > 0 ? Math.round(sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length * 100) : 0,
      combinesAvailableAndGeneral: true
    },
    directResponse: finalResponse
  }
}

async function handleHybridQuery(message: string, classification: QueryClassification, supabase: any) {
  console.log('🔄 Handling hybrid query (knowledge base + general knowledge)')
  
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
      responseType: 'hybrid',
      hasKnowledgeBaseContent: contextFromKnowledgeBase.length > 0,
      combinesRetrievedAndGeneral: true,
      sourcesCount: sources.length,
      avgRelevance: sources.length > 0 ? Math.round(sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length * 100) : 0
    },
    directResponse: finalResponse
  }
}

async function handleDirectQuestion(message: string) {
  console.log('💭 Handling direct knowledge question')
  
  const systemPrompt = `You are a helpful assistant providing advice based on general knowledge. The user has specifically asked for general advice/knowledge.

User Question: ${message}`

  const response = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ])

  return {
    contextForAI: 'Direct knowledge response (no knowledge base search)',
    sources: [],
    metadata: {
      responseType: 'direct_knowledge',
      usedKnowledgeBase: false
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
      case 'catalog_browse':
        result = await handleCatalogBrowse(queryToUse, classification, supabase)
        response = await generateChatCompletion([
          { role: 'system', content: `You are a helpful assistant. ${result.contextForAI}\n\nProvide a clear response based on the content above.` },
          { role: 'user', content: queryToUse }
        ])
        break

      case 'recommendation':
        result = await handleRecommendation(queryToUse, classification, supabase)
        response = result.directResponse
        break

      case 'direct_question':
        result = await handleDirectQuestion(queryToUse)
        response = result.directResponse
        break

      case 'specific_search':
      case 'hybrid':
      default:
        // Default to hybrid approach
        result = await handleHybridQuery(queryToUse, classification, supabase)
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
      method: 'simplified_unified_routing'
    })

  } catch (error) {
    console.error('❌ Error in unified chat API:', error)
    return NextResponse.json(
      { error: 'Chat error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}

 