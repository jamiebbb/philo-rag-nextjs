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
  console.log(`🔍 Comprehensive retrieval for: "${query}"`)

  try {
    // Detect if this is a "show all" or "outline all" type query
    const completeCatalogPatterns = [
      /\b(all|every|entire|complete|full list of|outline all|list all|show all)\s+(books?|documents?|papers?|studies?|reports?|articles?)\b/i,
      /\b(what books? do you have|what's in your|catalog|inventory|database contents)\b/i,
      /\b(outline|summarize|list)\s+(all|every|everything)\b/i
    ]

    const isCompleteCatalogRequest = completeCatalogPatterns.some(pattern => pattern.test(query))

    if (isCompleteCatalogRequest) {
      console.log('📚 Detected complete catalog request - retrieving all available documents')
      
      // Get ALL documents with basic info for catalog listing
      const { data: allDocs, error } = await supabase
        .from('documents_enhanced')
        .select('id, title, author, doc_type, topic, genre, difficulty, content')
        .order('title')
        .limit(200) // Reasonable limit to prevent overload

      if (error) {
        throw new Error(`Database query failed: ${error.message}`)
      }

      if (!allDocs || allDocs.length === 0) {
        return {
          content: 'No documents found in the knowledge base.',
          sources: [],
          totalAvailable: 0,
          retrievalMethod: 'complete_catalog_empty'
        }
      }

      // Format as catalog
      const catalogContent = `COMPLETE KNOWLEDGE BASE CATALOG (${allDocs.length} total documents):

${allDocs.map((doc: any, i: number) => 
  `${i+1}. "${doc.title}" by ${doc.author || 'Unknown Author'}
   Type: ${doc.doc_type || 'Unknown'} | Topic: ${doc.topic || 'General'} | Genre: ${doc.genre || 'N/A'}
   Difficulty: ${doc.difficulty || 'N/A'}
   Preview: ${doc.content?.substring(0, 150) || 'No preview available'}...
`).join('\n')}

END OF CATALOG`

      const sources = allDocs.map((doc: any) => ({
        title: doc.title || 'Unknown Document',
        author: doc.author || 'Unknown Author',
        doc_type: doc.doc_type || 'Unknown Type',
        topic: doc.topic,
        genre: doc.genre,
        difficulty: doc.difficulty,
        content: doc.content?.substring(0, 300) || '',
        relevance_score: 1.0,
        search_method: 'complete_catalog'
      }))

      return {
        content: catalogContent,
        sources,
        totalAvailable: allDocs.length,
        retrievalMethod: 'complete_catalog',
        warning: allDocs.length >= 200 ? 'Showing first 200 documents. Use more specific queries for targeted results.' : undefined
      }
    }

    // Regular targeted retrieval
    console.log('🎯 Performing targeted document retrieval')

    // Vector search
    const queryEmbedding = await generateEmbedding(query)
    const { data: vectorResults, error: vectorError } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: queryEmbedding,
      match_threshold: 0.1,
      match_count: 12
    })

    if (vectorError) {
      throw new Error(`Vector search failed: ${vectorError.message}`)
    }

    // Get total count for context
    const { count: totalCount } = await supabase
      .from('documents_enhanced')
      .select('*', { count: 'exact', head: true })

    const finalDocs = (vectorResults || []).slice(0, 8)

    // Format results with clear boundaries
    const contextForAI = `RETRIEVED DOCUMENTS (${finalDocs.length} out of ${totalCount || 'unknown'} total in database):

${finalDocs.map((doc: any, i: number) => 
  `Document ${i+1}: "${doc.title}" by ${doc.author || 'Unknown Author'}
  Type: ${doc.doc_type || 'Unknown'} | Relevance: ${(doc.similarity || 0).toFixed(3)}
  Content: ${doc.content}`
).join('\n\n---\n\n')}

END OF RETRIEVED DOCUMENTS

IMPORTANT: Only reference the ${finalDocs.length} documents listed above. Do not mention or reference any other books, documents, or content not explicitly provided in this context.`

    const sources = finalDocs.map((doc: any) => ({
      title: doc.title || 'Unknown Document',
      author: doc.author || 'Unknown Author',
      doc_type: doc.doc_type || 'Unknown Type',
      topic: doc.topic,
      genre: doc.genre,
      difficulty: doc.difficulty,
      content: doc.content?.substring(0, 300) || '',
      relevance_score: doc.similarity || 0,
      search_method: 'vector'
    }))

    return {
      content: contextForAI,
      sources,
      totalAvailable: totalCount || 0,
      retrievalMethod: 'targeted_retrieval'
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

    // Use clean query without conversation pollution for retrieval
    let cleanQuery = message.trim()
    
    // Only enhance query if it has clear pronouns/references that need context
    const needsContext = /\b(it|that|this|they|them|those|these|he|she|his|her|their)\b/i.test(message)
    
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
    
    const retrieveResult = await comprehensiveRetrieve(cleanQuery, supabase)

    // Generate response with strict boundaries
    let systemPrompt = `You are a knowledge base assistant for an asset management company. You have retrieved ${retrieveResult.sources.length} documents from the knowledge bank.

${conversationContext}

${retrieveResult.content}

CRITICAL CONSTRAINTS:
1. ONLY use information from the documents explicitly provided above
2. Do NOT reference any books, authors, or content not listed in the retrieved documents
3. If asked about "all books" but only ${retrieveResult.sources.length} are retrieved, say "Here are the ${retrieveResult.sources.length} most relevant documents I found" and list only those
4. When mentioning any book/document, it MUST be from the retrieved list above
5. If the query asks for more than what's available in the retrieved documents, acknowledge the limitation
6. Maintain conversation continuity but stay within retrieved content boundaries

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
      feedbackApplied: relevantFeedback ? relevantFeedback.length : 0,
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