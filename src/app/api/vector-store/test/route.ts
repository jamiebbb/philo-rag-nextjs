import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'

export async function POST() {
  try {
    const supabase = createServerSupabaseClient()

    // Test with a simple query
    const testQuery = "philosophy"
    const queryEmbedding = await generateEmbedding(testQuery)

    // Try enhanced vector search first
    const { data: results, error } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 3
    })

    if (error) {
      // Fallback to simple search
      const { data: fallbackResults, error: fallbackError } = await supabase
        .from('documents_enhanced')
        .select('id, title, content')
        .limit(3)

      if (fallbackError) {
        return NextResponse.json({
          success: false,
          error: 'Vector store test failed: ' + fallbackError.message
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        results: fallbackResults,
        message: 'Basic connection successful, but vector search not available'
      })
    }

    return NextResponse.json({
      success: true,
      results: results || [],
      message: `Enhanced vector search successful! Found ${results?.length || 0} results for "${testQuery}"`
    })

  } catch (error) {
    console.error('Error testing vector store:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error: ' + (error as Error).message
    }, { status: 500 })
  }
} 