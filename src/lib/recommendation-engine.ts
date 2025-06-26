import { createServerSupabaseClient } from './supabase'
import { generateEmbedding } from './openai'

export interface RecommendationRequest {
  query: string
  userProfile?: {
    interests: string[]
    difficulty_preference: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'
    preferred_genres: string[]
    reading_history: string[]
  }
  context?: {
    current_books: string[]
    learning_goals: string[]
    time_constraints: string
  }
}

export interface BookRecommendation {
  title: string
  author: string
  doc_type: string
  genre: string
  topic: string
  difficulty: string
  tags: string[]
  summary: string
  recommendation_score: number
  recommendation_reasons: string[]
  learning_pathway_position?: number
  prereq_books?: string[]
  follow_up_books?: string[]
  estimated_reading_time?: string
  availability_status: 'available' | 'missing' | 'external'
}

export interface LearningPathway {
  pathway_name: string
  description: string
  total_books: number
  estimated_duration: string
  difficulty_progression: string[]
  books: BookRecommendation[]
  alternative_books: BookRecommendation[]
}

export interface GapAnalysis {
  topic: string
  identified_gaps: {
    title: string
    author: string
    importance_score: number
    gap_reason: string
    acquisition_priority: 'high' | 'medium' | 'low'
    estimated_cost?: string
    alternative_sources?: string[]
  }[]
  coverage_percentage: number
  recommended_next_acquisitions: string[]
}

export class RecommendationEngine {
  private supabase: any

  constructor() {
    this.supabase = createServerSupabaseClient()
  }

  async generateRecommendations(request: RecommendationRequest): Promise<{
    recommendations: BookRecommendation[]
    learningPathways: LearningPathway[]
    gapAnalysis: GapAnalysis
    alternativeSources: any[]
  }> {
    console.log('🎯 Generating comprehensive recommendations for:', request.query)

    // Get current library catalog
    const catalogData = await this.getLibraryCatalog()
    
    // Generate personalized recommendations
    const recommendations = await this.generatePersonalizedRecommendations(
      request, 
      catalogData
    )

    // Create learning pathways
    const learningPathways = await this.createLearningPathways(
      request,
      catalogData,
      recommendations
    )

    // Perform gap analysis
    const gapAnalysis = await this.performGapAnalysis(request, catalogData)

    // Find external alternatives
    const alternativeSources = await this.findAlternativeSources(
      request,
      gapAnalysis
    )

    return {
      recommendations,
      learningPathways,
      gapAnalysis,
      alternativeSources
    }
  }

  private async getLibraryCatalog() {
    const { data: allDocs, error } = await this.supabase
      .from('documents_enhanced')
      .select('title, author, doc_type, genre, topic, difficulty, tags, summary, created_at')
      .order('title')

    if (error) {
      console.error('Error fetching catalog:', error)
      return { books: [], stats: {} }
    }

    // Deduplicate and organize
    const booksMap = new Map()
    
    allDocs?.forEach((doc) => {
      const title = doc.title?.trim()
      const author = doc.author?.trim() || 'Unknown Author'
      
      if (!title) return
      
      const bookKey = `${title.toLowerCase()}-${author.toLowerCase()}`
      if (!booksMap.has(bookKey)) {
        booksMap.set(bookKey, {
          title,
          author,
          doc_type: doc.doc_type || 'Book',
          genre: doc.genre || 'General',
          topic: doc.topic || 'General',
          difficulty: doc.difficulty || 'Intermediate',
          tags: doc.tags ? doc.tags.split(',').map(t => t.trim()) : [],
          summary: doc.summary || '',
          created_at: doc.created_at
        })
      }
    })

    const books = Array.from(booksMap.values())
    
    // Generate statistics
    const stats = this.generateCatalogStats(books)
    
    return { books, stats }
  }

  private generateCatalogStats(books: any[]) {
    const stats = {
      total_books: books.length,
      by_genre: {} as Record<string, number>,
      by_topic: {} as Record<string, number>,
      by_difficulty: {} as Record<string, number>,
      by_type: {} as Record<string, number>,
      coverage_analysis: {} as Record<string, any>
    }

    books.forEach(book => {
      // Count by genre
      const genre = book.genre || 'Uncategorized'
      stats.by_genre[genre] = (stats.by_genre[genre] || 0) + 1
      
      // Count by topic
      const topic = book.topic || 'General'
      stats.by_topic[topic] = (stats.by_topic[topic] || 0) + 1
      
      // Count by difficulty
      const difficulty = book.difficulty || 'Unknown'
      stats.by_difficulty[difficulty] = (stats.by_difficulty[difficulty] || 0) + 1
      
      // Count by type
      const type = book.doc_type || 'Unknown'
      stats.by_type[type] = (stats.by_type[type] || 0) + 1
    })

    return stats
  }

  private async generatePersonalizedRecommendations(
    request: RecommendationRequest,
    catalogData: any
  ): Promise<BookRecommendation[]> {
    const { books } = catalogData
    let candidates = [...books]

    // Extract topic from query
    const topic = this.extractTopicFromQuery(request.query)
    
    // Filter by topic relevance
    if (topic !== 'general') {
      candidates = candidates.filter(book => 
        book.topic?.toLowerCase().includes(topic) ||
        book.genre?.toLowerCase().includes(topic) ||
        book.tags?.some((tag: string) => tag.toLowerCase().includes(topic))
      )
    }

    // Apply user preferences if available
    if (request.userProfile) {
      candidates = this.applyUserPreferences(candidates, request.userProfile)
    }

    // Score and rank recommendations
    const scoredCandidates = candidates.map(book => ({
      ...book,
      recommendation_score: this.calculateRecommendationScore(book, request),
      recommendation_reasons: this.generateRecommendationReasons(book, request),
      availability_status: 'available' as const
    }))

    // Sort by score and return top recommendations
    return scoredCandidates
      .sort((a, b) => b.recommendation_score - a.recommendation_score)
      .slice(0, 8)
      .map(book => ({
        ...book,
        estimated_reading_time: this.estimateReadingTime(book)
      }))
  }

  private extractTopicFromQuery(query: string): string {
    const topics = [
      'philosophy', 'business', 'psychology', 'economics', 'management',
      'leadership', 'strategy', 'finance', 'marketing', 'innovation',
      'entrepreneurship', 'technology', 'history', 'science', 'ethics'
    ]
    
    const queryLower = query.toLowerCase()
    for (const topic of topics) {
      if (queryLower.includes(topic)) {
        return topic
      }
    }
    return 'general'
  }

  private applyUserPreferences(candidates: any[], userProfile: any) {
    return candidates.filter(book => {
      // Filter by difficulty preference
      if (userProfile.difficulty_preference && book.difficulty) {
        const difficultyMatch = book.difficulty === userProfile.difficulty_preference
        if (!difficultyMatch) return false
      }

      // Filter by preferred genres
      if (userProfile.preferred_genres?.length > 0) {
        const genreMatch = userProfile.preferred_genres.some(
          (genre: string) => book.genre?.toLowerCase().includes(genre.toLowerCase())
        )
        if (!genreMatch) return false
      }

      // Avoid books already read
      if (userProfile.reading_history?.length > 0) {
        const alreadyRead = userProfile.reading_history.some(
          (readBook: string) => book.title.toLowerCase().includes(readBook.toLowerCase())
        )
        if (alreadyRead) return false
      }

      return true
    })
  }

  private calculateRecommendationScore(book: any, request: RecommendationRequest): number {
    let score = 0.5 // Base score

    // Topic relevance
    const topic = this.extractTopicFromQuery(request.query)
    if (book.topic?.toLowerCase().includes(topic)) score += 0.3
    if (book.genre?.toLowerCase().includes(topic)) score += 0.2
    
    // Tag relevance
    if (book.tags?.some((tag: string) => 
      request.query.toLowerCase().includes(tag.toLowerCase())
    )) {
      score += 0.2
    }

    // Difficulty appropriateness
    if (request.userProfile?.difficulty_preference) {
      if (book.difficulty === request.userProfile.difficulty_preference) {
        score += 0.15
      }
    }

    // Boost for popular categories
    if (['business', 'philosophy', 'psychology'].includes(book.genre?.toLowerCase())) {
      score += 0.1
    }

    return Math.min(score, 1.0)
  }

  private generateRecommendationReasons(book: any, request: RecommendationRequest): string[] {
    const reasons = []
    const topic = this.extractTopicFromQuery(request.query)

    if (book.topic?.toLowerCase().includes(topic)) {
      reasons.push(`Directly covers ${topic}`)
    }

    if (book.difficulty) {
      reasons.push(`${book.difficulty} difficulty level`)
    }

    if (book.genre) {
      reasons.push(`${book.genre} category`)
    }

    if (book.tags?.length > 0) {
      reasons.push(`Tagged with: ${book.tags.slice(0, 3).join(', ')}`)
    }

    return reasons.length > 0 ? reasons : ['Matches your query']
  }

  private estimateReadingTime(book: any): string {
    // Simple estimation based on document type
    const timeEstimates = {
      'Book': '6-8 hours',
      'Article': '15-30 minutes',
      'Report': '45-90 minutes',
      'Paper': '30-60 minutes'
    }
    
    return timeEstimates[book.doc_type] || '2-4 hours'
  }

  private async createLearningPathways(
    request: RecommendationRequest,
    catalogData: any,
    recommendations: BookRecommendation[]
  ): Promise<LearningPathway[]> {
    const topic = this.extractTopicFromQuery(request.query)
    const pathways: LearningPathway[] = []

    // Create topic-specific learning pathway
    if (topic !== 'general') {
      const pathway = await this.createTopicPathway(topic, catalogData, recommendations)
      if (pathway) pathways.push(pathway)
    }

    // Create difficulty-based pathway
    const difficultyPathway = this.createDifficultyPathway(recommendations)
    if (difficultyPathway) pathways.push(difficultyPathway)

    return pathways
  }

  private async createTopicPathway(
    topic: string, 
    catalogData: any, 
    recommendations: BookRecommendation[]
  ): Promise<LearningPathway | null> {
    const topicBooks = catalogData.books.filter((book: any) =>
      book.topic?.toLowerCase().includes(topic) ||
      book.genre?.toLowerCase().includes(topic)
    )

    if (topicBooks.length < 3) return null

    // Sort by difficulty progression
    const sortedBooks = topicBooks.sort((a: any, b: any) => {
      const difficultyOrder = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
      const aIndex = difficultyOrder.indexOf(a.difficulty) !== -1 ? difficultyOrder.indexOf(a.difficulty) : 1
      const bIndex = difficultyOrder.indexOf(b.difficulty) !== -1 ? difficultyOrder.indexOf(b.difficulty) : 1
      return aIndex - bIndex
    })

    return {
      pathway_name: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Learning Journey`,
      description: `A comprehensive learning pathway through ${topic}, from foundational concepts to advanced topics`,
      total_books: Math.min(sortedBooks.length, 6),
      estimated_duration: '3-6 months',
      difficulty_progression: ['Beginner', 'Intermediate', 'Advanced'],
      books: sortedBooks.slice(0, 6).map((book: any, index: number) => ({
        ...book,
        learning_pathway_position: index + 1,
        availability_status: 'available' as const,
        recommendation_score: 0.8,
        recommendation_reasons: [`Part ${index + 1} of ${topic} pathway`],
        estimated_reading_time: this.estimateReadingTime(book)
      })),
      alternative_books: []
    }
  }

  private createDifficultyPathway(recommendations: BookRecommendation[]): LearningPathway | null {
    if (recommendations.length < 3) return null

    const difficultyOrder = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
    const sortedRecs = recommendations.sort((a, b) => {
      const aIndex = difficultyOrder.indexOf(a.difficulty) !== -1 ? difficultyOrder.indexOf(a.difficulty) : 1
      const bIndex = difficultyOrder.indexOf(b.difficulty) !== -1 ? difficultyOrder.indexOf(b.difficulty) : 1
      return aIndex - bIndex
    })

    return {
      pathway_name: 'Progressive Learning Path',
      description: 'A carefully sequenced reading path that builds knowledge progressively',
      total_books: sortedRecs.length,
      estimated_duration: '2-4 months',
      difficulty_progression: difficultyOrder,
      books: sortedRecs.map((book, index) => ({
        ...book,
        learning_pathway_position: index + 1
      })),
      alternative_books: []
    }
  }

  private async performGapAnalysis(
    request: RecommendationRequest,
    catalogData: any
  ): Promise<GapAnalysis> {
    const topic = this.extractTopicFromQuery(request.query)
    
    // Essential books database for different topics
    const essentialBooks = this.getEssentialBooks(topic)
    const currentBooks = catalogData.books

    const identifiedGaps = essentialBooks
      .filter(essential => 
        !currentBooks.some((current: any) =>
          current.title.toLowerCase().includes(essential.title.toLowerCase()) ||
          (current.author.toLowerCase().includes(essential.author.toLowerCase()) && 
           Math.abs(current.title.length - essential.title.length) < 10)
        )
      )
      .map(missing => ({
        title: missing.title,
        author: missing.author,
        importance_score: missing.importance_score,
        gap_reason: missing.reason,
        acquisition_priority: missing.priority,
        estimated_cost: missing.estimated_cost,
        alternative_sources: missing.alternative_sources
      }))

    const topicBooks = currentBooks.filter((book: any) =>
      book.topic?.toLowerCase().includes(topic) ||
      book.genre?.toLowerCase().includes(topic)
    )

    const coveragePercentage = Math.round(
      (topicBooks.length / (topicBooks.length + identifiedGaps.length)) * 100
    )

    return {
      topic: topic.charAt(0).toUpperCase() + topic.slice(1),
      identified_gaps: identifiedGaps.slice(0, 5), // Top 5 gaps
      coverage_percentage: coveragePercentage,
      recommended_next_acquisitions: identifiedGaps
        .filter(gap => gap.acquisition_priority === 'high')
        .slice(0, 3)
        .map(gap => gap.title)
    }
  }

  private getEssentialBooks(topic: string) {
    const essentialBooksByTopic: Record<string, any[]> = {
      business: [
        {
          title: 'Good to Great',
          author: 'Jim Collins',
          importance_score: 0.95,
          reason: 'Foundational business research on sustained excellence',
          priority: 'high' as const,
          estimated_cost: '$15-25',
          alternative_sources: ['Library', 'Audiobook', 'Summary services']
        },
        {
          title: 'The Lean Startup',
          author: 'Eric Ries',
          importance_score: 0.9,
          reason: 'Essential modern entrepreneurship methodology',
          priority: 'high' as const,
          estimated_cost: '$12-20',
          alternative_sources: ['Digital library', 'Course materials']
        },
        {
          title: 'First Things First',
          author: 'Stephen Covey',
          importance_score: 0.85,
          reason: 'Time management and priority setting framework',
          priority: 'medium' as const,
          estimated_cost: '$10-18',
          alternative_sources: ['Used books', 'Library system']
        }
      ],
      philosophy: [
        {
          title: 'Meditations',
          author: 'Marcus Aurelius',
          importance_score: 0.98,
          reason: 'Foundational Stoic philosophy text',
          priority: 'high' as const,
          estimated_cost: '$8-15',
          alternative_sources: ['Public domain', 'Free online versions']
        },
        {
          title: 'The Republic',
          author: 'Plato',
          importance_score: 0.95,
          reason: 'Essential political and ethical philosophy',
          priority: 'high' as const,
          estimated_cost: '$10-20',
          alternative_sources: ['University libraries', 'Open access']
        }
      ],
      psychology: [
        {
          title: 'Thinking, Fast and Slow',
          author: 'Daniel Kahneman',
          importance_score: 0.92,
          reason: 'Groundbreaking work on decision-making psychology',
          priority: 'high' as const,
          estimated_cost: '$15-25',
          alternative_sources: ['Academic library', 'Audio format']
        }
      ]
    }

    return essentialBooksByTopic[topic] || []
  }

  private async findAlternativeSources(
    request: RecommendationRequest,
    gapAnalysis: GapAnalysis
  ): Promise<any[]> {
    // In a real implementation, this would query external APIs
    // For now, return structured alternative source suggestions
    
    const alternatives = gapAnalysis.identified_gaps.map(gap => ({
      title: gap.title,
      author: gap.author,
      alternative_sources: [
        {
          source_type: 'Library System',
          availability: 'Check local libraries',
          cost: 'Free',
          access_method: 'Physical or digital loan'
        },
        {
          source_type: 'Online Purchase',
          availability: 'Amazon, Barnes & Noble',
          cost: gap.estimated_cost || '$10-25',
          access_method: 'Purchase physical or digital copy'
        },
        {
          source_type: 'Academic Access',
          availability: 'University libraries, JSTOR',
          cost: 'Free with access',
          access_method: 'Institutional login required'
        },
        {
          source_type: 'Summary Services',
          availability: 'Blinkist, getAbstract',
          cost: '$10-15/month',
          access_method: 'Subscription-based summaries'
        }
      ]
    }))

    return alternatives.slice(0, 3) // Return top 3 alternative source sets
  }
}

// Factory function for easy usage
export async function generateLibrarianRecommendations(request: RecommendationRequest) {
  const engine = new RecommendationEngine()
  return await engine.generateRecommendations(request)
}