import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    console.log('🔍 Debug vector search for query:', query)

    const supabase = createServerSupabaseClient()

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query)

    // Test different similarity thresholds
    const thresholds = [0.0, 0.3, 0.5, 0.7, 0.8]
    const results: Record<string, any> = {}

    for (const threshold of thresholds) {
      try {
        const { data: docs, error } = await supabase.rpc('match_documents_enhanced', {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: 10
        })

        if (error) {
          results[`threshold_${threshold}`] = {
            error: error.message,
            count: 0,
            documents: []
          }
        } else {
          results[`threshold_${threshold}`] = {
            count: docs?.length || 0,
            documents: docs?.map((doc: any) => ({
              id: doc.id,
              title: doc.title,
              author: doc.author,
              similarity: doc.similarity,
              content_preview: doc.content?.substring(0, 100) + '...'
            })) || []
          }
        }
      } catch (error) {
        results[`threshold_${threshold}`] = {
          error: error instanceof Error ? error.message : 'Unknown error',
          count: 0,
          documents: []
        }
      }
    }

    // Check document count and embedding health
    const { data: totalDocs, error: countError } = await supabase
      .from('documents_enhanced')
      .select('id, title, author, embedding', { count: 'exact' })
      .limit(5)

    const embeddingHealth = {
      totalDocuments: totalDocs?.length || 0,
      documentsWithEmbeddings: totalDocs?.filter(doc => doc.embedding).length || 0,
      documentsWithoutEmbeddings: totalDocs?.filter(doc => !doc.embedding).length || 0,
      sampleDocuments: totalDocs?.map((doc: any) => ({
        title: doc.title,
        author: doc.author,
        hasEmbedding: !!doc.embedding
      })) || []
    }

    return NextResponse.json({
      query,
      embeddingGenerated: !!queryEmbedding,
      embeddingHealth,
      thresholdResults: results,
      recommendations: {
        bestThreshold: Object.entries(results).find(([_, result]: [string, any]) => 
          result.count > 0 && result.count <= 8
        )?.[0] || 'threshold_0.3',
        issues: [
          embeddingHealth.documentsWithoutEmbeddings > 0 && 'Some documents missing embeddings',
          !queryEmbedding && 'Failed to generate query embedding',
          Object.values(results).every((result: any) => result.count === 0) && 'No results at any threshold'
        ].filter(Boolean)
      }
    })

  } catch (error) {
    console.error('Error in debug vector search:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 