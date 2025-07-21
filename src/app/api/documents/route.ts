import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()

    const { data: documents, error } = await supabase
      .from('documents_enhanced')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching documents:', error)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    // Calculate chunk counts (in this setup, each document is a chunk)
    const documentsWithChunkCounts = documents?.map(doc => ({
      ...doc,
      chunk_count: 1, // Each document is one chunk in this setup
      content: doc.content || '' // Ensure content is never null
    })) || []

    return NextResponse.json({
      documents: documentsWithChunkCounts,
      total: documentsWithChunkCounts.length
    })

  } catch (error) {
    console.error('Error in documents API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 