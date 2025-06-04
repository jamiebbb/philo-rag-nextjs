import { NextRequest, NextResponse } from 'next/server'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

export async function POST(request: NextRequest) {
  try {
    // Test text content
    const testText = `
This is a test document that will be used to test the chunk preview functionality.
This text simulates what would be extracted from a PDF document.

The purpose of this test is to verify that the text splitting and chunk generation
is working correctly in the preview API endpoint.

We want to make sure that:
1. The text is properly split into chunks
2. Statistics are calculated correctly
3. The preview shows the first and last chunks
4. All chunks are included in the response

This should generate multiple chunks based on the chunk size settings.
The system should be able to handle this test content and return meaningful
statistics about how the content would be chunked.

Additional content to make it longer and ensure multiple chunks are created.
This content will help test the chunking algorithm with realistic text.
The chunk preview should show proper statistics and chunk boundaries.

More content here to reach the threshold for multiple chunks when using
standard chunk sizes like 400 or 1000 characters.
    `.trim()

    console.log('Test text length:', testText.length)

    // Initialize text splitter with default settings
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 400,
      chunkOverlap: 100,
    })

    // Split text into chunks
    const chunks = await textSplitter.splitText(testText)
    console.log('Number of chunks created:', chunks.length)

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No chunks could be generated' }, { status: 400 })
    }

    // Calculate statistics
    const chunkLengths = chunks.map(chunk => chunk.length)
    const totalChunks = chunks.length
    const avgLength = Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / totalChunks)
    const minLength = Math.min(...chunkLengths)
    const maxLength = Math.max(...chunkLengths)

    // Prepare chunk previews
    const chunkPreviews = chunks.map((chunk, index) => ({
      index,
      content: chunk,
      length: chunk.length
    }))

    const chunkStats = {
      total_chunks: totalChunks,
      avg_length: avgLength,
      min_length: minLength,
      max_length: maxLength,
      first_chunk: chunkPreviews[0],
      last_chunk: chunkPreviews[chunkPreviews.length - 1],
      all_chunks: chunkPreviews
    }

    console.log('Chunk stats:', {
      total_chunks: totalChunks,
      avg_length: avgLength,
      min_length: minLength,
      max_length: maxLength
    })

    return NextResponse.json({
      success: true,
      chunkStats
    })

  } catch (error) {
    console.error('Error in test preview API:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 