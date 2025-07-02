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
    // AI-POWERED DYNAMIC SEARCH ANALYSIS
    const analysis = await analyzeQueryForMetadata(message)
    console.log('🧠 AI Search Analysis:', analysis)
    
    let allCandidates: any[] = []
    
    // Step 1: Entity-focused search (people, companies, concepts)
    if (analysis.entities && analysis.entities.length > 0) {
      for (const entity of analysis.entities) {
        console.log(`🏢 Entity search: "${entity}"`)
        
        const { data: entityDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`title.ilike.%${entity}%,author.ilike.%${entity}%,tags.ilike.%${entity}%,summary.ilike.%${entity}%,content.ilike.%${entity}%`)
          .limit(8)
        
        if (entityDocs && entityDocs.length > 0) {
          const scoredDocs = entityDocs.map((doc: any) => ({
            ...doc,
            search_score: calculateEntityRelevance(doc, entity, message),
            match_reason: `Entity: ${entity}`,
            search_type: 'entity'
          }))
          allCandidates.push(...scoredDocs)
          console.log(`✅ Found ${entityDocs.length} docs for entity "${entity}"`)
        }
      }
    }
    
    // Step 2: Topic-focused search (dynamic topics from AI analysis)
    if (analysis.topics && analysis.topics.length > 0) {
      for (const topic of analysis.topics) {
        console.log(`📚 Topic search: "${topic}"`)
        
        const { data: topicDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`topic.ilike.%${topic}%,genre.ilike.%${topic}%,tags.ilike.%${topic}%,title.ilike.%${topic}%,summary.ilike.%${topic}%`)
          .limit(8)
        
        if (topicDocs && topicDocs.length > 0) {
          const scoredDocs = topicDocs.map((doc: any) => ({
            ...doc,
            search_score: calculateTopicRelevance(doc, topic, message, analysis),
            match_reason: `Topic: ${topic}`,
            search_type: 'topic'
          }))
          allCandidates.push(...scoredDocs)
          console.log(`✅ Found ${topicDocs.length} docs for topic "${topic}"`)
        }
      }
    }
    
    // Step 3: Genre/document type search
    if (analysis.genres && analysis.genres.length > 0) {
      for (const genre of analysis.genres) {
        const { data: genreDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`genre.ilike.%${genre}%,doc_type.ilike.%${genre}%`)
          .limit(6)
        
        if (genreDocs && genreDocs.length > 0) {
          const scoredDocs = genreDocs.map((doc: any) => ({
            ...doc,
            search_score: calculateGenreRelevance(doc, genre, analysis),
            match_reason: `Genre: ${genre}`,
            search_type: 'genre'
          }))
          allCandidates.push(...scoredDocs)
        }
      }
    }
    
    // Step 4: Full-text search as comprehensive backup
    const searchTerms = [
      ...(analysis.entities || []), 
      ...(analysis.topics || []), 
      ...(analysis.genres || [])
    ].filter(term => term.length > 2)
    
    if (searchTerms.length > 0) {
      const searchQuery = searchTerms.join(' | ') // OR search
      
      const { data: fullTextDocs } = await supabase
        .from('documents_enhanced')
        .select('*')
        .textSearch('title,summary,tags,topic,genre,content', searchQuery)
        .limit(12)
      
      if (fullTextDocs && fullTextDocs.length > 0) {
        const scoredDocs = fullTextDocs.map((doc: any) => ({
          ...doc,
          search_score: calculateFullTextRelevance(doc, searchTerms, message),
          match_reason: `Full-text search`,
          search_type: 'fulltext'
        }))
        allCandidates.push(...scoredDocs)
        console.log(`✅ Full-text search found ${fullTextDocs.length} additional docs`)
      }
    }
    
    // Step 5: Vector search for semantic understanding
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
        match_reason: `Semantic: ${Math.round((doc.similarity || 0) * 100)}%`,
        search_type: 'vector'
      }))
      allCandidates.push(...vectorDocs)
    }
    
    // Step 6: Advanced deduplication and ranking
    const sourcesMap = new Map()
    
    allCandidates.forEach((doc: any) => {
      if (!doc.title) return

      const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
      
      // Combine scores for multi-match documents
      if (sourcesMap.has(bookKey)) {
        const existing = sourcesMap.get(bookKey)
        const combinedScore = Math.max(existing.search_score, doc.search_score) * 1.15 // Boost for multiple matches
        const combinedReason = `${existing.match_reason} + ${doc.match_reason}`
        
        sourcesMap.set(bookKey, {
          ...existing,
          search_score: Math.min(1.0, combinedScore),
          match_reason: combinedReason,
          search_type: 'multi_match'
        })
      } else {
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
        // Prioritize multi-matches and entity/topic matches
        const aPriority = a.search_type === 'multi_match' ? 3 : 
                         (a.search_type === 'entity' || a.search_type === 'topic') ? 2 : 1
        const bPriority = b.search_type === 'multi_match' ? 3 : 
                         (b.search_type === 'entity' || b.search_type === 'topic') ? 2 : 1
        
        if (aPriority !== bPriority) return bPriority - aPriority
        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, 10)

    console.log(`🎯 Search results: ${sources.length} relevant sources`)
    sources.forEach((source, i) => {
      console.log(`${i+1}. "${source.title}" - ${source.match_reason} (${Math.round((source.similarity || 0) * 100)}%)`)
    })

    contextForAI = `SEARCH RESULTS FOR: "${message}"
Found ${sources.length} relevant sources using AI-powered analysis:

AI Analysis: ${JSON.stringify(analysis, null, 2)}

${sources.map((doc: any, i: number) => 
  `SOURCE ${i + 1}: "${doc.title}" by ${doc.author} (${doc.match_reason})
Genre: ${doc.genre || 'N/A'} | Topic: ${doc.topic || 'N/A'} | Difficulty: ${doc.difficulty || 'N/A'}
Search Type: ${doc.search_type} | Tags: ${doc.tags || 'N/A'}
Content: ${doc.content}`
).join('\n\n')}`

  } catch (error) {
    console.error('❌ Error in AI-powered search:', error)
    contextForAI = `Error occurred during intelligent search for: "${message}"`
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

// Relevance calculation functions for AI-powered search
function calculateEntityRelevance(doc: any, entity: string, query: string): number {
  let score = 0.5
  const entityLower = entity.toLowerCase()
  
  // Higher score for exact matches in important fields
  if (doc.title?.toLowerCase().includes(entityLower)) score += 0.3
  if (doc.author?.toLowerCase().includes(entityLower)) score += 0.25  
  if (doc.tags?.toLowerCase().includes(entityLower)) score += 0.2
  if (doc.summary?.toLowerCase().includes(entityLower)) score += 0.15
  
  return Math.min(1.0, score)
}

function calculateTopicRelevance(doc: any, topic: string, query: string, analysis: any): number {
  let score = 0.5
  const topicLower = topic.toLowerCase()
  
  // Higher score for exact topic matches
  if (doc.topic?.toLowerCase().includes(topicLower)) score += 0.3
  if (doc.genre?.toLowerCase().includes(topicLower)) score += 0.25
  if (doc.title?.toLowerCase().includes(topicLower)) score += 0.2
  if (doc.tags?.toLowerCase().includes(topicLower)) score += 0.15
  if (doc.summary?.toLowerCase().includes(topicLower)) score += 0.1
  
  return Math.min(1.0, score)
}

function calculateGenreRelevance(doc: any, genre: string, analysis: any): number {
  let score = 0.6
  const genreLower = genre.toLowerCase()
  
  // Direct genre/doc_type matches
  if (doc.genre?.toLowerCase().includes(genreLower)) score += 0.3
  if (doc.doc_type?.toLowerCase().includes(genreLower)) score += 0.25
  
  return Math.min(1.0, score)
}

function calculateFullTextRelevance(doc: any, searchTerms: string[], query: string): number {
  let score = 0.4
  const docText = `${doc.title} ${doc.summary} ${doc.tags} ${doc.topic} ${doc.genre}`.toLowerCase()
  
  // Score based on how many search terms are found
  const foundTerms = searchTerms.filter(term => docText.includes(term.toLowerCase()))
  score += (foundTerms.length / searchTerms.length) * 0.4
  
  return Math.min(1.0, score)
}

// Helper function for AI-powered query analysis
async function analyzeQueryForMetadata(query: string): Promise<{
  entities: string[]
  topics: string[]
  document_types: string[]
  difficulty_preference: string
  genres: string[]
  search_intent: string
  search_strategy: string
}> {
  const analysisPrompt = `Analyze this query to extract search criteria for a business/philosophy knowledge base:

Query: "${query}"

Extract the following if present:
1. ENTITIES: People names, company names, specific concepts
2. TOPICS: Subject areas, domains, themes (any topic, not limited to predefined list)
3. DOCUMENT_TYPES: Books, articles, reports, videos, etc.
4. DIFFICULTY: Beginner, intermediate, advanced, expert level preference
5. GENRES: Any relevant genres or categories
6. INTENT: What type of information is being sought

Respond in JSON format:
{
  "entities": ["list of specific names/companies/concepts"],
  "topics": ["list of subject areas - extract ANY topics mentioned"], 
  "document_types": ["preferred document types"],
  "difficulty_preference": "beginner|intermediate|advanced|expert|any",
  "genres": ["relevant genres"],
  "search_intent": "recommendation|search|factual|analytical",
  "search_strategy": "entity_focused|topic_focused|broad_exploration"
}`

  try {
    const response = await generateChatCompletion([
      { role: 'system', content: analysisPrompt },
      { role: 'user', content: query }
    ])
    
    const analysis = JSON.parse(response)
    console.log('🧠 AI Query Analysis:', analysis)
    return analysis
    
  } catch (error) {
    console.warn('Query analysis failed, using fallback:', error)
    // Fallback: extract words as potential topics
    const words = query.toLowerCase().replace(/[^\w\s]/g, '').split(' ').filter(w => w.length > 3)
    return {
      entities: [],
      topics: words,
      document_types: [],
      difficulty_preference: "any",
      genres: [],
      search_intent: "factual",
      search_strategy: "broad_exploration"
    }
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
  
  // AI-POWERED DYNAMIC METADATA SEARCH
  let sources: any[] = []
  let contextForAI = ''

  try {
    // Step 1: Use AI to analyze the query and extract search criteria
    const analysis = await analyzeQueryForMetadata(message)
    
    let allCandidates: any[] = []
    
    // Step 2: Entity-focused search (people, companies, concepts)
    if (analysis.entities && analysis.entities.length > 0) {
      for (const entity of analysis.entities) {
        console.log(`🏢 Entity search: "${entity}"`)
        
        const { data: entityDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`title.ilike.%${entity}%,author.ilike.%${entity}%,tags.ilike.%${entity}%,summary.ilike.%${entity}%`)
          .limit(8)
        
        if (entityDocs && entityDocs.length > 0) {
          const scoredDocs = entityDocs.map((doc: any) => ({
            ...doc,
            metadata_score: calculateEntityRelevance(doc, entity, message),
            match_reason: `Entity match: ${entity}`,
            search_type: 'entity'
          }))
          allCandidates.push(...scoredDocs)
          console.log(`✅ Found ${entityDocs.length} docs for entity "${entity}"`)
        }
      }
    }
    
    // Step 3: Topic-focused search (dynamic topics from AI analysis)
    if (analysis.topics && analysis.topics.length > 0) {
      for (const topic of analysis.topics) {
        console.log(`📚 Topic search: "${topic}"`)
        
        const { data: topicDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`topic.ilike.%${topic}%,genre.ilike.%${topic}%,tags.ilike.%${topic}%,title.ilike.%${topic}%,summary.ilike.%${topic}%`)
          .limit(8)
        
        if (topicDocs && topicDocs.length > 0) {
          const scoredDocs = topicDocs.map((doc: any) => ({
            ...doc,
            metadata_score: calculateTopicRelevance(doc, topic, message, analysis),
            match_reason: `Topic match: ${topic}`,
            search_type: 'topic'
          }))
          allCandidates.push(...scoredDocs)
          console.log(`✅ Found ${topicDocs.length} docs for topic "${topic}"`)
        }
      }
    }
    
    // Step 4: Genre/document type filtering
    if (analysis.genres && analysis.genres.length > 0) {
      for (const genre of analysis.genres) {
        const { data: genreDocs } = await supabase
          .from('documents_enhanced')
          .select('*')
          .or(`genre.ilike.%${genre}%,doc_type.ilike.%${genre}%`)
          .limit(5)
        
        if (genreDocs && genreDocs.length > 0) {
          const scoredDocs = genreDocs.map((doc: any) => ({
            ...doc,
            metadata_score: calculateGenreRelevance(doc, genre, analysis),
            match_reason: `Genre match: ${genre}`,
            search_type: 'genre'
          }))
          allCandidates.push(...scoredDocs)
        }
      }
    }
    
    // Step 5: Full-text search as backup for any missed terms
    const searchTerms = [
      ...(analysis.entities || []), 
      ...(analysis.topics || []), 
      ...(analysis.genres || [])
    ].filter(term => term.length > 2)
    
    if (searchTerms.length > 0) {
      // Use PostgreSQL full-text search
      const searchQuery = searchTerms.join(' | ') // OR search
      
      const { data: fullTextDocs } = await supabase
        .from('documents_enhanced')
        .select('*')
        .textSearch('title,summary,tags,topic,genre', searchQuery)
        .limit(10)
      
      if (fullTextDocs && fullTextDocs.length > 0) {
        const scoredDocs = fullTextDocs.map((doc: any) => ({
          ...doc,
          metadata_score: calculateFullTextRelevance(doc, searchTerms, message),
          match_reason: `Full-text search`,
          search_type: 'fulltext'
        }))
        allCandidates.push(...scoredDocs)
        console.log(`✅ Full-text search found ${fullTextDocs.length} additional docs`)
      }
    }
    
    // Step 6: Vector search as semantic fallback
    if (allCandidates.length < 5) {
      console.log('🔍 Adding semantic vector search for broader coverage')
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
          match_reason: `Semantic similarity: ${Math.round((doc.similarity || 0) * 100)}%`,
          search_type: 'vector'
        }))
        allCandidates.push(...vectorDocs)
      }
    }
    
    // Step 7: Advanced deduplication and ranking
    const booksMap = new Map()
    
    allCandidates.forEach((doc: any) => {
      if (!doc.title) return

      const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
      
      // Skip if this book was already recommended
      if (previouslyRecommended.has(bookKey)) {
        console.log('⏭️ Skipping previously recommended book:', doc.title)
        return
      }
      
      // Combine scores for multi-match documents
      if (booksMap.has(bookKey)) {
        const existing = booksMap.get(bookKey)
        const combinedScore = Math.max(existing.metadata_score, doc.metadata_score) * 1.15 // Boost for multiple matches
        const combinedReason = `${existing.match_reason} + ${doc.match_reason}`
        
        booksMap.set(bookKey, {
          ...existing,
          metadata_score: Math.min(1.0, combinedScore),
          match_reason: combinedReason,
          search_type: 'multi_match'
        })
      } else {
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

    // Step 8: Smart ranking that prioritizes metadata matches
    sources = Array.from(booksMap.values())
      .sort((a, b) => {
        // Prioritize multi-matches and entity/topic matches
        const aPriority = a.search_type === 'multi_match' ? 3 : 
                         (a.search_type === 'entity' || a.search_type === 'topic') ? 2 : 1
        const bPriority = b.search_type === 'multi_match' ? 3 : 
                         (b.search_type === 'entity' || b.search_type === 'topic') ? 2 : 1
        
        if (aPriority !== bPriority) return bPriority - aPriority
        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, 8)

    console.log(`🎯 Final recommendations: ${sources.length} books`)
    sources.forEach((book, i) => {
      console.log(`${i+1}. "${book.title}" - ${book.match_reason} (${Math.round((book.similarity || 0) * 100)}%)`)
    })

    contextForAI = `BOOKS AVAILABLE FOR RECOMMENDATIONS (${sources.length} books found using AI-powered metadata analysis):

AI Analysis: ${JSON.stringify(analysis, null, 2)}

${sources.map((book, i) => 
  `${i + 1}. "${book.title}" by ${book.author} (${book.match_reason})
   Type: ${book.doc_type} | Genre: ${book.genre || 'N/A'} | Topic: ${book.topic || 'N/A'}
   Difficulty: ${book.difficulty || 'N/A'} | Search: ${book.search_type}
   Tags: ${book.tags || 'N/A'}
   Summary: ${book.summary || 'No summary available'}`
).join('\n\n')}`

  } catch (error) {
    console.error('❌ Error in AI-powered recommendation search:', error)
    contextForAI = 'Error occurred during intelligent book search.'
  }

  // Enhanced system prompt for follow-up recommendations
  const isFollowUpRequest = /\b(another\s+one|give\s+me\s+another|more|next|different|other)\b/i.test(message)
  const followUpNote = isFollowUpRequest ? 
    `\n\nIMPORTANT: This is a follow-up request for additional recommendations. The books listed above are NEW options that haven't been recommended before. Focus on these fresh recommendations and avoid repeating any previous suggestions.` : 
    ''

  const systemPrompt = `You are a knowledgeable book advisor with access to a personal library. I use advanced AI-powered search that dynamically analyzes queries to find the most relevant books based on entities, topics, genres, and semantic meaning.

${contextForAI}${followUpNote}

INSTRUCTIONS:
1. First recommend the most relevant books from my knowledge base above (prioritize "multi_match", "entity", and "topic" search results)
2. Pay special attention to books with multiple match types - these are highly relevant
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