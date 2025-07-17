import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateChatCompletion } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🔍 Simple Chat API called with message:', message)

    const supabase = createServerSupabaseClient()

    // Simple approach: Always get ALL books, then search through them
    console.log('📚 Retrieving all books from database...')
    
    const { data: allDocs, error } = await supabase
      .from('documents_enhanced')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    console.log(`📊 Retrieved ${allDocs?.length || 0} total documents`)

    // Deduplicate into unique books
    const booksMap = new Map()
    let processedDocs = 0

    allDocs?.forEach((doc) => {
      const title = doc.title?.trim()
      const author = doc.author?.trim()
      
      if (!title) return

      processedDocs++
      const bookKey = `${title.toLowerCase()}-${(author || 'unknown').toLowerCase()}`
      
      if (!booksMap.has(bookKey)) {
        booksMap.set(bookKey, {
          title,
          author: author || 'Unknown Author',
          doc_type: doc.doc_type || 'Book',
          genre: doc.genre,
          topic: doc.topic,
          difficulty: doc.difficulty,
          content_chunks: [],
          total_chunks: 0
        })
      }

      const book = booksMap.get(bookKey)
      book.content_chunks.push(doc.content || '')
      book.total_chunks++
    })

    const allBooks = Array.from(booksMap.values())
      .sort((a, b) => a.title.localeCompare(b.title))

    console.log(`📚 Found ${allBooks.length} unique books from ${processedDocs} valid documents`)

    // Simple query analysis - no complex processing
    const queryLower = message.toLowerCase()
    
    // Detect catalog requests AND content type filters
    const isCatalogRequest = 
      /\b(all|every|complete|catalog|inventory|outline|list|show)\s+(books?|documents?)\b/i.test(message) ||
      /\b(what\s+books|which\s+books|how\s+many\s+books)\b/i.test(message) ||
      /\b\d+\s+books?\b/i.test(message)

    // Detect content type preferences
    const wantsOnlyBooks = /\b(books?|documents?)\b/i.test(message) && !/\b(videos?|talks?|presentations?)\b/i.test(message)
    const wantsOnlyVideos = /\b(videos?|talks?|presentations?)\b/i.test(message) && !/\b(books?|documents?)\b/i.test(message)

    let relevantBooks = []
    let searchMethod = ''

    if (isCatalogRequest) {
      // For catalog requests, apply content type filtering
      relevantBooks = allBooks
      
      if (wantsOnlyBooks) {
        relevantBooks = allBooks.filter(book => book.doc_type !== 'Video')
        searchMethod = 'books_only_catalog'
        console.log(`📚 Books-only catalog request - showing ${relevantBooks.length} books (filtered out videos)`)
      } else if (wantsOnlyVideos) {
        relevantBooks = allBooks.filter(book => book.doc_type === 'Video')
        searchMethod = 'videos_only_catalog'
        console.log(`🎥 Videos-only catalog request - showing ${relevantBooks.length} videos`)
      } else {
        searchMethod = 'complete_catalog'
        console.log(`📋 Complete catalog request - showing all ${relevantBooks.length} items`)
      }
      
          } else {
        // For specific queries, do simple text matching with content type filtering
        const searchTerms = queryLower.split(/\s+/).filter((term: string) => term.length > 2)
        console.log('🔍 Search terms:', searchTerms)
        
        let searchPool = allBooks
        
        // Apply content type filtering to search pool
        if (wantsOnlyBooks) {
          searchPool = allBooks.filter(book => book.doc_type !== 'Video')
          console.log(`📚 Searching only books - pool size: ${searchPool.length}`)
        } else if (wantsOnlyVideos) {
          searchPool = allBooks.filter(book => book.doc_type === 'Video')
          console.log(`🎥 Searching only videos - pool size: ${searchPool.length}`)
        }
        
        relevantBooks = searchPool.filter(book => {
          const bookText = `${book.title} ${book.author} ${book.genre} ${book.topic} ${book.content_chunks.join(' ')}`.toLowerCase()
          return searchTerms.some((term: string) => bookText.includes(term))
        })
        
        searchMethod = wantsOnlyBooks ? 'books_text_search' : wantsOnlyVideos ? 'videos_text_search' : 'text_search'
        console.log(`🎯 Found ${relevantBooks.length} items matching search terms`)
        
        // If no matches, show filtered catalog as fallback
        if (relevantBooks.length === 0) {
          relevantBooks = searchPool
          searchMethod = wantsOnlyBooks ? 'books_fallback' : wantsOnlyVideos ? 'videos_fallback' : 'fallback_catalog'
          console.log(`📋 No matches found - showing all ${searchPool.length} items as fallback`)
        }
      }

    // Limit results for better UX
    const maxResults = isCatalogRequest ? 25 : 10
    const finalBooks = relevantBooks.slice(0, maxResults)

    // Create simple context for AI
    const contextForAI = `AVAILABLE BOOKS IN KNOWLEDGE BASE (${finalBooks.length} books${relevantBooks.length > maxResults ? ` shown out of ${relevantBooks.length} total` : ''})

${finalBooks.map((book, i) => 
  `${i+1}. "${book.title}" by ${book.author}
     Type: ${book.doc_type} | Genre: ${book.genre || 'N/A'} | Topic: ${book.topic || 'N/A'}
     Difficulty: ${book.difficulty || 'N/A'} | Chunks Available: ${book.total_chunks}
     Content Sample: ${book.content_chunks[0]?.substring(0, 200) || 'No content preview'}...`
).join('\n\n')}

SEARCH DETAILS:
- Search Method: ${searchMethod}
- Total Books in Database: ${allBooks.length}
- Books Matching Query: ${relevantBooks.length}
- Books Shown: ${finalBooks.length}

INSTRUCTIONS:
- Answer based ONLY on the books listed above
- Each book appears only once in this list
- If user asks for specific number of books, list them clearly
- If no relevant books found for a specific query, acknowledge this honestly`

    // Generate response with simple system prompt
    const systemPrompt = `You are a helpful assistant for an asset management company's knowledge base. 

${contextForAI}

User Question: ${message}

Provide a helpful response based on the available books listed above. Be accurate about what books you have access to.`

    console.log('🤖 Generating AI response...')
    const response = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ])

    const sources = finalBooks.map(book => ({
      title: book.title,
      author: book.author,
      doc_type: book.doc_type,
      topic: book.topic,
      genre: book.genre,
      difficulty: book.difficulty,
      content: book.content_chunks[0]?.substring(0, 300) || '',
      chunks_available: book.total_chunks
    }))

    console.log('✅ Response generated successfully')

    return NextResponse.json({
      response,
      sources,
      documentsFound: finalBooks.length,
      totalDocumentsAvailable: allBooks.length,
      searchMethod,
      totalBooksInDatabase: allBooks.length,
      method: 'simple_reliable_chat'
    })

  } catch (error) {
    console.error('❌ Error in simple chat API:', error)
    return NextResponse.json(
      { error: 'Chat error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 