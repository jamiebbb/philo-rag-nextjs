import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'

// Enhanced metadata retrieval with semantic understanding
async function enhancedMetadataRetrieval(query: string, supabase: any): Promise<{
  content: string
  sources: any[]
  metadataAnalysis: any
}> {
  console.log(`🧠 Enhanced Metadata Retrieval for: "${query}"`)

  // Step 1: AI-powered metadata analysis
  const metadataAnalysisPrompt = `Analyze this query to extract metadata search criteria for an asset management knowledge base:

Query: "${query}"

Extract and categorize the following if present:
1. ENTITIES: People names, company names, specific concepts
2. TOPICS: Subject areas, domains, themes  
3. DOCUMENT_TYPES: Books, articles, reports, studies
4. DIFFICULTY: Beginner, intermediate, advanced, expert level content
5. GENRES: Philosophy, economics, finance, technology, etc.
6. TEMPORAL: Time periods, historical contexts
7. INTENT: What type of information is being sought

Respond in JSON format:
{
  "entities": ["list of specific names/companies"],
  "topics": ["list of subject areas"], 
  "document_types": ["preferred document types"],
  "difficulty_preference": "beginner|intermediate|advanced|expert|any",
  "genres": ["relevant genres"],
  "temporal_context": "any time period mentioned",
  "search_intent": "factual|analytical|comparative|research|recommendation",
  "metadata_priorities": ["ranked list of most important metadata fields to search"],
  "search_strategy": "entity_focused|topic_focused|broad_exploration"
}`

  let metadataAnalysis
  try {
    const analysisResponse = await generateChatCompletion([
      { role: 'system', content: metadataAnalysisPrompt },
      { role: 'user', content: query }
    ])
    metadataAnalysis = JSON.parse(analysisResponse)
  } catch (error) {
    console.warn('Metadata analysis failed, using fallback:', error)
    metadataAnalysis = {
      entities: [],
      topics: query.split(' ').filter(word => word.length > 3),
      document_types: [],
      difficulty_preference: "any",
      genres: [],
      temporal_context: "",
      search_intent: "factual",
      metadata_priorities: ["title", "topic", "author"],
      search_strategy: "broad_exploration"
    }
  }

  console.log('🧠 Metadata Analysis:', metadataAnalysis)

  // Step 2: Adaptive metadata search based on analysis
  let allCandidates: any[] = []

  // Entity-focused search
  if (metadataAnalysis.entities && metadataAnalysis.entities.length > 0) {
    for (const entity of metadataAnalysis.entities) {
      console.log(`🏢 Entity search: "${entity}"`)
      
      const { data: entityDocs } = await supabase
        .from('documents_enhanced')
        .select('*')
        .or(`title.ilike.%${entity}%,author.ilike.%${entity}%,content.ilike.%${entity}%,tags.ilike.%${entity}%`)
        .limit(5)
      
      if (entityDocs) {
        const scoredDocs = entityDocs.map(doc => ({
          ...doc,
          relevance_score: calculateEntityRelevance(doc, entity, query),
          match_reason: `Entity match: ${entity}`,
          search_type: 'entity'
        }))
        allCandidates.push(...scoredDocs)
      }
    }
  }

  // Topic-focused search
  if (metadataAnalysis.topics && metadataAnalysis.topics.length > 0) {
    for (const topic of metadataAnalysis.topics) {
      console.log(`📚 Topic search: "${topic}"`)
      
      const { data: topicDocs } = await supabase
        .from('documents_enhanced')
        .select('*')
        .or(`topic.ilike.%${topic}%,genre.ilike.%${topic}%,tags.ilike.%${topic}%,title.ilike.%${topic}%`)
        .limit(4)
      
      if (topicDocs) {
        const scoredDocs = topicDocs.map(doc => ({
          ...doc,
          relevance_score: calculateTopicRelevance(doc, topic, query, metadataAnalysis),
          match_reason: `Topic match: ${topic}`,
          search_type: 'topic'
        }))
        allCandidates.push(...scoredDocs)
      }
    }
  }

  // Document type filtering
  if (metadataAnalysis.document_types && metadataAnalysis.document_types.length > 0) {
    for (const docType of metadataAnalysis.document_types) {
      console.log(`📖 Document type search: "${docType}"`)
      
      const { data: typeDocs } = await supabase
        .from('documents_enhanced')
        .select('*')
        .ilike('doc_type', `%${docType}%`)
        .limit(3)
      
      if (typeDocs) {
        const scoredDocs = typeDocs.map(doc => ({
          ...doc,
          relevance_score: calculateTypeRelevance(doc, docType, metadataAnalysis),
          match_reason: `Document type: ${docType}`,
          search_type: 'doc_type'
        }))
        allCandidates.push(...scoredDocs)
      }
    }
  }

  // Fallback: Semantic vector search if low metadata coverage
  if (allCandidates.length < 3) {
    console.log('🔍 Adding semantic vector search for broader coverage')
    const queryEmbedding = await generateEmbedding(query)
    
    const { data: vectorDocs } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: queryEmbedding,
      match_threshold: 0.1,
      match_count: 8
    })

    if (vectorDocs) {
      const scoredVectorDocs = vectorDocs.map((doc: any) => ({
        ...doc,
        relevance_score: doc.similarity,
        match_reason: 'Semantic similarity',
        search_type: 'vector'
      }))
      allCandidates.push(...scoredVectorDocs)
    }
  }

  // Step 3: Advanced deduplication and ranking
  const uniqueDocs = new Map()
  
  allCandidates.forEach(doc => {
    const existing = uniqueDocs.get(doc.id)
    if (!existing) {
      uniqueDocs.set(doc.id, doc)
    } else {
      // Combine scores and reasons for multi-match documents
      const combinedScore = Math.max(existing.relevance_score, doc.relevance_score) * 1.2 // Boost for multiple matches
      const combinedReason = `${existing.match_reason} + ${doc.match_reason}`
      
      uniqueDocs.set(doc.id, {
        ...existing,
        relevance_score: Math.min(1.0, combinedScore), // Cap at 1.0
        match_reason: combinedReason,
        search_type: 'multi_match'
      })
    }
  })

  const finalDocs = Array.from(uniqueDocs.values())
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 6)

  console.log(`🎯 Enhanced metadata retrieval results: ${finalDocs.length} documents`)
  finalDocs.forEach((doc: any, i: number) => {
    console.log(`   ${i+1}. "${doc.title}" by ${doc.author || 'Unknown'} - Score: ${doc.relevance_score.toFixed(3)} - ${doc.match_reason}`)
  })

  // Format for AI consumption
  const contextForAI = finalDocs.map((doc: any, i: number) => 
    `Document ${i+1}: "${doc.title}" by ${doc.author || 'Unknown'}
    Metadata: Topic=${doc.topic}, Genre=${doc.genre}, Difficulty=${doc.difficulty}
    Relevance: ${doc.relevance_score.toFixed(3)} (${doc.match_reason})
    Content: ${doc.content}`
  ).join('\n\n---\n\n')

  const sources = finalDocs.map(doc => ({
    title: doc.title || 'Unknown Document',
    author: doc.author || 'Unknown Author',
    doc_type: doc.doc_type || 'Unknown Type',
    topic: doc.topic,
    genre: doc.genre,
    difficulty: doc.difficulty,
    relevance_score: doc.relevance_score,
    match_reason: doc.match_reason,
    search_type: doc.search_type
  }))

  return {
    content: `Enhanced metadata search found ${finalDocs.length} highly relevant documents:\n\n${contextForAI}`,
    sources,
    metadataAnalysis
  }
}

// Helper functions for scoring
function calculateEntityRelevance(doc: any, entity: string, query: string): number {
  let score = 0.6 // Base score
  
  const entityLower = entity.toLowerCase()
  const titleMatch = (doc.title || '').toLowerCase().includes(entityLower)
  const authorMatch = (doc.author || '').toLowerCase().includes(entityLower)
  const contentMatch = (doc.content || '').toLowerCase().includes(entityLower)
  
  if (titleMatch) score += 0.3
  if (authorMatch) score += 0.25
  if (contentMatch) score += 0.15
  
  // Boost if entity appears multiple times in query
  const entityOccurrences = (query.toLowerCase().match(new RegExp(entityLower, 'g')) || []).length
  if (entityOccurrences > 1) score *= 1.1
  
  return Math.min(1.0, score)
}

function calculateTopicRelevance(doc: any, topic: string, query: string, analysis: any): number {
  let score = 0.5 // Base score
  
  const topicLower = topic.toLowerCase()
  const docTopic = (doc.topic || '').toLowerCase()
  const docGenre = (doc.genre || '').toLowerCase()
  const docTags = (doc.tags || '').toLowerCase()
  
  if (docTopic.includes(topicLower)) score += 0.35
  if (docGenre.includes(topicLower)) score += 0.25
  if (docTags.includes(topicLower)) score += 0.2
  
  // Difficulty alignment bonus
  if (analysis.difficulty_preference && analysis.difficulty_preference !== 'any') {
    const docDifficulty = (doc.difficulty || '').toLowerCase()
    if (docDifficulty.includes(analysis.difficulty_preference.toLowerCase())) {
      score += 0.1
    }
  }
  
  return Math.min(1.0, score)
}

function calculateTypeRelevance(doc: any, docType: string, analysis: any): number {
  let score = 0.7 // Higher base for specific type requests
  
  const typeMatch = (doc.doc_type || '').toLowerCase().includes(docType.toLowerCase())
  if (typeMatch) score += 0.2
  
  // Boost for academic/research intent
  if (analysis.search_intent === 'research' && ['book', 'study', 'report'].includes(docType.toLowerCase())) {
    score += 0.1
  }
  
  return Math.min(1.0, score)
}

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🎯 Metadata-Enhanced Chat API called with message:', message.substring(0, 100) + '...')

    const supabase = createServerSupabaseClient()

    // Enhanced metadata retrieval
    const retrieveResult = await enhancedMetadataRetrieval(message, supabase)

    // Generate response with metadata awareness
    const systemPrompt = `You are an expert AI analyst for an asset management company with access to a curated knowledge bank. You have advanced metadata understanding and retrieved ${retrieveResult.sources.length} highly relevant documents.

METADATA ANALYSIS: ${JSON.stringify(retrieveResult.metadataAnalysis, null, 2)}

RETRIEVED CONTEXT:
${retrieveResult.content}

RESPONSE GUIDELINES:
1. Leverage the metadata analysis to provide contextually aware responses
2. Reference document types, difficulty levels, and topics when relevant
3. Use the relevance scores and match reasons to prioritize information
4. If the query shows specific intent (research, recommendation, etc.), tailor your response accordingly
5. Cite specific documents and explain why they're relevant based on the metadata matches

User Question: ${message}`

    const response = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ])

    return NextResponse.json({
      response,
      sources: retrieveResult.sources,
      documentsFound: retrieveResult.sources.length,
      metadataAnalysis: retrieveResult.metadataAnalysis,
      method: 'enhanced_metadata_retrieval'
    })

  } catch (error) {
    console.error('Error in metadata-enhanced chat API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 