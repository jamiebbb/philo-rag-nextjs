import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'
import { getRelevantFeedback } from '@/lib/feedback'

// Define the retrieve tool function (mimicking Streamlit's approach)
async function retrieveTool(query: string, supabase: any): Promise<{content: string, sources: any[]}> {
  try {
    console.log(`🔍 HYBRID RETRIEVAL for query: "${query}"`)
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query)
    
    // HYBRID SEARCH STRATEGY:
    // 1. Vector similarity search (using context-enhanced embeddings)
    // 2. Direct metadata search (title, author, topic, tags columns)
    // 3. Combine and deduplicate results
    
    console.log('📊 Step 1: Vector similarity search...')
    let { data: vectorDocs, error: vectorError } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: queryEmbedding,
      match_threshold: 0.0,
      match_count: 10 // Get more candidates for hybrid approach
    })

    if (vectorError) {
      console.error('❌ Vector search failed:', vectorError)
      vectorDocs = []
    }

    console.log(`📊 Vector search found: ${vectorDocs?.length || 0} documents`)

    // Step 2: Direct metadata search for terms that might be in title/author/topic
    console.log('📊 Step 2: Direct metadata search...')
    
    // Extract key terms from query for metadata search
    const searchTerms = query.toLowerCase().split(' ').filter(term => 
      term.length > 2 && !['the', 'and', 'how', 'many', 'what', 'who', 'where', 'when', 'why', 'are', 'is', 'at', 'in', 'on', 'for', 'to', 'of', 'from', 'give', 'show', 'find', 'get'].includes(term)
    )
    
    console.log(`📊 Extracted search terms: [${searchTerms.join(', ')}]`)
    console.log(`📊 Original query: "${query}"`)
    
    // Also try searching for common company name patterns
    const companyPatterns = []
    if (query.toLowerCase().includes('general motors')) {
      companyPatterns.push('general motors', 'gm')
    }
    if (query.toLowerCase().includes('general') && query.toLowerCase().includes('motors')) {
      companyPatterns.push('general motors', 'gm')
    }
    
    // Detect potential author name patterns (First Last name combinations)
    const namePatterns = []
    const words = query.toLowerCase().split(' ')
    for (let i = 0; i < words.length - 1; i++) {
      const currentWord = words[i]
      const nextWord = words[i + 1]
      
      // Skip common words that aren't names
      if (['the', 'and', 'from', 'by', 'of', 'book', 'article', 'document', 'recommendation'].includes(currentWord)) continue
      
      // Look for potential "First Last" name patterns
      if (currentWord.length > 2 && nextWord.length > 2) {
        const fullName = `${currentWord} ${nextWord}`
        namePatterns.push(fullName)
        
        // Also add the individual names for fallback
        if (!searchTerms.includes(currentWord)) searchTerms.push(currentWord)
        if (!searchTerms.includes(nextWord)) searchTerms.push(nextWord)
      }
    }
    
    if (namePatterns.length > 0) {
      console.log(`📊 Detected potential author names: [${namePatterns.join(', ')}]`)
    }
    
    if (companyPatterns.length > 0) {
      console.log(`📊 Detected company patterns: [${companyPatterns.join(', ')}]`)
      searchTerms.push(...companyPatterns)
    }
    
    let metadataDocs: any[] = []
    
    // First, search for full name patterns with higher priority
    if (namePatterns.length > 0) {
      for (const fullName of namePatterns) {
        console.log(`🔍 Searching for author name: "${fullName}"`)
        
        const authorNameSearch = await supabase
          .from('documents_enhanced')
          .select('*')
          .ilike('author', `%${fullName}%`)
          .limit(3)
        
        if (authorNameSearch.data && authorNameSearch.data.length > 0) {
          const nameDocs = authorNameSearch.data.map((doc: any) => ({ 
            ...doc, 
            similarity: 0.95, // Higher than individual author matches
            match_type: 'author_full_name' 
          }))
          
          console.log(`📊 Found ${nameDocs.length} docs by "${fullName}":`)
          nameDocs.forEach((doc: any) => {
            console.log(`   - "${doc.title}" by ${doc.author}`)
          })
          metadataDocs.push(...nameDocs)
        }
      }
    }
    
    if (searchTerms.length > 0) {
      // Search across title, author, topic, genre, tags, doc_type columns
      for (const term of searchTerms) {
        console.log(`🔍 Searching for term: "${term}"`)
        
        // Try individual searches first to debug
        const titleSearch = await supabase
          .from('documents_enhanced')
          .select('*')
          .ilike('title', `%${term}%`)
          .limit(2)
          
        const authorSearch = await supabase
          .from('documents_enhanced')
          .select('*')
          .ilike('author', `%${term}%`)
          .limit(2)
          
        const topicSearch = await supabase
          .from('documents_enhanced')
          .select('*')
          .ilike('topic', `%${term}%`)
          .limit(2)
          
        const genreSearch = await supabase
          .from('documents_enhanced')
          .select('*')
          .ilike('genre', `%${term}%`)
          .limit(2)
          
        const tagsSearch = await supabase
          .from('documents_enhanced')
          .select('*')
          .ilike('tags', `%${term}%`)
          .limit(2)
          
        const docTypeSearch = await supabase
          .from('documents_enhanced')
          .select('*')
          .ilike('doc_type', `%${term}%`)
          .limit(2)

        // Combine all results with proper similarity scoring
        const termDocs = [
          ...(titleSearch.data || []).map((doc: any) => ({ ...doc, similarity: 0.95, match_type: 'title' })),
          ...(authorSearch.data || []).map((doc: any) => ({ ...doc, similarity: 0.90, match_type: 'author' })),
          ...(topicSearch.data || []).map((doc: any) => ({ ...doc, similarity: 0.85, match_type: 'topic' })),
          ...(genreSearch.data || []).map((doc: any) => ({ ...doc, similarity: 0.85, match_type: 'genre' })),
          ...(tagsSearch.data || []).map((doc: any) => ({ ...doc, similarity: 0.80, match_type: 'tags' })),
          ...(docTypeSearch.data || []).map((doc: any) => ({ ...doc, similarity: 0.75, match_type: 'doc_type' }))
        ]

        if (termDocs.length > 0) {
          console.log(`📊 Found ${termDocs.length} docs with "${term}" in metadata:`)
          termDocs.forEach((doc: any) => {
            console.log(`   - "${doc.title}" by ${doc.author}`)
          })
          metadataDocs.push(...termDocs)
        } else {
          console.log(`📊 No docs found with "${term}" in metadata`)
        }
      }
    }

    // Step 3: Combine and deduplicate results
    console.log('📊 Step 3: Combining and deduplicating results...')
    
    const allDocs = [...(vectorDocs || []), ...metadataDocs]
    const uniqueDocs = new Map()
    
    // Deduplicate by ID, keeping highest similarity score
    allDocs.forEach((doc: any) => {
      const existingDoc = uniqueDocs.get(doc.id)
      if (!existingDoc || (doc.similarity || 0) > (existingDoc.similarity || 0)) {
                 uniqueDocs.set(doc.id, {
           ...doc,
           search_method: vectorDocs?.some((vd: any) => vd.id === doc.id) ? 
             (metadataDocs.some((md: any) => md.id === doc.id) ? 'hybrid' : 'vector') : 
             'metadata'
         })
      }
    })

    const finalDocs = Array.from(uniqueDocs.values())
      .sort((a, b) => {
        // Prioritize hybrid matches, then vector, then metadata
        const priorityA = a.search_method === 'hybrid' ? 3 : (a.search_method === 'vector' ? 2 : 1)
        const priorityB = b.search_method === 'hybrid' ? 3 : (b.search_method === 'vector' ? 2 : 1)
        
        if (priorityA !== priorityB) return priorityB - priorityA
        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, 5) // Take top 5 results

    console.log(`📊 HYBRID SEARCH RESULTS: ${finalDocs.length} total documents`)
    finalDocs.forEach((doc: any, i: number) => {
      console.log(`   ${i+1}. ${doc.title} (${doc.author || 'No author'}) - Method: ${doc.search_method} - Similarity: ${doc.similarity?.toFixed(3) || 'N/A'}`)
    })

    if (finalDocs.length === 0) {
      console.log('ℹ️ No documents found in hybrid search')
      return {
        content: "Found 0 relevant documents for query: '" + query + "'\n\nNo documents found. This could mean:\n1. The document hasn't been uploaded\n2. The search terms don't match the content or metadata\n3. Try different keywords or check the Vector Store tab",
        sources: []
      }
    }

    // Format documents for AI processing (not for display)
    const contextForAI = finalDocs.map((doc: any, i: number) => {
      const title = doc.title || 'Unknown Document'
      const author = doc.author || 'Unknown Author'
      const docType = doc.doc_type || 'Unknown Type'
      
      return `Document ${i+1}: "${title}" by ${author} (${docType})
Content: ${doc.content}`
    }).join('\n\n---\n\n')
    
    const searchSummary = `Found ${finalDocs.length} relevant documents for query: '${query}'`
    const finalResult = `${searchSummary}\n\nDOCUMENTS:\n${contextForAI}`

    const sources = finalDocs.map((doc: any) => ({
      title: doc.title || 'Unknown Document',
      author: doc.author || 'Unknown Author',
      doc_type: doc.doc_type || 'Unknown Type',
      genre: doc.genre,
      topic: doc.topic,
      difficulty: doc.difficulty,
      content: doc.content?.substring(0, 300) || '',
      relevance_score: doc.similarity,
      search_method: doc.search_method
    }))

    return {
      content: finalResult,
      sources: sources
    }

  } catch (error) {
    console.error('❌ Error in hybrid retrieve tool:', error)
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