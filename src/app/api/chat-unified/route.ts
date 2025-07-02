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
  
  let sources: any[] = []
  let contextForAI = ''

  try {
    // Enhanced metadata-aware search for topics
    const queryLower = message.toLowerCase()
    
    // Extract search terms
    const topicKeywords = ['coaching', 'leadership', 'management', 'ceo', 'executive', 'business', 'strategy', 'finance', 'investment', 'marketing', 'philosophy', 'psychology', 'hr', 'hiring', 'firing', 'performance', 'meetings', 'negotiation', 'sales']
    const matchedTopics = topicKeywords.filter(topic => queryLower.includes(topic))
    
    console.log('🔍 Extracted search topics:', matchedTopics)
    
    let allCandidates: any[] = []
    
    // Step 1: Direct metadata matching for search terms
    if (matchedTopics.length > 0) {
      for (const topic of matchedTopics) {
        console.log(`📚 Metadata search for: "${topic}"`)
        
        const { data: topicDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`topic.ilike.%${topic}%,genre.ilike.%${topic}%,tags.ilike.%${topic}%,title.ilike.%${topic}%,summary.ilike.%${topic}%`)
          .limit(10)
        
        if (topicDocs && topicDocs.length > 0) {
          const scoredDocs = topicDocs.map((doc: any) => ({
            ...doc,
            search_score: calculateSearchRelevance(doc, topic, message),
            match_reason: `Topic/Metadata match: ${topic}`,
            search_type: 'metadata'
          }))
          allCandidates.push(...scoredDocs)
          console.log(`✅ Found ${topicDocs.length} docs for topic "${topic}"`)
        }
      }
    }
    
    // Step 2: Keyword search in title/author
    const searchWords = message.toLowerCase().replace(/[^\w\s]/g, '').split(' ').filter(w => w.length > 2)
    for (const word of searchWords) {
      const { data: keywordDocs } = await supabase
        .from('documents_enhanced')
        .select('*')
        .or(`title.ilike.%${word}%,author.ilike.%${word}%,summary.ilike.%${word}%`)
        .limit(6)
      
      if (keywordDocs && keywordDocs.length > 0) {
        const scoredDocs = keywordDocs.map((doc: any) => ({
          ...doc,
          search_score: calculateKeywordRelevance(doc, word, message),
          match_reason: `Keyword match: ${word}`,
          search_type: 'keyword'
        }))
        allCandidates.push(...scoredDocs)
      }
    }
    
    // Step 3: Vector search for semantic matching
    const queryEmbedding = await generateEmbedding(message)
    const { data: vectorResults, error: vectorError } = await supabase.rpc(
      'match_documents_enhanced',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 12
      }
    )

    if (!vectorError && vectorResults && vectorResults.length > 0) {
      const vectorDocs = vectorResults.map((doc: any) => ({
        ...doc,
        search_score: doc.similarity || 0.5,
        match_reason: `Semantic similarity: ${Math.round((doc.similarity || 0) * 100)}%`,
        search_type: 'vector'
      }))
      allCandidates.push(...vectorDocs)
    }
    
    // Step 4: Deduplicate and rank results
    const sourcesMap = new Map()
    
    allCandidates.forEach((doc: any) => {
      if (!doc.title) return

      const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
      
      // Keep the highest scoring version
      if (!sourcesMap.has(bookKey) || (doc.search_score > (sourcesMap.get(bookKey)?.search_score || 0))) {
        sourcesMap.set(bookKey, {
          title: doc.title,
          author: doc.author || 'Unknown Author',
          content: doc.content || '',
          doc_type: doc.doc_type,
          genre: doc.genre,
          topic: doc.topic,
          difficulty: doc.difficulty,
          tags: doc.tags,
          summary: doc.summary,
          similarity: doc.search_score,
          match_reason: doc.match_reason,
          search_type: doc.search_type,
          page_number: extractPageFromContent(doc.content)
        })
      }
    })

    sources = Array.from(sourcesMap.values())
      .sort((a, b) => {
        // Prioritize metadata matches, then by score
        if (a.search_type === 'metadata' && b.search_type !== 'metadata') return -1
        if (b.search_type === 'metadata' && a.search_type !== 'metadata') return 1
        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, 10)

    console.log(`🎯 Search results: ${sources.length} relevant sources`)
    sources.forEach((source, i) => {
      console.log(`${i+1}. "${source.title}" - ${source.match_reason} (${Math.round((source.similarity || 0) * 100)}%)`)
    })

    contextForAI = `SEARCH RESULTS FOR: "${message}"
Found ${sources.length} relevant sources using metadata + semantic search:

${sources.map((doc: any, i: number) => 
  `SOURCE ${i + 1}: "${doc.title}" by ${doc.author} (${doc.match_reason})
Genre: ${doc.genre || 'N/A'} | Topic: ${doc.topic || 'N/A'} | Difficulty: ${doc.difficulty || 'N/A'}
Search Type: ${doc.search_type} | Tags: ${doc.tags || 'N/A'}
Content: ${doc.content}`
).join('\n\n')}`

  } catch (error) {
    console.error('❌ Error in enhanced search:', error)
    contextForAI = `Error occurred during search for: "${message}"`
  }

  return {
    contextForAI,
    sources,
    metadata: {
      responseType: 'search',
      searchQuery: message,
      sourcesFound: sources.length,
      avgRelevance: sources.length > 0 ? Math.round(sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length * 100) : 0,
      searchTypes: sources.reduce((acc, s) => {
        acc[s.search_type] = (acc[s.search_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    },
    directResponse: null // Will be generated by main handler
  }
}

// Helper function for search relevance calculation
function calculateSearchRelevance(doc: any, topic: string, query: string): number {
  let score = 0.7 // Base score for search match
  
  const topicLower = topic.toLowerCase()
  const queryLower = query.toLowerCase()
  
  // Exact topic field match (highest relevance)
  if ((doc.topic || '').toLowerCase().includes(topicLower)) score += 0.4
  
  // Genre match
  if ((doc.genre || '').toLowerCase().includes(topicLower)) score += 0.3
  
  // Tags match
  if ((doc.tags || '').toLowerCase().includes(topicLower)) score += 0.25
  
  // Title relevance (very important for search)
  if ((doc.title || '').toLowerCase().includes(topicLower)) score += 0.35
  
  // Summary relevance
  if ((doc.summary || '').toLowerCase().includes(topicLower)) score += 0.2
  
  // Content preview relevance
  if ((doc.content || '').toLowerCase().includes(topicLower)) score += 0.15
  
  return Math.min(1.0, score)
}

// Helper function for keyword relevance
function calculateKeywordRelevance(doc: any, keyword: string, query: string): number {
  let score = 0.5 // Base score for keyword match
  
  const title = (doc.title || '').toLowerCase()
  const author = (doc.author || '').toLowerCase()
  const summary = (doc.summary || '').toLowerCase()
  
  // Title match is most important for search
  if (title.includes(keyword)) score += 0.4
  
  // Author match
  if (author.includes(keyword)) score += 0.25
  
  // Summary match
  if (summary.includes(keyword)) score += 0.2
  
  // Exact word matches get bonus
  if (title.split(' ').includes(keyword)) score += 0.25
  if (author.split(' ').includes(keyword)) score += 0.2
  
  return Math.min(1.0, score)
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
  
  // ENHANCED METADATA-AWARE SEARCH
  let sources: any[] = []
  let contextForAI = ''

  try {
    // Step 1: Extract key terms for metadata matching
    const queryLower = message.toLowerCase()
    
    // Extract key topics and entities from the query
    const topicKeywords = ['coaching', 'leadership', 'management', 'ceo', 'executive', 'business', 'strategy', 'finance', 'investment', 'marketing', 'philosophy', 'psychology', 'hr', 'hiring', 'firing', 'performance']
    const difficultyKeywords = ['beginner', 'basic', 'intro', 'advanced', 'expert', 'intermediate']
    
    const matchedTopics = topicKeywords.filter(topic => queryLower.includes(topic))
    const matchedDifficulty = difficultyKeywords.find(diff => queryLower.includes(diff))
    
    console.log('🔍 Extracted topics:', matchedTopics)
    console.log('📊 Difficulty preference:', matchedDifficulty)
    
    // Step 2: Multi-layered search approach
    let allCandidates: any[] = []
    
    // A. Direct metadata matching (highest priority)
    if (matchedTopics.length > 0) {
      for (const topic of matchedTopics) {
        console.log(`📚 Metadata search for topic: "${topic}"`)
        
        const { data: topicDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`topic.ilike.%${topic}%,genre.ilike.%${topic}%,tags.ilike.%${topic}%,title.ilike.%${topic}%,summary.ilike.%${topic}%`)
          .limit(8)
        
        if (topicDocs && topicDocs.length > 0) {
          const scoredDocs = topicDocs.map((doc: any) => ({
            ...doc,
            metadata_score: calculateMetadataRelevance(doc, topic, message, matchedDifficulty),
            match_reason: `Topic match: ${topic}`,
            search_type: 'metadata'
          }))
          allCandidates.push(...scoredDocs)
          console.log(`✅ Found ${topicDocs.length} docs for topic "${topic}"`)
        }
      }
    }
    
    // B. Title and author fuzzy matching
    const keyWords = message.toLowerCase().replace(/[^\w\s]/g, '').split(' ').filter(w => w.length > 2)
    for (const word of keyWords) {
      const { data: titleDocs } = await supabase
        .from('documents_enhanced')
        .select('*')
        .or(`title.ilike.%${word}%,author.ilike.%${word}%`)
        .limit(5)
      
      if (titleDocs && titleDocs.length > 0) {
        const scoredDocs = titleDocs.map((doc: any) => ({
          ...doc,
          metadata_score: calculateTitleRelevance(doc, word, message),
          match_reason: `Title/Author match: ${word}`,
          search_type: 'title'
        }))
        allCandidates.push(...scoredDocs)
      }
    }
    
    // C. Vector search as fallback/supplement
    const queryEmbedding = await generateEmbedding(message)
    const { data: vectorResults, error: vectorError } = await supabase.rpc(
      'match_documents_enhanced',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.1,
        match_count: 15
      }
    )
    
    if (!vectorError && vectorResults && vectorResults.length > 0) {
      const vectorDocs = vectorResults.map((doc: any) => ({
        ...doc,
        metadata_score: doc.similarity || 0.5,
        match_reason: `Vector similarity: ${Math.round((doc.similarity || 0) * 100)}%`,
        search_type: 'vector'
      }))
      allCandidates.push(...vectorDocs)
    }
    
    // Step 3: Deduplicate and score books
    const booksMap = new Map()
    
    allCandidates.forEach((doc: any) => {
      if (!doc.title) return

      const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
      
      // Skip if this book was already recommended
      if (previouslyRecommended.has(bookKey)) {
        console.log('⏭️ Skipping previously recommended book:', doc.title)
        return
      }
      
      // Keep the highest scoring version of each book
      if (!booksMap.has(bookKey) || (doc.metadata_score > (booksMap.get(bookKey)?.metadata_score || 0))) {
        booksMap.set(bookKey, {
          title: doc.title,
          author: doc.author || 'Unknown Author',
          content: doc.content || '',
          doc_type: doc.doc_type,
          genre: doc.genre,
          topic: doc.topic,
          difficulty: doc.difficulty,
          summary: doc.summary,
          tags: doc.tags,
          similarity: doc.metadata_score,
          match_reason: doc.match_reason,
          search_type: doc.search_type,
          page_number: extractPageFromContent(doc.content)
        })
      }
    })

    // Step 4: Rank and select best recommendations
    sources = Array.from(booksMap.values())
      .sort((a, b) => {
        // Prioritize metadata matches over vector matches
        if (a.search_type === 'metadata' && b.search_type !== 'metadata') return -1
        if (b.search_type === 'metadata' && a.search_type !== 'metadata') return 1
        
        // Then by score
        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, 8)

    console.log(`🎯 Final recommendations: ${sources.length} books`)
    sources.forEach((book, i) => {
      console.log(`${i+1}. "${book.title}" - ${book.match_reason} (${Math.round((book.similarity || 0) * 100)}%)`)
    })

    contextForAI = `BOOKS AVAILABLE FOR RECOMMENDATIONS (${sources.length} books found using metadata + vector search):

${sources.map((book, i) => 
  `${i + 1}. "${book.title}" by ${book.author} (${book.match_reason})
   Type: ${book.doc_type} | Genre: ${book.genre || 'N/A'} | Topic: ${book.topic || 'N/A'}
   Difficulty: ${book.difficulty || 'N/A'} | Search: ${book.search_type}
   Tags: ${book.tags || 'N/A'}
   Summary: ${book.summary || 'No summary available'}`
).join('\n\n')}`

  } catch (error) {
    console.error('❌ Error in enhanced recommendation search:', error)
    contextForAI = 'Error occurred during book search.'
  }

  // Enhanced system prompt for follow-up recommendations
  const isFollowUpRequest = /\b(another\s+one|give\s+me\s+another|more|next|different|other)\b/i.test(message)
  const followUpNote = isFollowUpRequest ? 
    `\n\nIMPORTANT: This is a follow-up request for additional recommendations. The books listed above are NEW options that haven't been recommended before. Focus on these fresh recommendations and avoid repeating any previous suggestions.` : 
    ''

  const systemPrompt = `You are a knowledgeable book advisor with access to a personal library. I use advanced metadata-aware search that matches books based on title, topic, genre, tags, and content relevance.

${contextForAI}${followUpNote}

INSTRUCTIONS:
1. First recommend the most relevant books from my knowledge base above (prioritize "metadata" search results as they are most precise)
2. Pay special attention to books marked with "Topic match" or "Title/Author match" - these are exact metadata matches
3. Explain why each recommendation is valuable and relevant to the request
4. Include specific details about the books (genre, difficulty, key topics, tags)
5. Then provide 2-3 additional general recommendations if helpful
6. Be clear about which recommendations come from my knowledge base vs general knowledge
7. ${isFollowUpRequest ? 'Since this is a follow-up request, provide DIFFERENT books than any previous recommendations' : 'Provide your best recommendations for this request'}

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
      isFollowUpRequest,
      searchTypes: sources.reduce((acc, s) => {
        acc[s.search_type] = (acc[s.search_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    },
    directResponse: finalResponse
  }
}

// Helper function to calculate metadata relevance
function calculateMetadataRelevance(doc: any, topic: string, query: string, difficulty?: string): number {
  let score = 0.6 // Base score for metadata match
  
  const topicLower = topic.toLowerCase()
  const queryLower = query.toLowerCase()
  
  // Topic field exact match (highest relevance)
  if ((doc.topic || '').toLowerCase().includes(topicLower)) score += 0.35
  
  // Genre match
  if ((doc.genre || '').toLowerCase().includes(topicLower)) score += 0.25
  
  // Tags match
  if ((doc.tags || '').toLowerCase().includes(topicLower)) score += 0.2
  
  // Title relevance
  if ((doc.title || '').toLowerCase().includes(topicLower)) score += 0.3
  
  // Summary relevance
  if ((doc.summary || '').toLowerCase().includes(topicLower)) score += 0.15
  
  // Difficulty alignment bonus
  if (difficulty && (doc.difficulty || '').toLowerCase().includes(difficulty.toLowerCase())) {
    score += 0.1
  }
  
  // Multi-word query bonus
  const queryWords = queryLower.split(' ').filter(w => w.length > 2)
  const matchingWords = queryWords.filter(word => 
    (doc.title || '').toLowerCase().includes(word) ||
    (doc.topic || '').toLowerCase().includes(word) ||
    (doc.tags || '').toLowerCase().includes(word)
  ).length
  
  if (matchingWords > 1) {
    score += 0.1 * matchingWords
  }
  
  return Math.min(1.0, score)
}

// Helper function to calculate title/author relevance
function calculateTitleRelevance(doc: any, word: string, query: string): number {
  let score = 0.4 // Base score for title/author match
  
  const title = (doc.title || '').toLowerCase()
  const author = (doc.author || '').toLowerCase()
  
  if (title.includes(word)) score += 0.4
  if (author.includes(word)) score += 0.3
  
  // Bonus for exact word matches
  const titleWords = title.split(' ')
  const authorWords = author.split(' ')
  
  if (titleWords.includes(word)) score += 0.2
  if (authorWords.includes(word)) score += 0.15
  
  return Math.min(1.0, score)
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

 