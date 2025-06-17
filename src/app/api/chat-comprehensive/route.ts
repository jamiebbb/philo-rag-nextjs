import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'
import { getRelevantFeedback } from '@/lib/feedback'

// Comprehensive retrieval strategy that handles both targeted queries and catalog requests
async function comprehensiveRetrieve(query: string, supabase: any): Promise<{
  content: string
  sources: any[]
  totalAvailable: number
  retrievalMethod: string
  warning?: string
}> {
  try {
    console.log('🔍 Starting comprehensive retrieval for query:', query)

    // **CRITICAL FIX**: When asking for complete catalog, we need to get unique books, not chunks
    const isCatalogRequest = /\b(all|every|complete|catalog|inventory|outline|list)\s+(books?|documents?)\b/i.test(query) ||
                           /\b(show|tell)\s+me\s+(all|every|everything)\b/i.test(query)

    let vectorResults: any[] = []
    
    if (isCatalogRequest) {
      console.log('📚 Catalog request detected - retrieving ALL unique books')
      
      // Get ALL documents to find unique books - remove any filtering that might limit results
      const { data: allDocs, error: allDocsError } = await supabase
        .from('documents_enhanced')
        .select('*')
        .order('title', { ascending: true })

      if (allDocsError) {
        throw new Error(`Failed to retrieve all documents: ${allDocsError.message}`)
      }

      // Filter out docs without titles AFTER retrieval to see what we have
      vectorResults = (allDocs || []).filter((doc: any) => doc.title && doc.title.trim())
      console.log(`📊 Retrieved ${allDocs?.length || 0} total documents, ${vectorResults.length} with valid titles`)
      
    } else {
      console.log('🎯 Specific query - using vector search')
      
      // Generate embedding for vector search
      const embedding = await generateEmbedding(query)
      
      // Comprehensive vector search
      const { data: vectorResults_temp, error: vectorError } = await supabase.rpc(
        'match_documents_enhanced',
        {
          query_embedding: embedding,
          match_threshold: 0.1, // Very low threshold for comprehensive results
          match_count: 200      // Get many chunks to deduplicate from
        }
      )

      if (vectorError) {
        throw new Error(`Vector search failed: ${vectorError.message}`)
      }

      vectorResults = vectorResults_temp || []
    }

    // **ENHANCED DEDUPLICATION**: Group by unique book (title + author)
    const booksMap = new Map()
    
    vectorResults.forEach((doc: any) => {
      const title = (doc.title || '').trim()
      const author = (doc.author || '').trim()
      
      if (!title) return // Skip documents without titles
      
      const bookKey = `${title.toLowerCase()}-${author.toLowerCase()}`
      const existing = booksMap.get(bookKey)
      
      if (!existing) {
        // First time seeing this book - add it
        booksMap.set(bookKey, {
          title,
          author,
          doc_type: doc.doc_type || 'Unknown',
          topic: doc.topic,
          genre: doc.genre,
          difficulty: doc.difficulty,
          content: doc.content || '',
          similarity: doc.similarity || 1.0,
          chunks_available: 1,
          total_chunks: doc.total_chunks || 1,
          source: doc.source || title
        })
      } else {
        // We've seen this book before - just update chunk count and pick best content
        existing.chunks_available += 1
        if ((doc.similarity || 0) > (existing.similarity || 0)) {
          existing.content = doc.content || existing.content
          existing.similarity = doc.similarity || existing.similarity
        }
      }
    })

    // Convert to array and sort
    const uniqueBooks = Array.from(booksMap.values())
      .sort((a: any, b: any) => {
        if (isCatalogRequest) {
          // For catalog requests, sort alphabetically by title
          return a.title.localeCompare(b.title)
        } else {
          // For searches, sort by relevance
          return (b.similarity || 0) - (a.similarity || 0)
        }
      })

    // Limit results for better UX
    const maxResults = isCatalogRequest ? 50 : 15 // Show more for catalog requests
    const finalBooks = uniqueBooks.slice(0, maxResults)

    console.log(`📚 Found ${uniqueBooks.length} unique books, showing top ${finalBooks.length}`)
    console.log('📋 Unique books found:', uniqueBooks.map(book => `"${book.title}" by ${book.author} (${book.chunks_available} chunks)`).join(', '))

    // Create enhanced context with book summaries
    const contextForAI = `UNIQUE BOOKS/DOCUMENTS RETRIEVED (${finalBooks.length} unique books shown${uniqueBooks.length > maxResults ? ` out of ${uniqueBooks.length} total unique books found` : ''}):

${finalBooks.map((book: any, i: number) => 
  `${i+1}. "${book.title}" by ${book.author || 'Unknown Author'}
     Type: ${book.doc_type} | Genre: ${book.genre || 'N/A'} | Topic: ${book.topic || 'N/A'}
     Difficulty: ${book.difficulty || 'N/A'} | Available chunks: ${book.chunks_available}/${book.total_chunks}
     ${isCatalogRequest ? 'Preview: ' + (book.content.substring(0, 150) + '...') : 'Content: ' + book.content}`
).join('\n\n')}

END OF UNIQUE BOOKS

IMPORTANT NOTES:
- These are ${finalBooks.length} UNIQUE BOOKS (deduplicated from ${vectorResults.length} document chunks)
- Each book appears only ONCE in this list
- Some books may have multiple chunks/pages available in the system
${uniqueBooks.length > maxResults ? `- There are ${uniqueBooks.length - maxResults} additional unique books not shown (ask for "more books" to see them)` : ''}
- Total document chunks in database: ${vectorResults.length}`

    const sources = finalBooks.map((book: any) => ({
      title: book.title,
      author: book.author || 'Unknown Author',
      doc_type: book.doc_type || 'Unknown Type',
      topic: book.topic,
      genre: book.genre,
      difficulty: book.difficulty,
      content: book.content?.substring(0, 300) || '',
      relevance_score: book.similarity || 1.0,
      chunks_available: book.chunks_available,
      total_chunks: book.total_chunks,
      search_method: isCatalogRequest ? 'catalog_browse' : 'vector_search'
    }))

    return {
      content: contextForAI,
      sources,
      totalAvailable: uniqueBooks.length,
      retrievalMethod: isCatalogRequest ? 'complete_catalog' : 'targeted_search',
      warning: uniqueBooks.length > maxResults ? `Showing ${maxResults} of ${uniqueBooks.length} unique books. Ask for "more books" to see additional titles.` : undefined
    }

  } catch (error) {
    console.error('❌ Error in comprehensive retrieval:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🔍 Comprehensive Chat API called with message:', message.substring(0, 100) + '...')
    console.log('🔍 Full message:', message)
    console.log('🔍 Chat history length:', chatHistory.length)

    const supabase = createServerSupabaseClient()

    // Get relevant feedback
    const relevantFeedback = await getRelevantFeedback(message.trim(), 3)

    // Build CLEAN conversation context (avoid polluting current retrieval)
    let conversationContext = ''
    if (chatHistory.length > 0) {
      const recentHistory = chatHistory.slice(-4)
      conversationContext = '\n\nCONVERSATION CONTEXT (for understanding pronouns/references only - DO NOT use for fact retrieval):\n'
      recentHistory.forEach((msg: any) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant'
        const content = msg.content.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content
        conversationContext += `${role}: ${content}\n`
      })
      conversationContext += '\n'
    }

    // Enhanced query processing for counting and "more" requests
    let cleanQuery = message.trim()
    
    // Detect requests for more documents or corrections about count
    const countingPatterns = [
      /\b(that is|that's|only|just)\s+(\d+)\b/i,
      /\b(more|additional|other)\s+(books?|documents?)\b/i,
      /\b(show me more|give me more|need more)\b/i
    ]
    
    const isRequestingMore = countingPatterns.some(pattern => pattern.test(message))
    
    if (isRequestingMore && !(/\b(all|every|complete)\b/i.test(message))) {
      // Convert counting responses to complete catalog requests
      cleanQuery = "show me all books and documents in your knowledge base"
      console.log('🔄 Converted counting/more request to complete catalog request')
    }
    
    // Only enhance query if it has clear pronouns/references that need context
    const needsContext = /\b(it|that|this|they|them|those|these|he|she|his|her|their)\b/i.test(message) && !isRequestingMore
    
    if (needsContext && conversationContext) {
      console.log('🔗 Query contains pronouns - attempting contextual enhancement')
      try {
        const contextualPrompt = `Given this conversation context, resolve any pronouns/references in the current question to create a clear, standalone search query:

${conversationContext}

Current question: "${message}"

Create a clean search query that resolves pronouns but does NOT add extra topics or entities. Focus only on clarifying what "it", "that", "this", etc. refer to.

Examples:
- If previous context mentioned "Warren Buffett" and question is "tell me more about him" → "Warren Buffett"  
- If previous mentioned "value investing" and question is "explain that concept" → "value investing"
- If question is clear already, return it unchanged

Clean search query:`

        const enhancedQuery = await generateChatCompletion([
          { role: 'system', content: contextualPrompt },
          { role: 'user', content: message }
        ])
        
        cleanQuery = enhancedQuery.trim()
        console.log(`🔍 Enhanced query (pronouns resolved): "${cleanQuery}"`)
      } catch (error) {
        console.warn('⚠️ Failed to enhance query, using original:', error)
      }
    }
    
    console.log('🔄 About to call comprehensiveRetrieve with query:', cleanQuery)
    const retrieveResult = await comprehensiveRetrieve(cleanQuery, supabase)
    console.log('✅ Retrieved result:', {
      sources: retrieveResult.sources.length,
      totalAvailable: retrieveResult.totalAvailable,
      method: retrieveResult.retrievalMethod
    })

    // Generate response with strict boundaries and enhanced deduplication instructions
    let systemPrompt = `You are a knowledge base assistant for an asset management company. You have retrieved ${retrieveResult.sources.length} unique documents from the knowledge bank.

${conversationContext}

${retrieveResult.content}

CRITICAL CONSTRAINTS:
1. ONLY use information from the documents explicitly provided above
2. Do NOT reference any books, authors, or content not listed in the retrieved documents  
3. Each document should be mentioned only ONCE - no duplicates or repetitions
4. If asked for a specific number of books but you have fewer unique documents, be honest about the limitation
5. When listing books/documents, ensure each title appears only once in your response
6. If user points out counting issues (like "that is 4!"), acknowledge and offer to show complete catalog
7. Maintain conversation continuity but stay within retrieved content boundaries

DEDUPLICATION RULES:
- Never list the same book/document twice
- If you have multiple versions of the same work, mention it only once
- Be precise about the actual number of unique documents you have

${retrieveResult.warning ? `IMPORTANT: ${retrieveResult.warning}` : ''}

User Question: ${message}`

    const response = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ])

    return NextResponse.json({
      response,
      sources: retrieveResult.sources,
      documentsFound: retrieveResult.sources.length,
      totalDocumentsAvailable: retrieveResult.totalAvailable,
      retrievalMethod: retrieveResult.retrievalMethod,
      warning: retrieveResult.warning,
      conversationContextUsed: chatHistory.length > 0,
      method: 'comprehensive_rag'
    })

  } catch (error) {
    console.error('Error in comprehensive chat API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 