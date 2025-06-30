export type QueryType = 
  | 'advice_general'           // "Give me advice on holding meetings"
  | 'advice_books_only'        // "Use only books uploaded by me to answer..."
  | 'book_recommendations'     // "Give me a good book for CEOs", "another one"
  | 'memory_queries'           // "Name 3 books in your memory"
  | 'topic_book_lists'         // "Suggest 2 books on banking"
  | 'hr_scenarios'             // "What advice do you have on firing people?"

export interface QueryClassification {
  type: QueryType
  confidence: number
  reasoning: string
  constraints: {
    useOnlyUploadedBooks: boolean
    topicFilter?: string
    difficulty?: string
    count?: number
  }
  contextual: {
    isFollowUp: boolean
    previousTopic?: string
    referenceType?: 'another' | 'similar' | 'more' | 'continue'
  }
}

export interface QueryContext {
  chatHistory: any[]
  lastAssistantResponse?: string
  lastUserQuery?: string
}

export class UnifiedQueryRouter {
  
  static async classifyQuery(message: string, context: QueryContext = { chatHistory: [] }): Promise<QueryClassification> {
    const queryLower = message.toLowerCase()
    
    // Extract contextual information
    const contextualInfo = this.analyzeContext(message, context)
    
    // Extract constraints
    const constraints = this.extractConstraints(message)
    
    // Classify query type
    const classification = this.determineQueryType(message, contextualInfo, constraints)
    
    return {
      ...classification,
      constraints,
      contextual: contextualInfo
    }
  }

  private static analyzeContext(message: string, context: QueryContext) {
    const queryLower = message.toLowerCase()
    
    // Detect follow-up patterns
    const followUpPatterns = [
      /\b(another\s+one|give\s+me\s+another|more|next|continue)\b/i,
      /\b(similar|like\s+that|same\s+topic|related)\b/i,
      /\b(what\s+about|how\s+about|also)\b/i
    ]
    
    const isFollowUp = followUpPatterns.some(pattern => pattern.test(message))
    
    let previousTopic = null
    let referenceType = null
    
    if (isFollowUp && context.lastAssistantResponse) {
      // Extract topic from previous response
      previousTopic = this.extractTopicFromResponse(context.lastAssistantResponse)
      
      // Determine reference type
      if (/\b(another\s+one|give\s+me\s+another)\b/i.test(message)) {
        referenceType = 'another'
      } else if (/\b(similar|like\s+that)\b/i.test(message)) {
        referenceType = 'similar'
      } else if (/\b(more|continue)\b/i.test(message)) {
        referenceType = 'more'
      }
    }
    
    return {
      isFollowUp,
      previousTopic: previousTopic || undefined,
      referenceType: referenceType as 'another' | 'similar' | 'more' | 'continue' | undefined
    }
  }

  private static extractConstraints(message: string) {
    const queryLower = message.toLowerCase()
    
    // Check for "only uploaded books" constraint
    const useOnlyUploadedBooks = 
      /\b(only|just|exclusively)\s+.*(books?|documents?|materials?)\s+(uploaded|in\s+my|from\s+my)/i.test(message) ||
      /\b(use\s+only|based\s+only\s+on|limit\s+to)\s+.*(uploaded|my\s+books?|my\s+documents?)/i.test(message) ||
      /\b(don't\s+use|no)\s+.*(external|outside|general)\s+(knowledge|sources?)/i.test(message)
    
    // Extract count if specified
    const countMatch = message.match(/\b(\d+)\s+(books?|recommendations?|suggestions?)\b/i)
    const count = countMatch ? parseInt(countMatch[1]) : undefined
    
    // Extract topic
    const topicPatterns = [
      /\b(?:about|on|regarding|for)\s+([a-zA-Z\s]+?)(?:\s+(?:book|advice|help)|\?|$)/i,
      /\b(banking|finance|investment|leadership|management|hr|coaching|meetings|philosophy|psychology|business|strategy|marketing)\b/i
    ]
    
    let topicFilter = null
    for (const pattern of topicPatterns) {
      const match = message.match(pattern)
      if (match) {
        topicFilter = match[1]?.trim()
        break
      }
    }
    
    // Extract difficulty
    let difficulty = null
    if (/\b(beginner|basic|introduction|intro|simple)\b/i.test(message)) {
      difficulty = 'Beginner'
    } else if (/\b(advanced|expert|complex|deep)\b/i.test(message)) {
      difficulty = 'Advanced'
    } else if (/\b(intermediate|moderate)\b/i.test(message)) {
      difficulty = 'Intermediate'
    }
    
    return {
      useOnlyUploadedBooks,
      topicFilter: topicFilter || undefined,
      difficulty: difficulty || undefined,
      count
    }
  }

  private static determineQueryType(message: string, contextualInfo: any, constraints: any): Omit<QueryClassification, 'constraints' | 'contextual'> {
    const queryLower = message.toLowerCase()
    
    // Memory/catalog queries
    if (/\b(name|list|show|tell\s+me)\s+.*\b(books?|in\s+(?:your\s+)?memory|in\s+(?:the\s+)?(?:database|collection|library))\b/i.test(message) ||
        /\b(?:what|which)\s+books?\s+(?:do\s+you\s+have|are\s+available)\b/i.test(message) ||
        /\b(?:catalog|inventory|collection)\b/i.test(message)) {
      return {
        type: 'memory_queries',
        confidence: 0.95,
        reasoning: 'User asking for list of books in memory/database'
      }
    }
    
    // Book recommendations (including contextual follow-ups)
    if (/\b(recommend|suggest|good\s+book|best\s+book|reading\s+list)\b/i.test(message) ||
        /\b(what\s+should\s+i\s+read|book\s+for)\b/i.test(message) ||
        (contextualInfo.isFollowUp && contextualInfo.referenceType === 'another' && contextualInfo.previousTopic)) {
      return {
        type: 'book_recommendations',
        confidence: contextualInfo.isFollowUp ? 0.90 : 0.95,
        reasoning: contextualInfo.isFollowUp ? 
          'Contextual follow-up requesting another book recommendation' : 
          'Direct book recommendation request'
      }
    }
    
    // Topic-specific book lists
    if (constraints.count && constraints.topicFilter && /\bbooks?\b/i.test(message)) {
      return {
        type: 'topic_book_lists',
        confidence: 0.90,
        reasoning: `Request for ${constraints.count} books on ${constraints.topicFilter}`
      }
    }
    
    // HR scenarios
    if (/\b(firing|hiring|performance|management|employee|hr|human\s+resources|workplace|team|staff)\b/i.test(message) &&
        /\b(advice|help|guidance|how\s+to|what\s+to\s+do|strategy|approach)\b/i.test(message)) {
      return {
        type: 'hr_scenarios',
        confidence: 0.85,
        reasoning: 'HR/workplace management scenario request'
      }
    }
    
    // Advice with "only books" constraint
    if (constraints.useOnlyUploadedBooks && 
        /\b(advice|help|guidance|tell\s+me|explain|how\s+to)\b/i.test(message)) {
      return {
        type: 'advice_books_only',
        confidence: 0.95,
        reasoning: 'Advice request with explicit constraint to use only uploaded books'
      }
    }
    
    // General advice requests
    if (/\b(advice|help|guidance|how\s+to|what\s+to\s+do|strategy|approach)\b/i.test(message) ||
        /\b(give\s+me|tell\s+me)\s+.*(about|on|regarding)\b/i.test(message)) {
      return {
        type: 'advice_general',
        confidence: 0.80,
        reasoning: 'General advice request without explicit book-only constraint'
      }
    }
    
    // Default to general advice
    return {
      type: 'advice_general',
      confidence: 0.60,
      reasoning: 'Default classification - treating as general advice request'
    }
  }

  private static extractTopicFromResponse(response: string): string | null {
    // Extract key topics from previous assistant response
    const topicPatterns = [
      /"([^"]+)"\s+by\s+[A-Z]/i,  // Book titles
      /\b(leadership|management|investment|finance|banking|psychology|philosophy|business|strategy|marketing|hr|coaching)\b/i
    ]
    
    for (const pattern of topicPatterns) {
      const match = response.match(pattern)
      if (match) {
        return match[1]
      }
    }
    
    return null
  }
} 