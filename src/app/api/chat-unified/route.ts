import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateChatCompletion, generateEmbedding } from '@/lib/openai'
import { CitationFormatter } from '@/lib/citation-formatter'
import { getRelevantFeedback } from '@/lib/feedback'

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

// Helper function to add feedback context to system prompts
function addFeedbackContext(systemPrompt: string, relevantFeedback: any[]): string {
  if (!relevantFeedback || relevantFeedback.length === 0) {
    return systemPrompt
  }

  const feedbackContext = "\n\n🔄 LEARNING FROM USER FEEDBACK:\nUsers have provided the following corrections to improve responses for similar queries:\n"
  const feedbackDetails = relevantFeedback.map((feedback: any, index: number) => {
    return `${index + 1}. Past query: "${feedback.user_query}"\n   User correction: "${feedback.comment}"\n   Feedback type: ${feedback.feedback_type}`
  }).join('\n\n')
  
  const instructions = "\n\n✅ IMPORTANT: Please take these user corrections into account to provide a better response. Learn from past feedback to avoid repeating issues.\n"
  
  return systemPrompt + feedbackContext + feedbackDetails + instructions
}

// Enhanced message with conversation context using AI analysis
async function enhanceMessageWithContext(message: string, chatHistory: any[] = []): Promise<string> {
  const queryLower = message.toLowerCase()
  
  // Handle context-dependent queries using AI
  if (/\b(another\s+one|more|next|continue|similar|like\s+that|give\s+me\s+another)\b/i.test(message)) {
    
    if (chatHistory.length === 0) {
      return message // No context available
    }
    
    // Get recent conversation context
    const recentHistory = chatHistory.slice(-6) // Last 6 messages for context
    const conversationContext = recentHistory.map((msg: any) => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n')
    
    console.log('🧠 Using AI to analyze follow-up context...')
    
    try {
      const contextAnalysisPrompt = `You are analyzing a conversation to understand what the user wants when they say "${message}".

CONVERSATION CONTEXT:
${conversationContext}

Current user message: "${message}"

The user is making a follow-up request. Analyze the conversation and determine:
1. What was the user's original request about?
2. What specific topic/subject were they interested in?
3. What type of request is this follow-up (recommendation, catalog browsing, search)?

Based on your analysis, create an enhanced query that preserves the original intent and topic.

EXAMPLES:
- If they asked for "book on coaching" and now say "another one please" → "recommend another book about coaching"
- If they asked for "leadership books" and say "more please" → "recommend more books about leadership"  
- If they browsed "business books" and say "show me more" → "show me more business books from my knowledge base"

Respond with ONLY the enhanced query (no explanation):`

      const enhancedQuery = await generateChatCompletion([
        { role: 'system', content: contextAnalysisPrompt },
        { role: 'user', content: message }
      ])
      
      const cleanEnhanced = enhancedQuery.trim().replace(/^["']|["']$/g, '') // Remove quotes if present
      console.log('✅ AI-enhanced query:', cleanEnhanced)
      
      return cleanEnhanced
      
    } catch (error) {
      console.error('❌ AI context analysis failed:', error)
      // Fallback to simpler context detection
      const lastUserMessage = chatHistory.filter(h => h.role === 'user').slice(-1)[0]?.content || ''
      const lastAssistantMessage = chatHistory.filter(h => h.role === 'assistant').slice(-1)[0]?.content || ''
      
      // Simple fallback logic
      if (lastAssistantMessage.toLowerCase().includes('recommend') || 
          /\b(book|suggest|recommend)\b/i.test(lastUserMessage)) {
        return `${message} (referring to: recommend another book similar to the previous recommendation)`
      }
      
      return `${message} (contextual request - continue from previous topic)`
    }
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

// Multi-Stage Hierarchical Search Implementation
async function hierarchicalChunkSearch(query: string, supabase: any): Promise<{
  chunks: any[]
  searchStages: any
  totalRelevanceScore: number
}> {
  console.log('🏗️ Starting Multi-Stage Hierarchical Search for:', query)
  
  const analysis = await analyzeQueryForMetadata(query)
  const allCandidates = new Map() // Use Map to avoid duplicates
  const stageResults = {
    stage1_structure: 0,
    stage2_semantic: 0, 
    stage3_density: 0,
    total_unique: 0
  }

  // STAGE 1: Content Structure Search
  // Look for chapter titles, section headers, and structural elements
  console.log('📖 STAGE 1: Content Structure Search')
  
  const structuralTerms = [
    ...analysis.topics.map((t: string) => t.toLowerCase()),
    ...analysis.entities.map((e: string) => e.toLowerCase()),
    query.toLowerCase()
  ].filter(term => term.length > 3)

  for (const term of structuralTerms) {
    // Search for structural content like "Chapter X: [term]", "Section on [term]", etc.
    const structuralPatterns = [
      `chapter%${term}%`,
      `section%${term}%`, 
      `part%${term}%`,
      `${term}%chapter`,
      `${term}%section`,
      `introduction%${term}%`,
      `conclusion%${term}%`
    ]

    for (const pattern of structuralPatterns) {
      const { data: structuralChunks } = await supabase
        .from('documents_enhanced')
        .select('*')
        .ilike('content', pattern)
        .limit(5)

      if (structuralChunks && structuralChunks.length > 0) {
        structuralChunks.forEach((chunk: any) => {
          const chunkKey = `${chunk.id}`
          if (!allCandidates.has(chunkKey)) {
            allCandidates.set(chunkKey, {
              ...chunk,
              relevance_score: 0.95, // High score for structural matches
              match_reason: `Structural content: ${term}`,
              search_stage: 'structure',
              content_type: 'structural'
            })
            stageResults.stage1_structure++
          }
        })
      }
    }
  }

  // STAGE 2: Enhanced Chunk-Level Semantic Search
  console.log('🔍 STAGE 2: Enhanced Chunk-Level Semantic Search')
  
  try {
    const queryEmbedding = await generateEmbedding(query)
    const { data: semanticChunks, error: vectorError } = await supabase.rpc(
      'match_documents_enhanced',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.1,
        match_count: 20
      }
    )

    if (!vectorError && semanticChunks && semanticChunks.length > 0) {
      semanticChunks.forEach((chunk: any) => {
        const chunkKey = `${chunk.id}`
        if (!allCandidates.has(chunkKey)) {
          allCandidates.set(chunkKey, {
            ...chunk,
            relevance_score: chunk.similarity || 0.5,
            match_reason: `Semantic similarity: ${Math.round((chunk.similarity || 0) * 100)}%`,
            search_stage: 'semantic',
            content_type: 'semantic'
          })
          stageResults.stage2_semantic++
        } else {
          // Boost score for chunks found in multiple stages
          const existing = allCandidates.get(chunkKey)
          existing.relevance_score = Math.min(1.0, existing.relevance_score + 0.2)
          existing.match_reason += ` + Semantic match`
          existing.search_stage = 'multi_stage'
        }
      })
    }
  } catch (error) {
    console.error('❌ Semantic search error:', error)
  }

  // STAGE 3: Content Density Analysis
  console.log('🎯 STAGE 3: Content Density Analysis')
  
  // For chunks already found, analyze content density for better ranking
  const searchTerms = [
    ...analysis.topics,
    ...analysis.entities,
    ...query.split(' ').filter(w => w.length > 3)
  ].map(t => t.toLowerCase())

  allCandidates.forEach((chunk, chunkKey) => {
    const content = (chunk.content || '').toLowerCase()
    const contentWords = content.split(/\s+/)
    
    // Calculate density metrics
    let termFrequency = 0
    let termDensity = 0
    let topicFocus = 0

    searchTerms.forEach(term => {
      const termCount = (content.match(new RegExp(term, 'gi')) || []).length
      termFrequency += termCount
      
      // Check if this chunk seems focused on the topic
      if (termCount > 2) {
        topicFocus += 1
      }
    })

    termDensity = contentWords.length > 0 ? termFrequency / contentWords.length : 0

    // Bonus scoring for high-density content
    if (termDensity > 0.01) { // More than 1% of words are relevant terms
      chunk.relevance_score = Math.min(1.0, chunk.relevance_score + 0.15)
      chunk.match_reason += ` + High density (${(termDensity * 100).toFixed(1)}%)`
      stageResults.stage3_density++
    }

    if (topicFocus > 2) { // Multiple terms appear frequently
      chunk.relevance_score = Math.min(1.0, chunk.relevance_score + 0.1)
      chunk.match_reason += ` + Topic focused`
    }

    // Add density metrics to chunk
    chunk.density_metrics = {
      term_frequency: termFrequency,
      term_density: termDensity,
      topic_focus: topicFocus,
      content_length: contentWords.length
    }
  })

  const finalChunks = Array.from(allCandidates.values())
    .sort((a, b) => {
      // Multi-stage chunks get priority
      if (a.search_stage === 'multi_stage' && b.search_stage !== 'multi_stage') return -1
      if (b.search_stage === 'multi_stage' && a.search_stage !== 'multi_stage') return 1
      
      // Then by relevance score
      return (b.relevance_score || 0) - (a.relevance_score || 0)
    })
    .slice(0, 12) // Get top 12 most relevant chunks

  stageResults.total_unique = finalChunks.length
  
  const avgRelevance = finalChunks.length > 0 
    ? finalChunks.reduce((sum, chunk) => sum + (chunk.relevance_score || 0), 0) / finalChunks.length 
    : 0

  console.log('🎯 Hierarchical Search Results:', stageResults)
  console.log(`📊 Average Relevance: ${(avgRelevance * 100).toFixed(1)}%`)
  
  return {
    chunks: finalChunks,
    searchStages: stageResults,
    totalRelevanceScore: avgRelevance
  }
}

async function handleSearch(message: string, classification: QueryClassification, supabase: any) {
  console.log('🔍 Handling search with Multi-Stage Hierarchical Search')
  
  let sources: any[] = []
  let contextForAI = ''

  try {
    // Use the new hierarchical search system
    const searchResults = await hierarchicalChunkSearch(message, supabase)
    
    // Group chunks by document for better organization
    const documentsMap = new Map()
    
    searchResults.chunks.forEach((chunk: any) => {
      const title = chunk.title || 'Unknown Document'
      const author = chunk.author || 'Unknown Author'
      const docKey = `${title.toLowerCase()}-${author.toLowerCase()}`
      
      if (!documentsMap.has(docKey)) {
        documentsMap.set(docKey, {
          title,
          author,
          doc_type: chunk.doc_type,
          genre: chunk.genre,
          topic: chunk.topic,
          difficulty: chunk.difficulty,
          tags: chunk.tags,
          chunks: [],
          best_relevance: chunk.relevance_score || 0,
          search_stages: new Set()
        })
      }
      
      const doc = documentsMap.get(docKey)
      doc.chunks.push({
        content: chunk.content,
        chunk_id: chunk.chunk_id,
        relevance_score: chunk.relevance_score,
        match_reason: chunk.match_reason,
        search_stage: chunk.search_stage,
        density_metrics: chunk.density_metrics,
        page_number: extractPageFromContent(chunk.content)
      })
      
      doc.search_stages.add(chunk.search_stage)
      doc.best_relevance = Math.max(doc.best_relevance, chunk.relevance_score || 0)
    })

    sources = Array.from(documentsMap.values())
      .sort((a, b) => {
        // Prioritize documents found in multiple stages
        const aStages = a.search_stages.size
        const bStages = b.search_stages.size
        if (aStages !== bStages) return bStages - aStages
        
        return b.best_relevance - a.best_relevance
      })
      .map((doc: any) => ({
        title: doc.title,
        author: doc.author,
        doc_type: doc.doc_type,
        genre: doc.genre,
        topic: doc.topic,
        difficulty: doc.difficulty,
        tags: doc.tags,
        content: doc.chunks[0]?.content || '', // Use best chunk as primary content
        similarity: doc.best_relevance,
        match_reason: doc.chunks[0]?.match_reason || '',
        search_type: doc.search_stages.has('multi_stage') ? 'multi_stage' : Array.from(doc.search_stages)[0],
        chunk_count: doc.chunks.length,
        all_chunks: doc.chunks,
        page_number: doc.chunks[0]?.page_number
      }))
      .slice(0, 8)

    console.log(`🎯 Hierarchical search results: ${sources.length} documents with ${searchResults.chunks.length} total chunks`)
    sources.forEach((doc, i) => {
      console.log(`${i+1}. "${doc.title}" - ${doc.match_reason} (${Math.round((doc.similarity || 0) * 100)}%) [${doc.chunk_count} chunks]`)
    })

    contextForAI = `HIERARCHICAL SEARCH RESULTS for "${message}":
    
Search Performance:
- Stage 1 (Structure): ${searchResults.searchStages.stage1_structure} chunks
- Stage 2 (Semantic): ${searchResults.searchStages.stage2_semantic} chunks  
- Stage 3 (Density): ${searchResults.searchStages.stage3_density} enhanced chunks
- Total Unique: ${searchResults.searchStages.total_unique} chunks
- Average Relevance: ${(searchResults.totalRelevanceScore * 100).toFixed(1)}%

Found ${sources.length} relevant documents with detailed chunk analysis:

${sources.map((doc: any, i: number) => 
  `${i + 1}. "${doc.title}" by ${doc.author}
   Search Type: ${doc.search_type} | Relevance: ${Math.round((doc.similarity || 0) * 100)}%
   Match Reason: ${doc.match_reason}
   Document Info: ${doc.doc_type} | Genre: ${doc.genre || 'N/A'} | Topic: ${doc.topic || 'N/A'}
   Content Analysis: ${doc.chunk_count} relevant chunks found
   
   Most Relevant Content: ${doc.content.substring(0, 300)}...`
).join('\n\n')}`

  } catch (error) {
    console.error('❌ Error in hierarchical search:', error)
    contextForAI = `Error occurred during hierarchical search for: "${message}"`
  }

  return {
    contextForAI,
    sources,
    metadata: {
      responseType: 'search',
      searchQuery: message,
      sourcesFound: sources.length,
      avgRelevance: sources.length > 0 ? Math.round(sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length * 100) : 0,
      searchMethod: 'hierarchical_chunk_search',
      searchStages: sources.reduce((acc, s) => {
        acc[s.search_type] = (acc[s.search_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }
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

async function handleRecommend(message: string, classification: QueryClassification, supabase: any, chatHistory: any[] = [], relevantFeedback: any[] = []) {
  console.log('🎯 Handling recommendation request with hierarchical search')
  
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
  
  let sources: any[] = []
  let contextForAI = ''

  try {
    // STEP 1: Try hierarchical chunk search first for topic-specific recommendations
    console.log('🏗️ Using hierarchical search for recommendations')
    const searchResults = await hierarchicalChunkSearch(message, supabase)
    
    if (searchResults.chunks.length > 0) {
      console.log(`✅ Hierarchical search found ${searchResults.chunks.length} relevant chunks`)
      
      // Group chunks by book and filter out previously recommended
      const booksMap = new Map()
      
      searchResults.chunks.forEach((chunk: any) => {
        if (!chunk.title) return
        
        const bookKey = `${chunk.title.toLowerCase()}-${(chunk.author || 'unknown').toLowerCase()}`
        
        // Skip previously recommended books
        if (previouslyRecommended.has(bookKey)) {
          console.log('⏭️ Skipping previously recommended book:', chunk.title)
          return
        }
        
        if (!booksMap.has(bookKey)) {
          booksMap.set(bookKey, {
            title: chunk.title,
            author: chunk.author || 'Unknown Author',
            doc_type: chunk.doc_type,
            genre: chunk.genre,
            topic: chunk.topic,
            difficulty: chunk.difficulty,
            tags: chunk.tags,
            content: chunk.content,
            similarity: chunk.relevance_score || 0,
            match_reason: chunk.match_reason || 'Hierarchical match',
            search_type: chunk.search_stage || 'hierarchical',
            page_number: extractPageFromContent(chunk.content),
            chunk_count: 0,
            best_chunk_content: chunk.content,
            hierarchical_score: chunk.relevance_score || 0
          })
        }
        
        const book = booksMap.get(bookKey)
        book.chunk_count++
        
        // Update to best content if this chunk has higher relevance
        if ((chunk.relevance_score || 0) > book.hierarchical_score) {
          book.best_chunk_content = chunk.content
          book.similarity = chunk.relevance_score || 0
          book.match_reason = chunk.match_reason || 'Hierarchical match'
          book.hierarchical_score = chunk.relevance_score || 0
        }
      })
      
      // Sort by hierarchical score and chunk count (more chunks = more relevant)
      const hierarchicalBooks = Array.from(booksMap.values())
        .sort((a, b) => {
          // Prioritize books with multiple relevant chunks
          const aScore = a.hierarchical_score + (a.chunk_count > 1 ? 0.2 : 0)
          const bScore = b.hierarchical_score + (b.chunk_count > 1 ? 0.2 : 0)
          return bScore - aScore
        })
        .slice(0, 5) // Get top 5 from hierarchical search
      
      sources.push(...hierarchicalBooks)
      console.log(`🎯 Hierarchical search provided ${hierarchicalBooks.length} book recommendations`)
    }
    
    // Get AI analysis for metadata search (used in contextForAI regardless)
    const analysis = await analyzeQueryForMetadata(message)
    
    // STEP 2: If we need more recommendations, fall back to AI-POWERED METADATA SEARCH
    if (sources.length < 3) {
      console.log('🔍 Supplementing with AI-powered metadata search')
      
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
      const metadataBooksMap = new Map()
      
      allCandidates.forEach((doc: any) => {
        if (!doc.title) return

        const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
        
        // Skip if this book was already recommended or already found by hierarchical search
        if (previouslyRecommended.has(bookKey) || sources.some(s => s.title?.toLowerCase() === doc.title?.toLowerCase())) {
          return
        }
        
        // Combine scores for multi-match documents
        if (metadataBooksMap.has(bookKey)) {
          const existing = metadataBooksMap.get(bookKey)
          const combinedScore = Math.max(existing.metadata_score, doc.metadata_score) * 1.15 // Boost for multiple matches
          const combinedReason = `${existing.match_reason} + ${doc.match_reason}`
          
          metadataBooksMap.set(bookKey, {
            ...existing,
            metadata_score: Math.min(1.0, combinedScore),
            match_reason: combinedReason,
            search_type: 'multi_match'
          })
        } else {
          metadataBooksMap.set(bookKey, {
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

      // Add metadata search results to sources
      const metadataBooks = Array.from(metadataBooksMap.values())
        .sort((a, b) => {
          // Prioritize multi-matches and entity/topic matches
          const aPriority = a.search_type === 'multi_match' ? 3 : 
                           (a.search_type === 'entity' || a.search_type === 'topic') ? 2 : 1
          const bPriority = b.search_type === 'multi_match' ? 3 : 
                           (b.search_type === 'entity' || b.search_type === 'topic') ? 2 : 1
          
          if (aPriority !== bPriority) return bPriority - aPriority
          return (b.similarity || 0) - (a.similarity || 0)
        })
        .slice(0, 8 - sources.length) // Fill remaining slots
      
      sources.push(...metadataBooks)
      console.log(`🔍 Metadata search added ${metadataBooks.length} additional recommendations`)
    }

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

  let systemPrompt = `You are a knowledgeable book advisor with access to a personal library. I use advanced AI-powered search that dynamically analyzes queries to find the most relevant books based on entities, topics, genres, and semantic meaning.

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

  // Add feedback context for continuous learning
  systemPrompt = addFeedbackContext(systemPrompt, relevantFeedback)

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

async function handleAsk(message: string, classification: QueryClassification, supabase: any, relevantFeedback: any[] = []) {
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

  let systemPrompt = `You are a knowledgeable assistant with access to both a specialized knowledge base and general knowledge.

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

  // Add feedback context for continuous learning
  systemPrompt = addFeedbackContext(systemPrompt, relevantFeedback)

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

    // Get relevant feedback for continuous learning
    console.log('🔄 Retrieving relevant feedback for query improvement...')
    const relevantFeedback = await getRelevantFeedback(message.trim(), 3)
    console.log('📊 Found', relevantFeedback.length, 'relevant feedback items')

    // Enhanced message with conversation context
    const enhancedMessage = await enhanceMessageWithContext(message, chatHistory)
    
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
        let catalogSystemPrompt = `You are a helpful librarian. ${result.contextForAI}\n\nProvide a clear, organized response showing the available content. Include totals and mention if there are more items available.`
        catalogSystemPrompt = addFeedbackContext(catalogSystemPrompt, relevantFeedback)
        response = await generateChatCompletion([
          { role: 'system', content: catalogSystemPrompt },
          { role: 'user', content: queryToUse }
        ])
        break

      case 'search':
        result = await handleSearch(queryToUse, classification, supabase)
        let searchSystemPrompt = `You are a research assistant. ${result.contextForAI}\n\nSummarize the findings and cite specific sources. If no content found, suggest related searches or recommendations.`
        searchSystemPrompt = addFeedbackContext(searchSystemPrompt, relevantFeedback)
        response = await generateChatCompletion([
          { role: 'system', content: searchSystemPrompt },
          { role: 'user', content: queryToUse }
        ])
        break

      case 'recommend':
        result = await handleRecommend(queryToUse, classification, supabase, chatHistory, relevantFeedback)
        response = result.directResponse
        break

      case 'ask':
      default:
        result = await handleAsk(queryToUse, classification, supabase, relevantFeedback)
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
        feedbackApplied: relevantFeedback.length,
        learningFromFeedback: relevantFeedback.length > 0,
        ...result.metadata
      },
      classification,
      method: 'unified_with_feedback_learning'
    })

  } catch (error) {
    console.error('❌ Error in unified chat API:', error)
    return NextResponse.json(
      { error: 'Chat error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}