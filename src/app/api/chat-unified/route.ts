import { NextRequest, NextResponse } from 'next/server'
import { UnifiedQueryRouter, type QueryContext } from '@/lib/unified-query-router'
import { MemoryCatalogHandler } from '@/lib/memory-catalog-handler'
import { AdviceSynthesizer } from '@/lib/advice-synthesizer'
import { generateLibrarianRecommendations } from '@/lib/recommendation-engine'
import { CitationFormatter } from '@/lib/citation-formatter'

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, chatHistory = [] } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🤖 Unified Chat API called with message:', message)

    // Prepare context for query classification
    const context: QueryContext = {
      chatHistory,
      lastAssistantResponse: chatHistory.length > 0 ? 
        chatHistory.filter((msg: any) => msg.role === 'assistant').pop()?.content : undefined,
      lastUserQuery: chatHistory.length > 0 ? 
        chatHistory.filter((msg: any) => msg.role === 'user').pop()?.content : undefined
    }

    // Classify the query
    const classification = await UnifiedQueryRouter.classifyQuery(message, context)
    console.log('🎯 Query classified as:', classification.type)
    console.log('🔍 Confidence:', classification.confidence)
    console.log('📋 Constraints:', classification.constraints)

    let response
    let sources = []
    let metadata = {}

    // Route to appropriate handler based on classification
    switch (classification.type) {
      
      case 'memory_queries':
        response = await handleMemoryQueries(message, classification)
        sources = response.sources || []
        metadata = response.metadata || {}
        break

      case 'book_recommendations':
        response = await handleBookRecommendations(message, classification, context)
        sources = response.sources || []
        metadata = response.metadata || {}
        break

      case 'topic_book_lists':
        response = await handleTopicBookLists(message, classification)
        sources = response.sources || []
        metadata = response.metadata || {}
        break

      case 'advice_books_only':
      case 'advice_general':
        response = await handleAdviceRequests(message, classification, chatHistory)
        sources = response.sources || []
        metadata = response.metadata || {}
        break

      case 'hr_scenarios':
        response = await handleHRScenarios(message, classification, chatHistory)
        sources = response.sources || []
        metadata = response.metadata || {}
        break

      default:
        // Fallback to general advice
        response = await handleAdviceRequests(message, classification, chatHistory)
        sources = response.sources || []
        metadata = response.metadata || {}
    }

    console.log('✅ Response generated successfully')

    return NextResponse.json({
      response: response.content || response,
      sources,
      metadata: {
        queryType: classification.type,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        constraints: classification.constraints,
        contextual: classification.contextual,
        ...metadata
      },
      classification,
      method: 'unified_routing'
    })

  } catch (error) {
    console.error('❌ Error in unified chat API:', error)
    return NextResponse.json(
      { error: 'Chat error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}

async function handleMemoryQueries(message: string, classification: any) {
  console.log('📚 Handling memory/catalog query')
  
  const memoryHandler = new MemoryCatalogHandler()
  
  // Extract parameters from the query
  const count = classification.constraints.count
  const topic = classification.constraints.topicFilter
  const difficulty = classification.constraints.difficulty
  
  const result = await memoryHandler.getBooks({
    count,
    topic,
    difficulty,
    page: 1,
    pageSize: 20
  })

  const responseText = memoryHandler.formatBooksForResponse(result, !!count)
  
  return {
    content: responseText,
    sources: memoryHandler.convertToDocumentSources(result.books.slice(0, 5)), // Limit sources for response
    metadata: {
      totalBooks: result.totalCount,
      hasMore: result.hasMore,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      filters: { count, topic, difficulty }
    }
  }
}

async function handleBookRecommendations(message: string, classification: any, context: QueryContext) {
  console.log('📖 Handling book recommendation query')
  
  try {
    // Use the existing recommendation engine
    const recommendationRequest = {
      query: message,
      userProfile: {
        interests: [],
        difficulty_preference: classification.constraints.difficulty as any || 'Intermediate',
        preferred_genres: classification.constraints.topicFilter ? [classification.constraints.topicFilter] : [],
        reading_history: []
      },
      context: {
        current_books: [],
        learning_goals: [classification.constraints.topicFilter || 'general'],
        time_constraints: 'normal'
      }
    }

    const recommendations = await generateLibrarianRecommendations(recommendationRequest)
    
    let responseText = `Here are my book recommendations for you:\n\n`
    
    if (recommendations.recommendations && recommendations.recommendations.length > 0) {
      recommendations.recommendations.slice(0, 5).forEach((rec, index) => {
        responseText += `${index + 1}. **"${rec.title}"** by ${rec.author}\n`
        if (rec.genre) responseText += `   Genre: ${rec.genre} | `
        if (rec.difficulty) responseText += `Difficulty: ${rec.difficulty}\n`
        if (rec.summary) responseText += `   ${rec.summary.substring(0, 150)}...\n`
        responseText += `   Recommendation score: ${(rec.recommendation_score * 100).toFixed(0)}%\n\n`
      })
    } else {
      responseText += "I don't have specific book recommendations in my current collection for this query. Consider uploading more books to improve my recommendation capabilities."
    }

    // Convert recommendations to sources
    const sources = recommendations.recommendations?.slice(0, 5).map(rec => ({
      title: rec.title,
      author: rec.author,
      content: rec.summary || '',
      doc_type: rec.doc_type || 'Book',
      similarity: rec.recommendation_score
    })) || []

    return {
      content: responseText,
      sources,
      metadata: {
        recommendationCount: recommendations.recommendations?.length || 0,
        learningPathways: recommendations.learningPathways?.length || 0,
        gapAnalysis: recommendations.gapAnalysis || null
      }
    }

  } catch (error) {
    console.error('❌ Error in book recommendations:', error)
    return {
      content: "I encountered an error while generating book recommendations. Please try again or rephrase your request.",
      sources: [],
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
}

async function handleTopicBookLists(message: string, classification: any) {
  console.log('📋 Handling topic-specific book list query')
  
  const memoryHandler = new MemoryCatalogHandler()
  
  const result = await memoryHandler.getBooks({
    count: classification.constraints.count || 5,
    topic: classification.constraints.topicFilter,
    difficulty: classification.constraints.difficulty
  })

  if (result.books.length === 0) {
    return {
      content: `I don't have any books on ${classification.constraints.topicFilter} in my current collection. Consider uploading relevant books on this topic to improve my recommendations.`,
      sources: [],
      metadata: { topicRequested: classification.constraints.topicFilter }
    }
  }

  let responseText = `Here are ${result.books.length} books on ${classification.constraints.topicFilter}:\n\n`
  
  result.books.forEach((book, index) => {
    responseText += `${index + 1}. **"${book.title}"** by ${book.author}\n`
    if (book.genre) responseText += `   Genre: ${book.genre} | `
    if (book.difficulty) responseText += `Level: ${book.difficulty}\n`
    if (book.summary) responseText += `   ${book.summary.substring(0, 150)}...\n\n`
  })

  return {
    content: responseText,
    sources: memoryHandler.convertToDocumentSources(result.books),
    metadata: {
      topicRequested: classification.constraints.topicFilter,
      totalFound: result.books.length,
      hasMore: result.hasMore
    }
  }
}

async function handleAdviceRequests(message: string, classification: any, chatHistory: any[]) {
  console.log('💡 Handling advice request')
  
  const synthesizer = new AdviceSynthesizer()
  
  const request = {
    query: message,
    classification,
    chatHistory
  }

  const result = await synthesizer.synthesizeAdvice(request)
  
  return {
    content: result.content,
    sources: result.sources,
    metadata: result.metadata
  }
}

async function handleHRScenarios(message: string, classification: any, chatHistory: any[]) {
  console.log('👥 Handling HR scenario')
  
  const synthesizer = new AdviceSynthesizer()
  
  const request = {
    query: message,
    classification,
    chatHistory
  }

  const result = await synthesizer.synthesizeHRAdvice(request)
  
  return {
    content: result.content,
    sources: result.sources,
    metadata: result.metadata
  }
} 