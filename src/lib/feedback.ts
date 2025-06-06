import { supabase, createServerSupabaseClient } from './supabase'
import { FeedbackType } from '@/types'
import { generateEmbedding } from './openai'

export interface FeedbackRecord {
  id?: string
  user_query: string
  ai_response: string
  feedback_type: string
  rating?: number
  comment?: string
  chat_id?: string
  created_at?: string
  query_embedding?: number[]
}

/**
 * Get the appropriate Supabase client based on environment
 */
function getSupabaseClient() {
  // Check if we're in a server environment (API route)
  if (typeof window === 'undefined') {
    return createServerSupabaseClient()
  }
  // Client-side environment
  return supabase
}

/**
 * Store user feedback using API endpoint
 */
export async function storeFeedback(
  userQuery: string,
  aiResponse: string,
  feedbackType: string,
  chatId?: string,
  rating?: number,
  comment?: string
): Promise<boolean> {
  try {
    // Use API endpoint for both client and server environments
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'store',
        userQuery,
        aiResponse,
        feedbackType,
        chatId,
        rating,
        comment
      })
    })

    const data = await response.json()

    if (data.success) {
      console.log('✅ Feedback stored successfully:', feedbackType)
      return true
    } else {
      console.error('❌ Failed to store feedback:', data.error)
      return false
    }
  } catch (error) {
    console.error('❌ Error storing feedback:', error)
    return false
  }
}

/**
 * Store detailed feedback with rating and comments
 */
export async function storeDetailedFeedback(
  userQuery: string,
  aiResponse: string,
  rating: number,
  comment: string,
  chatId?: string
): Promise<boolean> {
  return storeFeedback(userQuery, aiResponse, 'detailed', chatId, rating, comment)
}

/**
 * Get relevant feedback for improving responses
 */
export async function getRelevantFeedback(
  query: string,
  limit: number = 5
): Promise<FeedbackRecord[]> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available for feedback retrieval')
      return []
    }
    
    // Generate embedding for similarity search
    const queryEmbedding = await generateEmbedding(query)

    // First try to get feedback with embeddings using RPC function
    const { data: embeddingResults, error: embeddingError } = await client
      .rpc('match_feedback_by_embedding', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit
      })

    if (!embeddingError && embeddingResults && embeddingResults.length > 0) {
      return embeddingResults.filter((feedback: FeedbackRecord) => 
        feedback.comment && feedback.comment.trim().length > 0
      )
    }

    // Fallback: search by text similarity
    const { data: textResults, error: textError } = await client
      .from('feedback')
      .select('*')
      .textSearch('user_query', query)
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (textError) {
      console.error('Error getting relevant feedback:', textError)
      return []
    }

    return textResults || []
  } catch (error) {
    console.error('Error getting relevant feedback:', error)
    return []
  }
}

/**
 * Test Supabase connection for feedback
 */
export async function testFeedbackConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available for feedback connection test')
      return false
    }
    
    const { error } = await client
      .from('feedback')
      .select('id')
      .limit(1)

    if (error) {
      console.error('Feedback table connection test failed:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Feedback connection test error:', error)
    return false
  }
}

/**
 * Get feedback statistics
 */
export async function getFeedbackStats(): Promise<{
  total: number
  by_type: Record<string, number>
  recent_count: number
}> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available for feedback stats')
      return { total: 0, by_type: {}, recent_count: 0 }
    }
    
    const { data, error } = await client
      .from('feedback')
      .select('feedback_type, created_at')

    if (error) {
      console.error('Error getting feedback stats:', error)
      return { total: 0, by_type: {}, recent_count: 0 }
    }

    const total = data?.length || 0
    const by_type: Record<string, number> = {}
    let recent_count = 0

    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    data?.forEach((feedback: any) => {
      // Count by type
      by_type[feedback.feedback_type] = (by_type[feedback.feedback_type] || 0) + 1
      
      // Count recent feedback
      if (new Date(feedback.created_at) > oneWeekAgo) {
        recent_count++
      }
    })

    return { total, by_type, recent_count }
  } catch (error) {
    console.error('Error getting feedback stats:', error)
    return { total: 0, by_type: {}, recent_count: 0 }
  }
} 