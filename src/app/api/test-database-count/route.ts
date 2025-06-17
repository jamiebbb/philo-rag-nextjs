import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()

    // Get total count of all documents
    const { count: totalCount, error: countError } = await supabase
      .from('documents_enhanced')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      throw new Error(`Count query failed: ${countError.message}`)
    }

    // Get all documents with titles
    const { data: allDocs, error: docsError } = await supabase
      .from('documents_enhanced')
      .select('title, author, doc_type, chunk_id, total_chunks')
      .not('title', 'is', null)
      .not('title', 'eq', '')
      .order('title', { ascending: true })

    if (docsError) {
      throw new Error(`Documents query failed: ${docsError.message}`)
    }

    // Group by unique books
    const booksMap = new Map()
    
    allDocs?.forEach((doc: any) => {
      const title = (doc.title || '').trim()
      const author = (doc.author || '').trim()
      const bookKey = `${title.toLowerCase()}-${author.toLowerCase()}`
      
      if (!booksMap.has(bookKey)) {
        booksMap.set(bookKey, {
          title,
          author,
          doc_type: doc.doc_type,
          chunkCount: 0
        })
      }
      
      booksMap.get(bookKey).chunkCount++
    })

    const uniqueBooks = Array.from(booksMap.values())

    return NextResponse.json({
      success: true,
      totalDocumentChunks: totalCount,
      documentsWithTitles: allDocs?.length || 0,
      uniqueBooks: uniqueBooks.length,
      booksList: uniqueBooks,
      sampleDocuments: allDocs?.slice(0, 10) || []
    })

  } catch (error) {
    console.error('Error testing database:', error)
    return NextResponse.json(
      { error: 'Database test failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 