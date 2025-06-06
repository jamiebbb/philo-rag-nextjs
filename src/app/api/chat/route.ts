import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'
import { getRelevantFeedback } from '@/lib/feedback'

// Define the retrieve tool function (mimicking Streamlit's approach)
async function retrieveTool(query: string, supabase: any): Promise<{content: string, sources: any[]}> {
  try {
    console.log(`🔍 RETRIEVE TOOL called for: "${query}"`)
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query)
    
    // Use the enhanced vector search with similarity_search behavior
    // Match Streamlit's approach: k=5, threshold=0.0 (top K regardless of similarity)
    let { data: vectorDocs, error } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: queryEmbedding,
      match_threshold: 0.0, // Like Streamlit: get top K regardless of similarity
      match_count: 5 // Like Streamlit: k=5
    })

    if (error) {
      console.error('❌ Vector search failed:', error)
      return {
        content: `Error retrieving documents: ${error.message}`,
        sources: []
      }
    }

    if (!vectorDocs || vectorDocs.length === 0) {
      console.log('ℹ️ No documents found in database')
      return {
        content: "Found 0 relevant documents for query: '" + query + "'\n\nNo documents found. This could mean:\n1. The document hasn't been uploaded\n2. The search terms don't match the content\n3. Try different keywords or check the Vector Store tab",
        sources: []
      }
    }

    // Process results like Streamlit's retrieve tool
    console.log(`✅ Found ${vectorDocs.length} documents`)
    vectorDocs.forEach((d: any, i: number) => {
      console.log(`   ${i+1}. ${d.title} (${d.author || 'No author'}) - Similarity: ${d.similarity?.toFixed(3)} - Type: ${d.doc_type}`)
    })

    // Format documents like Streamlit
    const serializedParts = vectorDocs.map((doc: any, i: number) => {
      const title = doc.title || 'Unknown Document'
      const author = doc.author || 'Unknown Author'
      const docType = doc.doc_type || 'Unknown Type'
      
      const sourceInfo = `Document ${i+1}: ${title} by ${author} (${docType})`
      const contentPreview = doc.content?.length > 1000 ? 
        doc.content.substring(0, 1000) + "..." : 
        doc.content
      
      return `Source: ${sourceInfo}\nContent: ${contentPreview}`
    })

    const serialized = "\n\n" + "=".repeat(50) + "\n\n" + serializedParts.join("\n\n" + "=".repeat(50) + "\n\n")
    
    const searchSummary = `Found ${vectorDocs.length} relevant documents for query: '${query}'`
    const finalResult = `${searchSummary}\n\n${serialized}`

    const sources = vectorDocs.map((doc: any) => ({
      title: doc.title || 'Unknown Document',
      author: doc.author || 'Unknown Author',
      doc_type: doc.doc_type || 'Unknown Type',
      genre: doc.genre,
      topic: doc.topic,
      difficulty: doc.difficulty,
      content: doc.content?.substring(0, 300) || '',
      relevance_score: doc.similarity
    }))

    return {
      content: finalResult,
      sources: sources
    }

  } catch (error) {
    console.error('❌ Error in retrieve tool:', error)
    return {
      content: `Error retrieving documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      sources: []
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('💬 AGENTIC Chat API called with message:', message.substring(0, 100) + '...')
    console.log('📜 Chat history length:', chatHistory.length)

    // Get server-side Supabase client
    let supabase
    try {
      supabase = createServerSupabaseClient()
      console.log('✅ Supabase client created successfully')
    } catch (error) {
      console.error('❌ Failed to create Supabase client:', error)
      return NextResponse.json({ 
        error: 'Database connection failed',
        response: 'I apologize, but I cannot access the document database at the moment. Please try again later or contact support if the issue persists.',
        sources: [],
        documentsFound: 0
      }, { status: 500 })
    }

    // Get relevant feedback for context
    const relevantFeedback = await getRelevantFeedback(message.trim(), 3)

    // Build conversation context for better understanding
    let conversationContext = ''
    if (chatHistory.length > 0) {
      console.log('🔗 Building conversation context from chat history...')
      const recentHistory = chatHistory.slice(-6) // Last 6 messages for context
      conversationContext = '\n\nCONVERSATION CONTEXT (for reference pronouns and follow-up questions):\n'
      recentHistory.forEach((msg: any, index: number) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant'
        const content = msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content
        conversationContext += `${role}: ${content}\n`
      })
      conversationContext += '\n'
    }

    // AGENTIC APPROACH: Let AI decide whether to retrieve documents
    console.log('🤖 Using agentic approach - AI will decide whether to retrieve documents')
    
    // Step 1: Ask AI if it needs to retrieve documents (with conversation context)
    const decisionPrompt = `You are an AI assistant that needs to decide whether to search a document database to answer a user's question.

${conversationContext}

Current user message: "${message}"

Consider both the current message AND the conversation context. Respond with EXACTLY ONE WORD:
- "RETRIEVE" if this question requires searching specific documents (e.g., questions about specific topics, books, research, follow-up questions about previously mentioned topics)
- "DIRECT" if this is a greeting, general conversation, or something you can answer without needing specific documents

Examples:
- "hello" → DIRECT
- "how are you?" → DIRECT  
- "what is philosophy?" → RETRIEVE
- "tell me about machine learning" → RETRIEVE
- "good morning" → DIRECT
- "how many employees do they have?" (after discussing a company) → RETRIEVE

Your response (one word only):`

    const decision = await generateChatCompletion([
      { role: 'system', content: decisionPrompt },
      { role: 'user', content: message }
    ])

    console.log(`🤖 AI decision: "${decision.trim()}"`)

    let retrieveResult = null
    let sources: any[] = []
    let documentsFound = 0
    let searchMethod = 'none'

    // Step 2: Based on AI decision, retrieve documents or proceed directly
    if (decision.trim().toUpperCase().includes('RETRIEVE')) {
      console.log('🤖 AI decided to retrieve documents')
      
      // For retrieval, combine current message with recent conversation context for better search
      let searchQuery = message
      if (conversationContext) {
        // Extract key entities/topics from recent conversation for enhanced search
        const contextualSearchPrompt = `Given this conversation context and current question, create an enhanced search query that includes relevant entities/topics from the conversation:

${conversationContext}

Current question: "${message}"

Create a search query that combines the current question with relevant context. For example:
- If conversation was about "General Motors" and question is "how many employees?", return: "General Motors employees"
- If conversation was about "philosophy" and question is "tell me more", return: "philosophy"

Enhanced search query:`

        try {
          const enhancedQuery = await generateChatCompletion([
            { role: 'system', content: contextualSearchPrompt },
            { role: 'user', content: message }
          ])
          
          searchQuery = enhancedQuery.trim()
          console.log(`🔍 Enhanced search query: "${searchQuery}"`)
        } catch (error) {
          console.warn('⚠️ Failed to enhance search query, using original:', error)
        }
      }
      
      retrieveResult = await retrieveTool(searchQuery, supabase)
      sources = retrieveResult.sources
      documentsFound = sources.length
      searchMethod = 'agentic_retrieve_contextual'
    } else {
      console.log('🤖 AI decided to respond directly without retrieving documents')
      searchMethod = 'agentic_direct'
    }

    // Step 3: Generate final response with full conversation context
    let systemPrompt
    if (retrieveResult && documentsFound > 0) {
      // AI decided to retrieve documents - use them in context
      systemPrompt = `You are an expert AI assistant. You have retrieved relevant documents from the knowledge base to help answer the user's question.

${conversationContext}

RETRIEVED CONTEXT:
${retrieveResult.content}

Based on the conversation history and retrieved context, provide a comprehensive answer that:
1. Uses information from the retrieved documents as your primary source
2. References previous conversation context when relevant (e.g., "they" refers to previously mentioned company)
3. Cites specific sources when possible
4. Provides detailed explanations and examples from the context
5. Maintains conversational continuity

USER QUESTION: ${message}`
    } else {
      // AI decided not to retrieve - respond directly with conversation context
      systemPrompt = `You are a helpful AI assistant with memory of the current conversation.

${conversationContext}

Current user message: "${message}"

Respond naturally and helpfully, taking into account the conversation history. Reference previous topics when relevant (e.g., if they ask "tell me more" after discussing a topic). If this seems like a question that might be answered by documents in a knowledge base, offer to search for specific information.`
    }

    // Add feedback context if available
    if (relevantFeedback && relevantFeedback.length > 0) {
      const feedbackContext = "\n\nIMPORTANT: Users have provided the following corrections to past similar questions:\n"
      const feedbackDetails = relevantFeedback.map((feedback: any, index: number) => {
        return `${index + 1}. Past query: '${feedback.user_query}'\n   User correction: '${feedback.comment}'`
      }).join('\n')
      
      systemPrompt += feedbackContext + feedbackDetails + "\n\nPlease take these corrections into account in your response."
    }

    // Generate final response
    const response = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ])

    return NextResponse.json({
      response,
      sources,
      documentsFound,
      feedbackApplied: relevantFeedback ? relevantFeedback.length : 0,
      searchMethod,
      conversationContextUsed: chatHistory.length > 0
    })

  } catch (error) {
    console.error('Error in agentic chat API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 