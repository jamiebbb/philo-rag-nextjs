import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    // Simple test to verify API is working
    return NextResponse.json({
      success: true,
      message: 'Test preview API is working',
      chunkStats: {
        total_chunks: 3,
        avg_length: 500,
        min_length: 400,
        max_length: 600,
        first_chunk: {
          index: 0,
          content: 'This is a test first chunk with some sample content to demonstrate the preview functionality.',
          length: 95
        },
        last_chunk: {
          index: 2,
          content: 'This is a test last chunk to show how the preview system works with multiple chunks.',
          length: 87
        },
        all_chunks: [
          {
            index: 0,
            content: 'This is a test first chunk with some sample content to demonstrate the preview functionality.',
            length: 95
          },
          {
            index: 1,
            content: 'This is a test middle chunk that would be part of a larger document split into pieces.',
            length: 92
          },
          {
            index: 2,
            content: 'This is a test last chunk to show how the preview system works with multiple chunks.',
            length: 87
          }
        ]
      }
    })
  } catch (error) {
    console.error('Test preview error:', error)
    return NextResponse.json(
      { error: 'Test preview failed' },
      { status: 500 }
    )
  }
} 