import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'
import { getRelevantFeedback } from '@/lib/feedback'

export async function POST(request: NextRequest) {
  try {
    const { message, chatId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('💬 Chat API called with message:', message.substring(0, 100) + '...')

    // Get server-side Supabase client with error handling
    let supabase
    try {
      supabase = createServerSupabaseClient()
      console.log('✅ Supabase client created successfully')
    } catch (error) {
      console.error('❌ Failed to create Supabase client:', error)
      return NextResponse.json({ 
        error: 'Database connection failed',
        details: 'Unable to connect to document database. Please check configuration.',
        response: 'I apologize, but I cannot access the document database at the moment. Please try again later or contact support if the issue persists.',
        sources: [],
        documentsFound: 0
      }, { status: 500 })
    }

    // Get relevant feedback for context (server-side)
    const relevantFeedback = await getRelevantFeedback(message.trim(), 3)

    // Generate embedding for the user's message with error handling
    let queryEmbedding
    try {
      console.log('🔮 Generating embedding for user query...')
      queryEmbedding = await generateEmbedding(message)
      console.log('✅ Embedding generated successfully')
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error)
      return NextResponse.json({ 
        error: 'Embedding generation failed',
        response: 'I apologize, but I cannot process your query at the moment due to an AI service issue. Please try again later.',
        sources: [],
        documentsFound: 0
      }, { status: 500 })
    }

    // Search for relevant documents using enhanced vector store
    let documents = []
    let searchMethod = 'none'
    
    try {
      console.log('🔍 Searching for relevant documents using vector search...')
      let { data: vectorDocs, error } = await supabase.rpc('match_documents_enhanced', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 5
      })

      if (error) {
        console.error('❌ Vector search failed:', error)
        throw new Error(`Vector search failed: ${error.message}`)
      }

      if (vectorDocs && vectorDocs.length > 0) {
        documents = vectorDocs
        searchMethod = 'vector'
        console.log(`✅ Vector search found ${documents.length} documents`)
      } else {
        console.log('⚠️ Vector search returned no results, trying fallback...')
        throw new Error('No vector search results')
      }
    } catch (error) {
      console.error('❌ Vector search error:', error)
      
      // Try fallback search if enhanced search fails
      try {
        console.log('🔄 Attempting fallback document search...')
        const { data: fallbackDocs, error: fallbackError } = await supabase
          .from('documents_enhanced')
          .select('id, content, title, author, doc_type, genre, topic, difficulty, tags, source_type, summary')
          .limit(5)
        
        if (fallbackError) {
          console.error('❌ Fallback search also failed:', fallbackError)
          throw fallbackError
        }

        if (fallbackDocs && fallbackDocs.length > 0) {
          documents = fallbackDocs
          searchMethod = 'fallback'
          console.log(`✅ Fallback search found ${documents.length} documents`)
        } else {
          console.log('⚠️ No documents found in database')
          searchMethod = 'empty'
        }
      } catch (fallbackError) {
        console.error('❌ All search methods failed:', fallbackError)
        return NextResponse.json({ 
          error: 'Document search failed',
          details: 'Unable to search document database. Database may be empty or misconfigured.',
          response: 'I apologize, but I cannot access any documents in the database at the moment. Please ensure documents have been uploaded and try again.',
          sources: [],
          documentsFound: 0,
          searchMethod: 'failed'
        }, { status: 500 })
      }
    }

    // Prepare context from retrieved documents with enhanced information
    const context = documents
      ?.map((doc: any) => {
        const sourceInfo = `Title: ${doc.title || 'Unknown'} | Author: ${doc.author || 'Unknown'} | Type: ${doc.doc_type || 'Unknown'}`
        const metadata = doc.genre || doc.topic || doc.difficulty ? 
          ` | Genre: ${doc.genre || 'N/A'} | Topic: ${doc.topic || 'N/A'} | Difficulty: ${doc.difficulty || 'N/A'}` : ''
        
        // Limit content length like Streamlit version to prevent huge paragraphs
        const contentPreview = doc.content?.length > 1000 ? 
          doc.content.substring(0, 1000) + "..." : 
          doc.content
        
        return `${sourceInfo}${metadata}\nContent: ${contentPreview}`
      })
      .join('\n\n') || ''

    // Enhanced system prompt that prioritizes retrieved context
    let systemPrompt = `You are an expert AI assistant with access to a comprehensive document library. Your primary goal is to provide thorough, accurate answers based on the retrieved context from the documents.

IMPORTANT INSTRUCTIONS:
1. **PRIORITIZE RETRIEVED CONTEXT**: Always use information from the retrieved documents as your primary source
2. **BE THOROUGH**: Provide comprehensive answers that fully utilize the retrieved context
3. **CITE SOURCES**: When using information from documents, mention the source (title, author, or document type)
4. **CONTEXT FIRST**: Only supplement with general knowledge if the retrieved context is insufficient
5. **BE SPECIFIC**: Include specific details, examples, and explanations from the documents
6. **ACKNOWLEDGE LIMITATIONS**: If the retrieved context doesn't fully answer the question, clearly state what information is missing

RESPONSE STRUCTURE:
- Start with information directly from the retrieved documents
- Provide specific details and examples from the context
- Cite the sources of your information
- Only add general knowledge if it enhances the context-based answer
- If context is insufficient, clearly state what additional information would be helpful

Context from relevant documents:
${context}`

    // Add feedback context if available
    if (relevantFeedback && relevantFeedback.length > 0) {
      const feedbackContext = "\n\nIMPORTANT: Users have provided the following corrections to past similar questions:\n"
      const feedbackDetails = relevantFeedback.map((feedback: any, index: number) => {
        return `${index + 1}. Past query: '${feedback.user_query}'\n   User correction: '${feedback.comment}'`
      }).join('\n')
      
      systemPrompt += feedbackContext + feedbackDetails + "\n\nPlease take these corrections into account in your response."
    }

    // Add final instruction
    systemPrompt += `

Based on the retrieved context above, provide a comprehensive answer that:
1. Thoroughly uses all relevant information from the retrieved documents
2. Cites specific sources when possible
3. Provides detailed explanations and examples from the context
4. Only supplements with general knowledge if the context is insufficient
5. Clearly indicates if more information is needed to fully answer the question`

    // Generate response using OpenAI with enhanced prompt
    const response = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ])

    // Format sources for the frontend with enhanced metadata
    const sources = documents?.map((doc: any) => ({
      title: doc.title || 'Unknown Document',
      author: doc.author || 'Unknown Author',
      doc_type: doc.doc_type || 'Unknown Type',
      genre: doc.genre,
      topic: doc.topic,
      difficulty: doc.difficulty,
      content: doc.content?.substring(0, 300) || '', // Increased preview length
      relevance_score: doc.similarity
    })) || []

    return NextResponse.json({
      response,
      sources,
      documentsFound: documents?.length || 0,
      feedbackApplied: relevantFeedback ? relevantFeedback.length : 0,
      searchMethod
    })

  } catch (error) {
    console.error('Error in chat API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 