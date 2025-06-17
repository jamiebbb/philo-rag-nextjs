import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Simple catalog endpoint called')
    const supabase = createServerSupabaseClient()

    // Get ALL documents - no filtering, no complexity
    const { data: allDocs, error } = await supabase
      .from('documents_enhanced')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    console.log(`📊 Retrieved ${allDocs?.length || 0} total documents`)

    // Simple deduplication by title + author
    const booksMap = new Map()
    let validDocs = 0
    let invalidDocs = 0

    allDocs?.forEach((doc, index) => {
      const title = doc.title?.trim()
      const author = doc.author?.trim()
      
      if (!title) {
        invalidDocs++
        console.log(`⚠️ Document ${index + 1} has no title:`, {
          id: doc.id,
          author: author || 'NO_AUTHOR',
          content_preview: (doc.content || '').substring(0, 50)
        })
        return
      }

      validDocs++
      const bookKey = `${title.toLowerCase()}-${(author || 'unknown').toLowerCase()}`
      
      if (!booksMap.has(bookKey)) {
        booksMap.set(bookKey, {
          title,
          author: author || 'Unknown Author',
          doc_type: doc.doc_type || 'Unknown',
          genre: doc.genre,
          topic: doc.topic,
          difficulty: doc.difficulty,
          chunks: [],
          first_seen: index + 1
        })
      }

      const book = booksMap.get(bookKey)
      book.chunks.push({
        id: doc.id,
        chunk_id: doc.chunk_id,
        content_preview: (doc.content || '').substring(0, 100),
        created_at: doc.created_at
      })
    })

    const uniqueBooks = Array.from(booksMap.values())
      .sort((a, b) => a.title.localeCompare(b.title))

    console.log(`📚 Found ${uniqueBooks.length} unique books from ${validDocs} valid documents (${invalidDocs} invalid)`)
    console.log('📋 Books found:', uniqueBooks.map(book => `"${book.title}" by ${book.author} (${book.chunks.length} chunks)`))

    return NextResponse.json({
      success: true,
      totalDocuments: allDocs?.length || 0,
      validDocuments: validDocs,
      invalidDocuments: invalidDocs,
      uniqueBooks: uniqueBooks.length,
      books: uniqueBooks.map(book => ({
        title: book.title,
        author: book.author,
        type: book.doc_type,
        genre: book.genre,
        topic: book.topic,
        difficulty: book.difficulty,
        chunkCount: book.chunks.length,
        firstSeen: book.first_seen,
        sampleContent: book.chunks[0]?.content_preview
      })),
      debug: {
        sampleInvalidDocs: allDocs?.filter(doc => !doc.title?.trim()).slice(0, 3).map(doc => ({
          id: doc.id,
          title: doc.title,
          author: doc.author,
          content_preview: (doc.content || '').substring(0, 50)
        }))
      }
    })

  } catch (error) {
    console.error('❌ Simple catalog error:', error)
    return NextResponse.json(
      { error: 'Failed to get catalog: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()
    console.log('🔍 Simple search for:', query)
    
    const supabase = createServerSupabaseClient()

    // Simple text search - no vector embeddings
    const { data: docs, error } = await supabase
      .from('documents_enhanced')
      .select('*')
      .or(`title.ilike.%${query}%,author.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(50)

    if (error) {
      throw new Error(`Search error: ${error.message}`)
    }

    // Deduplicate as before
    const booksMap = new Map()
    docs?.forEach(doc => {
      const title = doc.title?.trim()
      const author = doc.author?.trim()
      
      if (!title) return
      
      const bookKey = `${title.toLowerCase()}-${(author || 'unknown').toLowerCase()}`
      if (!booksMap.has(bookKey)) {
        booksMap.set(bookKey, {
          title,
          author: author || 'Unknown Author',
          doc_type: doc.doc_type,
          genre: doc.genre,
          topic: doc.topic,
          content: doc.content,
          relevance: 'text_match'
        })
      }
    })

    const results = Array.from(booksMap.values())
    console.log(`🎯 Found ${results.length} unique books matching "${query}"`)

    return NextResponse.json({
      success: true,
      query,
      resultsFound: results.length,
      books: results
    })

  } catch (error) {
    console.error('❌ Simple search error:', error)
    return NextResponse.json(
      { error: 'Search failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 