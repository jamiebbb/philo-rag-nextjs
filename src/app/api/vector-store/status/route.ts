import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()

    // Check if documents_enhanced table exists and get count
    const { data: documents, error: docError } = await supabase
      .from('documents_enhanced')
      .select('id', { count: 'exact' })
      .limit(1)

    if (docError) {
      return NextResponse.json({
        status: 'failed',
        document_count: 0,
        chunk_count: 0,
        error_message: 'Failed to connect to vector store: ' + docError.message
      })
    }

    // Get document and chunk counts
    const { count: documentCount } = await supabase
      .from('documents_enhanced')
      .select('*', { count: 'exact', head: true })

    // Get stats by type
    const { data: statsData } = await supabase
      .from('documents_enhanced')
      .select('doc_type, source_type, difficulty')

    const stats = {
      by_type: {} as Record<string, number>,
      by_difficulty: {} as Record<string, number>,
      by_source: {} as Record<string, number>
    }

    statsData?.forEach((doc: any) => {
      if (doc.doc_type) {
        stats.by_type[doc.doc_type] = (stats.by_type[doc.doc_type] || 0) + 1
      }
      if (doc.source_type) {
        stats.by_source[doc.source_type] = (stats.by_source[doc.source_type] || 0) + 1
      }
      if (doc.difficulty) {
        stats.by_difficulty[doc.difficulty] = (stats.by_difficulty[doc.difficulty] || 0) + 1
      }
    })

    return NextResponse.json({
      status: 'enhanced',
      document_count: documentCount || 0,
      chunk_count: documentCount || 0, // In this setup, documents are chunks
      last_updated: new Date().toISOString(),
      stats
    })

  } catch (error) {
    console.error('Error getting vector store status:', error)
    return NextResponse.json({
      status: 'failed',
      document_count: 0,
      chunk_count: 0,
      error_message: 'Internal server error'
    }, { status: 500 })
  }
} 