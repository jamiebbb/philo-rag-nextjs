import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'

interface RetrievalStage {
  query: string
  results: any[]
  method: string
  confidence: number
}

interface DocumentResult {
  id: string
  title: string
  author?: string
  content: string
  similarity?: number
  rerank_score?: number
  rerank_reasoning?: string
  source_entity?: string
  [key: string]: any
}

// Advanced multi-stage retrieval
async function advancedRetrieve(query: string, supabase: any): Promise<{
  content: string
  sources: any[]
  stages: RetrievalStage[]
  finalConfidence: number
}> {
  const stages: RetrievalStage[] = []
  
  // Stage 1: Query Analysis & Expansion
  const queryAnalysisPrompt = `Analyze this query and extract:
1. Key entities (companies, people, concepts)
2. Question type (factual, analytical, comparative, etc.)
3. Domain focus (finance, strategy, operations, etc.)
4. Alternative phrasings for better search

Query: "${query}"

Respond in JSON format:
{
  "entities": ["entity1", "entity2"],
  "questionType": "factual|analytical|comparative|exploratory",
  "domain": "finance|strategy|operations|general",
  "searchTerms": ["term1", "term2", "term3"],
  "expandedQuery": "enhanced search query"
}`

  let queryAnalysis
  try {
    const analysisResponse = await generateChatCompletion([
      { role: 'system', content: queryAnalysisPrompt },
      { role: 'user', content: query }
    ])
    queryAnalysis = JSON.parse(analysisResponse)
  } catch (error) {
    console.warn('Query analysis failed, using simple approach:', error)
    queryAnalysis = {
      entities: [query],
      questionType: 'general',
      domain: 'general',
      searchTerms: query.split(' '),
      expandedQuery: query
    }
  }

  console.log('🧠 Query Analysis:', queryAnalysis)

  // Stage 2: Multi-Vector Retrieval
  const queryEmbedding = await generateEmbedding(queryAnalysis.expandedQuery)
  
  // Primary vector search
  const { data: primaryResults } = await supabase.rpc('match_documents_enhanced', {
    query_embedding: queryEmbedding,
    match_threshold: 0.1,
    match_count: 15
  })

  stages.push({
    query: queryAnalysis.expandedQuery,
    results: primaryResults || [],
    method: 'vector_primary',
    confidence: 0.8
  })

  // Stage 3: Entity-based retrieval
  let entityResults: DocumentResult[] = []
  for (const entity of queryAnalysis.entities) {
    const { data: entityDocs } = await supabase
      .from('documents_enhanced')
      .select('*')
      .or(`title.ilike.%${entity}%,author.ilike.%${entity}%,content.ilike.%${entity}%`)
      .limit(5)
    
    if (entityDocs) {
      entityResults.push(...entityDocs.map((doc: any) => ({...doc, similarity: 0.9, source_entity: entity})))
    }
  }

  stages.push({
    query: queryAnalysis.entities.join(', '),
    results: entityResults,
    method: 'entity_based',
    confidence: 0.9
  })

  // Stage 4: Semantic Clustering & Reranking
  const allCandidates = [...(primaryResults || []), ...entityResults]
  const uniqueCandidates = new Map()
  
  allCandidates.forEach((doc: any) => {
    const existing = uniqueCandidates.get(doc.id)
    if (!existing || doc.similarity > existing.similarity) {
      uniqueCandidates.set(doc.id, doc)
    }
  })

  let finalResults = Array.from(uniqueCandidates.values()) as DocumentResult[]

  // Advanced reranking based on query analysis
  const rerankingPrompt = `You are a document relevance expert. Given a query analysis and candidate documents, score each document's relevance (0-100).

Query Analysis: ${JSON.stringify(queryAnalysis)}

Documents to score:
${finalResults.map((doc: DocumentResult, i: number) => `${i+1}. Title: "${doc.title}" by ${doc.author || 'Unknown'}
Content Preview: ${doc.content?.substring(0, 200)}...`).join('\n\n')}

Respond with JSON array of scores: [{"id": 1, "score": 85, "reasoning": "why relevant"}, ...]`

  try {
    const rerankingResponse = await generateChatCompletion([
      { role: 'system', content: rerankingPrompt },
      { role: 'user', content: 'Score these documents' }
    ])
    
    const scores = JSON.parse(rerankingResponse)
    
    finalResults = finalResults
      .map((doc: DocumentResult, i: number) => {
        const scoreData = scores.find((s: any) => s.id === i + 1)
        return {
          ...doc,
          rerank_score: scoreData?.score || 50,
          rerank_reasoning: scoreData?.reasoning || 'No specific reasoning'
        }
      })
      .sort((a: DocumentResult, b: DocumentResult) => (b.rerank_score || 0) - (a.rerank_score || 0))
      .slice(0, 8)

  } catch (error) {
    console.warn('Reranking failed, using similarity scores:', error)
    finalResults = finalResults
      .sort((a: DocumentResult, b: DocumentResult) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 8)
  }

  stages.push({
    query: 'reranking_stage',
    results: finalResults,
    method: 'ai_reranking',
    confidence: 0.95
  })

  // Calculate final confidence
  const finalConfidence = finalResults.length > 0 ? 
    Math.min(0.95, (finalResults[0].rerank_score || finalResults[0].similarity || 0) / 100) : 0

  // Format for AI consumption
  const contextForAI = finalResults.map((doc: DocumentResult, i: number) => 
    `Document ${i+1}: "${doc.title}" by ${doc.author || 'Unknown'}
    Relevance Score: ${doc.rerank_score || 'N/A'}
    Content: ${doc.content}`
  ).join('\n\n---\n\n')

  const sources = finalResults.map((doc: DocumentResult) => ({
    title: doc.title || 'Unknown Document',
    author: doc.author || 'Unknown Author',
    doc_type: doc.doc_type || 'Unknown Type',
    relevance_score: doc.rerank_score || doc.similarity,
    reasoning: doc.rerank_reasoning
  }))

  return {
    content: `Advanced retrieval found ${finalResults.length} highly relevant documents:\n\n${contextForAI}`,
    sources,
    stages,
    finalConfidence
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🚀 Advanced RAG API called with message:', message.substring(0, 100) + '...')

    const supabase = createServerSupabaseClient()

    // Advanced retrieval
    const retrieveResult = await advancedRetrieve(message, supabase)

    // Advanced response generation with reasoning
    const systemPrompt = `You are an expert AI analyst for an asset management company with access to a curated knowledge bank of ${retrieveResult.sources.length} highly relevant documents.

RETRIEVAL CONFIDENCE: ${(retrieveResult.finalConfidence * 100).toFixed(1)}%

RETRIEVED CONTEXT:
${retrieveResult.content}

CRITICAL INSTRUCTIONS:
1. You are operating with ${(retrieveResult.finalConfidence * 100).toFixed(1)}% confidence in document relevance
2. Base your response PRIMARILY on the retrieved documents
3. If confidence is below 70%, explicitly state uncertainty and suggest refinement
4. Provide detailed, analytical responses citing specific sources
5. When referencing "your knowledge" or "the data", you mean the curated knowledge bank
6. If asked about methodology, explain that you use advanced retrieval with AI reranking

RESPONSE STRUCTURE:
- Lead with confidence level and source count
- Provide detailed answer based on documents
- Cite specific documents when making claims
- End with confidence assessment

User Question: ${message}`

    const response = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ])

    return NextResponse.json({
      response,
      sources: retrieveResult.sources,
      documentsFound: retrieveResult.sources.length,
      retrievalStages: retrieveResult.stages.length,
      confidence: retrieveResult.finalConfidence,
      method: 'advanced_rag'
    })

  } catch (error) {
    console.error('Error in advanced RAG API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 