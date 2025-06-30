import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateChatCompletion, generateEmbedding } from '@/lib/openai'

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
    // Look for the most recent system response for context
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const historyItem = chatHistory[i]
      if (historyItem.role === 'assistant' && historyItem.content) {
        const content = historyItem.content.toLowerCase()
        
        // If the previous response mentioned books, assume they want another book
        if (content.includes('book') || content.includes('author') || content.includes('recommend')) {
          return `${message} (referring to: recommend another book similar to the previous recommendation)`
        }
        break
      }
    }
    return `${message} (contextual request - provide another recommendation or continue from previous topic)`
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

  // Direct knowledge questions for general advice
  if (/\b(from\s+your\s+own\s+knowledge|give\s+me\s+advice|advice\s+on)\b/i.test(message) &&
      !/\b(book|document|uploaded|only)\b/i.test(message)) {
    return {
      type: 'direct_question',
      confidence: 0.85,
      reasoning: 'User explicitly asking for general advice/knowledge',
      contentFilter
    }
  }

  // Default to hybrid - check knowledge base first, supplement with general knowledge
  return {
    type: 'hybrid',
    confidence: 0.80,
    reasoning: 'Default hybrid approach - check knowledge base and supplement with general knowledge',
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

  const contextForAI = `AVAILABLE ${classification.contentFilter?.toUpperCase() || 'CONTENT'} 

I have ${allItems.length} ${classification.contentFilter || 'items'} in my knowledge base:

${allItems.slice(0, 20).map((item, i) => 
    `${i + 1}. "${item.title}" by ${item.author}
     Type: ${item.doc_type} | Genre: ${item.genre || 'N/A'} | Topic: ${item.topic || 'N/A'}
     Summary: ${item.summary || 'No summary available'}`
  ).join('\n\n')}

${allItems.length > 20 ? `\n... and ${allItems.length - 20} more items available` : ''}

Present this in a clear, helpful way for the user.`

  return {
    contextForAI,
    sources: allItems.slice(0, 5).map(item => ({
      title: item.title,
      author: item.author,
      doc_type: item.doc_type,
      content: item.content_chunks[0]?.substring(0, 300) || ''
    })),
    metadata: {
      totalItems: allItems.length,
      contentFilter: classification.contentFilter
    }
  }
}

async function handleRecommendation(message: string, classification: QueryClassification, supabase: any) {
  console.log('🎯 Handling recommendation request')
  
  // Get available content for recommendations
  const catalogResult = await handleCatalogBrowse(message, classification, supabase)

  const systemPrompt = `You are a knowledgeable advisor. The user is asking for book recommendations.

AVAILABLE CONTENT IN MY KNOWLEDGE BASE:
${catalogResult.contextForAI}

INSTRUCTIONS:
1. First recommend relevant items from my knowledge base above if available
2. Then provide additional general recommendations if helpful
3. Explain why each recommendation is valuable
4. Be specific about which recommendations come from my knowledge base vs general knowledge
5. If the user asks for "another one" or similar, provide different recommendations

User Request: ${message}`

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
    contextFromKnowledgeBase = vectorResults.map((doc: any, i: number) => 
      `SOURCE ${i + 1}: "${doc.title}" by ${doc.author || 'Unknown'}
Content: ${doc.content}`
    ).join('\n\n')

    sources = vectorResults.slice(0, 5).map((doc: any) => ({
      title: doc.title,
      author: doc.author,
      content: doc.content?.substring(0, 300) || '',
      similarity: doc.similarity
    }))
  }

  const systemPrompt = `You are a knowledgeable assistant with access to both a knowledge base and general knowledge.

${contextFromKnowledgeBase ? `RELEVANT CONTENT FROM MY KNOWLEDGE BASE:
${contextFromKnowledgeBase}

` : 'No specific relevant content found in my knowledge base. '} 

INSTRUCTIONS:
1. If I have relevant content in my knowledge base above, prioritize that information
2. Supplement with general knowledge if needed to provide a complete answer
3. Be clear about what comes from my knowledge base vs general knowledge
4. If no relevant knowledge base content, provide helpful general knowledge

User Question: ${message}`

  const response = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ])

  return {
    contextForAI: contextFromKnowledgeBase || 'No relevant knowledge base content found',
    sources,
    metadata: {
      responseType: 'hybrid',
      hasKnowledgeBaseContent: contextFromKnowledgeBase.length > 0,
      combinesRetrievedAndGeneral: true
    },
    directResponse: response
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

 