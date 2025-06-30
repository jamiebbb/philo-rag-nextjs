import { createServerSupabaseClient } from './supabase'
import { generateEmbedding, generateChatCompletion } from './openai'
import { CitationFormatter, type DocumentSource } from './citation-formatter'
import type { QueryClassification } from './unified-query-router'

export interface AdviceRequest {
  query: string
  classification: QueryClassification
  chatHistory?: any[]
}

export interface AdviceResponse {
  content: string
  sources: DocumentSource[]
  metadata: {
    usedUploadedBooks: boolean
    usedGeneralKnowledge: boolean
    sourcesAvailable: number
    constraintViolations: string[]
  }
}

export class AdviceSynthesizer {
  private supabase: any

  constructor() {
    this.supabase = createServerSupabaseClient()
  }

  async synthesizeAdvice(request: AdviceRequest): Promise<AdviceResponse> {
    console.log('💡 Synthesizing advice for query:', request.query)
    console.log('🎯 Classification:', request.classification.type)
    console.log('🔒 Constraints:', request.classification.constraints)

    const { query, classification } = request
    const constraints = classification.constraints

    // Step 1: Search for relevant content from uploaded books
    const bookSources = await this.searchUploadedBooks(query, classification)
    
    console.log(`📚 Found ${bookSources.length} relevant sources from uploaded books`)

    // Step 2: Determine if we have sufficient content or need general knowledge
    const needsGeneral = this.shouldUseGeneralKnowledge(bookSources, constraints)
    
    // Step 3: Generate response based on constraints and available content
    const response = await this.generateResponse(
      query, 
      bookSources, 
      constraints,
      needsGeneral,
      request.chatHistory
    )

    return response
  }

  private async searchUploadedBooks(query: string, classification: QueryClassification): Promise<DocumentSource[]> {
    try {
      // Generate embedding for semantic search
      const queryEmbedding = await generateEmbedding(query)

      // Use hybrid search: vector similarity + metadata search
      const { data: vectorResults, error: vectorError } = await this.supabase.rpc(
        'match_documents_enhanced',
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.1,
          match_count: 20
        }
      )

      if (vectorError) {
        console.error('❌ Vector search failed:', vectorError)
        return []
      }

      let relevantDocs = vectorResults || []

      // Apply topic filter if specified
      if (classification.constraints.topicFilter) {
        const topic = classification.constraints.topicFilter.toLowerCase()
        relevantDocs = relevantDocs.filter((doc: any) => 
          doc.topic?.toLowerCase().includes(topic) ||
          doc.genre?.toLowerCase().includes(topic) ||
          doc.tags?.toLowerCase().includes(topic) ||
          doc.title?.toLowerCase().includes(topic)
        )
      }

      // Apply difficulty filter if specified
      if (classification.constraints.difficulty) {
        const difficulty = classification.constraints.difficulty.toLowerCase()
        relevantDocs = relevantDocs.filter((doc: any) =>
          doc.difficulty?.toLowerCase().includes(difficulty)
        )
      }

      // Convert to DocumentSource format and deduplicate by book
      const sourcesMap = new Map<string, DocumentSource>()
      
      relevantDocs.forEach((doc: any) => {
        if (!doc.title) return

        const bookKey = `${doc.title.toLowerCase()}-${(doc.author || 'unknown').toLowerCase()}`
        
        if (!sourcesMap.has(bookKey) || (doc.similarity > (sourcesMap.get(bookKey)?.similarity || 0))) {
          sourcesMap.set(bookKey, {
            title: doc.title,
            author: doc.author || 'Unknown Author',
            content: doc.content || '',
            doc_type: doc.doc_type,
            similarity: doc.similarity
          })
        }
      })

      const sources = Array.from(sourcesMap.values())
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, 10) // Limit to top 10 most relevant sources

      return sources

    } catch (error) {
      console.error('❌ Error searching uploaded books:', error)
      return []
    }
  }

  private shouldUseGeneralKnowledge(bookSources: DocumentSource[], constraints: any): boolean {
    // If user explicitly requested only uploaded books, never use general knowledge
    if (constraints.useOnlyUploadedBooks) {
      return false
    }

    // If we have good coverage from books (3+ sources with decent similarity), books should be primary
    const goodSources = bookSources.filter(source => (source.similarity || 0) > 0.3)
    
    // For general advice, supplement with general knowledge if we have limited book content
    return goodSources.length < 2
  }

  private async generateResponse(
    query: string,
    bookSources: DocumentSource[],
    constraints: any,
    useGeneral: boolean,
    chatHistory?: any[]
  ): Promise<AdviceResponse> {
    
    const constraintViolations: string[] = []
    
    // Check constraint violations
    if (constraints.useOnlyUploadedBooks && bookSources.length === 0) {
      constraintViolations.push('No relevant uploaded books found for this query')
    }

    // Build context for AI
    let systemPrompt = ''
    let bookContext = ''

    if (bookSources.length > 0) {
      bookContext = bookSources.map((source, index) => 
        `BOOK ${index + 1}: "${source.title}" by ${source.author}\nContent: ${source.content}\n`
      ).join('\n')

      systemPrompt = `You are an expert advisor with access to a curated library of business and professional development books.

UPLOADED BOOKS CONTENT:
${bookContext}

USER CONSTRAINTS:
- Only use uploaded books: ${constraints.useOnlyUploadedBooks ? 'YES - Do not use any external knowledge' : 'NO - You may supplement with general knowledge'}
- Topic focus: ${constraints.topicFilter || 'Any topic'}
- Difficulty level: ${constraints.difficulty || 'Any level'}

INSTRUCTIONS:
1. Base your advice primarily on the uploaded books content above
2. ${constraints.useOnlyUploadedBooks ? 
   'STRICTLY limit your response to insights from the uploaded books only. If the books don\'t contain relevant information, say so explicitly.' :
   'Use the uploaded books as your primary source, but you may supplement with general knowledge if needed'}
3. Always cite your sources using the format: (Book Title, Author, p. XX) if page numbers are available
4. Be practical and actionable in your advice
5. If multiple books offer different perspectives, acknowledge and compare them

User Question: ${query}`

    } else if (constraints.useOnlyUploadedBooks) {
      // No book sources but user requested only uploaded books
      return {
        content: `I don't have any relevant information in my uploaded books to answer your question about "${query}". To get advice on this topic, you could either:

1. Upload relevant books or documents on this subject
2. Allow me to use general knowledge by asking the question without the "only uploaded books" constraint

Would you like me to search for general advice instead, or would you prefer to upload more relevant content first?`,
        sources: [],
        metadata: {
          usedUploadedBooks: false,
          usedGeneralKnowledge: false,
          sourcesAvailable: 0,
          constraintViolations: ['No relevant uploaded books found']
        }
      }

    } else {
      // No book sources, use general knowledge
      systemPrompt = `You are an expert business and professional development advisor.

The user has asked for advice, but I don't have specific relevant content in the uploaded book library for this query.

Provide helpful, practical advice based on general business knowledge and best practices.

User Question: ${query}`
    }

    // Generate the response
    try {
      const aiResponse = await generateChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ])

      // Add citations if we used book sources
      let finalContent = aiResponse
      if (bookSources.length > 0) {
        finalContent = CitationFormatter.addCitationsToResponse(aiResponse, bookSources)
      }

      return {
        content: finalContent,
        sources: bookSources,
        metadata: {
          usedUploadedBooks: bookSources.length > 0,
          usedGeneralKnowledge: useGeneral,
          sourcesAvailable: bookSources.length,
          constraintViolations
        }
      }

    } catch (error) {
      console.error('❌ Error generating advice response:', error)
      throw new Error('Failed to generate advice response')
    }
  }

  // Specialized handler for HR scenarios
  async synthesizeHRAdvice(request: AdviceRequest): Promise<AdviceResponse> {
    console.log('👥 Synthesizing HR-specific advice')

    // First, try to find HR-related content in uploaded books
    const hrQuery = `${request.query} human resources management workplace employee`
    const modifiedRequest = {
      ...request,
      query: hrQuery
    }

    const result = await this.synthesizeAdvice(modifiedRequest)

    // If no relevant HR content found and not restricted to uploaded books only
    if (result.sources.length === 0 && !request.classification.constraints.useOnlyUploadedBooks) {
      const hrSystemPrompt = `You are an experienced HR professional and management consultant.

Provide practical, ethical, and legally-conscious advice for this workplace scenario. Consider:
- Best practices in human resources
- Legal considerations (while noting you're not providing legal advice)
- Employee relations and communication strategies  
- Risk management and documentation
- Fairness and consistency in management decisions

User Question: ${request.query}`

      try {
        const aiResponse = await generateChatCompletion([
          { role: 'system', content: hrSystemPrompt },
          { role: 'user', content: request.query }
        ])

        return {
          content: aiResponse + '\n\n*Note: This advice is based on general HR best practices. Always consult with your HR department and legal counsel for specific situations.*',
          sources: [],
          metadata: {
            usedUploadedBooks: false,
            usedGeneralKnowledge: true,
            sourcesAvailable: 0,
            constraintViolations: []
          }
        }

      } catch (error) {
        console.error('❌ Error generating HR advice:', error)
        throw new Error('Failed to generate HR advice response')
      }
    }

    return result
  }
}

export {} 