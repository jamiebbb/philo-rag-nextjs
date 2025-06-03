import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, relevantFeedback } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Generate embedding for the user's message
    const queryEmbedding = await generateEmbedding(message)

    // Search for relevant documents using enhanced vector store
    let { data: documents, error } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5
    })

    if (error) {
      console.error('Error searching documents:', error)
      // Try fallback search if enhanced search fails
      const { data: fallbackDocs, error: fallbackError } = await supabase
        .from('documents_enhanced')
        .select('id, content, title, author, doc_type, genre, topic, difficulty, tags, source_type, summary')
        .limit(5)
      
      if (fallbackError) {
        return NextResponse.json({ error: 'Failed to search documents' }, { status: 500 })
      }
      
      console.log('Using fallback document search')
      // Use fallback documents
      documents = fallbackDocs
    }

    // Prepare context from retrieved documents with enhanced information
    const context = documents
      ?.map((doc: any) => {
        const sourceInfo = `Title: ${doc.title || 'Unknown'} | Author: ${doc.author || 'Unknown'} | Type: ${doc.doc_type || 'Unknown'}`
        const metadata = doc.genre || doc.topic || doc.difficulty ? 
          ` | Genre: ${doc.genre || 'N/A'} | Topic: ${doc.topic || 'N/A'} | Difficulty: ${doc.difficulty || 'N/A'}` : ''
        return `${sourceInfo}${metadata}\nContent: ${doc.content}`
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
      feedbackApplied: relevantFeedback ? relevantFeedback.length : 0
    })

  } catch (error) {
    console.error('Error in chat API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 