import { NextRequest, NextResponse } from 'next/server'
import { generateChatCompletion } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    const { systemPrompt, transcript } = await request.json()

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    const cleanedTranscript = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here is a YouTube transcript that needs cleaning and formatting:\n\n${transcript}` }
    ])

    return NextResponse.json({
      cleanedTranscript
    })

  } catch (error) {
    console.error('Error cleaning transcript:', error)
    return NextResponse.json(
      { error: 'Failed to clean transcript' },
      { status: 500 }
    )
  }
} 