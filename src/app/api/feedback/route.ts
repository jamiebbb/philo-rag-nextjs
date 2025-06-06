import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { action, ...data } = await request.json()

    const supabase = createServerSupabaseClient()

    if (action === 'test') {
      // Test feedback table connection
      try {
        const { data: testData, error } = await supabase
          .from('feedback')
          .select('*')
          .limit(1)

        if (error) {
          return NextResponse.json({
            success: false,
            error: `Feedback table error: ${error.message}`,
            needsSetup: error.message.includes('relation "public.feedback" does not exist')
          }, { status: 400 })
        }

        // Test insert
        const testFeedback = {
          user_query: 'Test query',
          ai_response: 'Test response',
          feedback_type: 'helpful',
          chat_id: 'test-chat-id',
          created_at: new Date().toISOString()
        }

        const { error: insertError } = await supabase
          .from('feedback')
          .insert(testFeedback)

        if (insertError) {
          return NextResponse.json({
            success: false,
            error: `Insert test failed: ${insertError.message}`
          }, { status: 400 })
        }

        // Clean up test entry
        await supabase
          .from('feedback')
          .delete()
          .eq('chat_id', 'test-chat-id')

        return NextResponse.json({
          success: true,
          message: 'Feedback system is working correctly'
        })

      } catch (error: any) {
        return NextResponse.json({
          success: false,
          error: `Connection test failed: ${error.message}`
        }, { status: 500 })
      }
    }

    if (action === 'store') {
      // Store actual feedback
      const { userQuery, aiResponse, feedbackType, chatId, rating, comment } = data

      const feedbackData = {
        user_query: userQuery,
        ai_response: aiResponse,
        feedback_type: feedbackType,
        chat_id: chatId || 'anonymous',
        rating: rating || null,
        comment: comment || null,
        created_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('feedback')
        .insert(feedbackData)

      if (error) {
        return NextResponse.json({
          success: false,
          error: `Failed to store feedback: ${error.message}`
        }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: 'Feedback stored successfully'
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })

  } catch (error: any) {
    console.error('Feedback API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 