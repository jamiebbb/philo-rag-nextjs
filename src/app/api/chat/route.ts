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
        
        // Search all metadata fields in parallel
        const [titleSearch, authorSearch, topicSearch, genreSearch, tagsSearch, docTypeSearch] = await Promise.all([
          supabase.from('documents_enhanced').select('*').ilike('title', `%${term}%`).limit(3),
          supabase.from('documents_enhanced').select('*').ilike('author', `%${term}%`).limit(3),
          supabase.from('documents_enhanced').select('*').ilike('topic', `%${term}%`).limit(3),
          supabase.from('documents_enhanced').select('*').ilike('genre', `%${term}%`).limit(3),
          supabase.from('documents_enhanced').select('*').ilike('tags', `%${term}%`).limit(3),
          supabase.from('documents_enhanced').select('*').ilike('doc_type', `%${term}%`).limit(3)
        ])

        // Dynamic scoring based on term relevance and field importance
        const calculateDynamicScore = (doc: any, field: string, term: string) => {
          const content = (doc[field] || '').toLowerCase()
          const queryTerm = term.toLowerCase()
          
          // Base scores by field importance
          const fieldWeights = {
            title: 0.9,      // Highest weight - title is most important
            author: 0.8,     // High weight - author queries are specific
            topic: 0.7,      // High weight - topic is core content
            genre: 0.6,      // Medium weight - broader categorization
            tags: 0.5,       // Medium weight - supplementary info
            doc_type: 0.4    // Lower weight - general categorization
          }
          
          // Relevance multipliers based on match quality
          let relevanceMultiplier = 0.5 // Base relevance
          
          if (content === queryTerm) {
            relevanceMultiplier = 1.0 // Exact match
          } else if (content.includes(` ${queryTerm} `) || content.startsWith(`${queryTerm} `) || content.endsWith(` ${queryTerm}`)) {
            relevanceMultiplier = 0.9 // Whole word match
          } else if (content.includes(queryTerm)) {
            relevanceMultiplier = 0.7 // Partial match
          }
          
          // Query context bonus (if term appears in query multiple times or is emphasized)
          const queryLower = query.toLowerCase()
          if (queryLower.split(' ').filter(word => word.includes(queryTerm)).length > 1) {
            relevanceMultiplier *= 1.1 // Boost for repeated terms
          }
          
          return (fieldWeights[field as keyof typeof fieldWeights] || 0.3) * relevanceMultiplier
        }

        // Apply dynamic scoring
        const termDocs = [
          ...(titleSearch.data || []).map((doc: any) => ({ 
            ...doc, 
            similarity: calculateDynamicScore(doc, 'title', term),
            match_type: 'title',
            match_term: term
          })),
          ...(authorSearch.data || []).map((doc: any) => ({ 
            ...doc, 
            similarity: calculateDynamicScore(doc, 'author', term),
            match_type: 'author',
            match_term: term
          })),
          ...(topicSearch.data || []).map((doc: any) => ({ 
            ...doc, 
            similarity: calculateDynamicScore(doc, 'topic', term),
            match_type: 'topic',
            match_term: term
          })),
          ...(genreSearch.data || []).map((doc: any) => ({ 
            ...doc, 
            similarity: calculateDynamicScore(doc, 'genre', term),
            match_type: 'genre',
            match_term: term
          })),
          ...(tagsSearch.data || []).map((doc: any) => ({ 
            ...doc, 
            similarity: calculateDynamicScore(doc, 'tags', term),
            match_type: 'tags',
            match_term: term
          })),
          ...(docTypeSearch.data || []).map((doc: any) => ({ 
            ...doc, 
            similarity: calculateDynamicScore(doc, 'doc_type', term),
            match_type: 'doc_type',
            match_term: term
          }))
        ]

        if (termDocs.length > 0) {
          console.log(`📊 Found ${termDocs.length} docs with "${term}" in metadata (dynamic scoring):`)
          termDocs.forEach((doc: any) => {
            console.log(`   - "${doc.title}" by ${doc.author} (${doc.match_type}: ${doc.similarity.toFixed(3)})`)
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

    console.log('💬 Smart Agentic Chat API called with message:', message.substring(0, 100) + '...')
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

    // IMPROVED AGENTIC DECISION: Use pattern matching + AI for better decisions
    console.log('🤖 Using improved agentic approach - analyzing query intent')
    
    // Pattern-based quick decisions
    const quickDecisionPatterns = {
      // Definitely retrieve patterns
      mustRetrieve: [
        /\b(based on|according to|from|in)\s+(your\s+)?(knowledge|context|documents?|database|bank)\b/i,
        /\b(tell me about|explain|what is|who is|when did|where|why|how many|how much)\b/i,
        /\b(find|search|look up|show me|give me|list)\b/i,
        /\b(recommend|suggest|analysis|data|statistics|research)\b/i,
        /\b(book|document|paper|study|report|article)\b.*\b(by|about|on)\b/i
      ],
      // Definitely don't retrieve patterns  
      mustDirect: [
        /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i,
        /^(thank you|thanks|bye|goodbye|see you)\b/i,
        /\b(how are you|what's up|how's it going)\b/i,
        /\b(can you help|what can you do|what are your capabilities)\b/i
      ]
    }

    let quickDecision = null
    
    // Check quick patterns
    if (quickDecisionPatterns.mustRetrieve.some(pattern => pattern.test(message))) {
      quickDecision = 'RETRIEVE'
      console.log('🤖 Quick decision: RETRIEVE (pattern matched)')
    } else if (quickDecisionPatterns.mustDirect.some(pattern => pattern.test(message))) {
      quickDecision = 'DIRECT'
      console.log('🤖 Quick decision: DIRECT (pattern matched)')
    }

    let finalDecision = quickDecision

    // If no quick decision, use AI for nuanced analysis
    if (!quickDecision) {
      const decisionPrompt = `You are an AI assistant that decides whether to search a document database to answer questions. You have access to a curated knowledge bank for an asset management company.

${conversationContext}

Current user message: "${message}"

Analysis Guidelines:
- RETRIEVE: Questions about specific topics, companies, people, books, research, analysis, data, or follow-up questions about previously mentioned subjects
- DIRECT: Greetings, personal questions, system capabilities, general conversation, or meta-questions about the assistant itself

Consider:
1. Does this require specific domain knowledge from documents?
2. Is this asking for information that would be in an asset management knowledge bank?
3. Could this be asking about a specific book, author, company, or financial concept?
4. Is this a follow-up question referring to previous context?

Examples:
- "Hello" → DIRECT
- "What is value investing?" → RETRIEVE  
- "Tell me about Warren Buffett's philosophy" → RETRIEVE
- "How are you?" → DIRECT
- "What companies are mentioned in our database?" → RETRIEVE
- "Can you search for information about ESG?" → RETRIEVE

Respond with exactly one word: RETRIEVE or DIRECT`

      try {
        const decision = await generateChatCompletion([
          { role: 'system', content: decisionPrompt },
          { role: 'user', content: message }
        ])
        
        finalDecision = decision.trim().toUpperCase().includes('RETRIEVE') ? 'RETRIEVE' : 'DIRECT'
        console.log(`🤖 AI decision: "${finalDecision}" (from response: "${decision.trim()}")`)
      } catch (error) {
        console.warn('⚠️ AI decision failed, defaulting to RETRIEVE:', error)
        finalDecision = 'RETRIEVE' // Safe default for knowledge bank
      }
    }

    let retrieveResult = null
    let sources: any[] = []
    let documentsFound = 0
    let searchMethod = 'none'

    // Execute based on decision
    if (finalDecision === 'RETRIEVE') {
      console.log('🤖 Decision: Retrieving documents from knowledge base')
      
      // Enhanced search query with context
      let searchQuery = message
      if (conversationContext) {
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
      searchMethod = 'smart_agentic_retrieve'
    } else {
      console.log('🤖 Decision: Responding directly without document retrieval')
      searchMethod = 'smart_agentic_direct'
    }

    // Generate response based on decision
    let systemPrompt
    if (finalDecision === 'RETRIEVE' && documentsFound > 0) {
      systemPrompt = `You are a knowledge base assistant for an asset management company with access to a curated knowledge bank. You retrieved ${documentsFound} relevant documents to answer the user's question.

${conversationContext}

RETRIEVED CONTEXT FROM KNOWLEDGE BASE:
${retrieveResult.content}

CRITICAL INSTRUCTIONS:
1. Base your response PRIMARILY on the retrieved documents
2. When you say "based on my knowledge" or "based on the context", you are referring to the retrieved documents
3. Cite specific documents when making claims
4. If the retrieved documents don't fully answer the question, say so and explain what information is available
5. Provide detailed, analytical responses using the document content
6. Maintain conversation continuity with the context

USER QUESTION: ${message}`
    } else if (finalDecision === 'RETRIEVE' && documentsFound === 0) {
      systemPrompt = `You are a knowledge base assistant for an asset management company. 

${conversationContext}

I searched the knowledge base for: "${message}" but found no relevant documents.

Respond that you don't have information about this topic in the current knowledge base, and suggest:
1. Trying different search terms or keywords
2. Checking if relevant documents have been uploaded to the knowledge bank
3. Contacting the knowledge base administrator if they believe the information should be available

Do not provide general AI knowledge - stay within the role of a knowledge base assistant.`
    } else {
      // DIRECT response
      systemPrompt = `You are a helpful AI assistant that manages a knowledge base for an asset management company.

${conversationContext}

Current user message: "${message}"

Respond naturally and helpfully. You can:
- Answer greetings and casual conversation
- Explain your capabilities as a knowledge base assistant
- Offer to search the knowledge bank if they ask about specific topics
- Reference previous conversation context when relevant

If they ask about specific financial topics, companies, or investment concepts, offer to search the knowledge base for detailed information.`
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
      conversationContextUsed: chatHistory.length > 0,
      decision: finalDecision,
      decisionMethod: quickDecision ? 'pattern_based' : 'ai_analysis'
    })

  } catch (error) {
    console.error('Error in smart agentic chat API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 