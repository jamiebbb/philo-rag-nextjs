import { NextRequest, NextResponse } from 'next/server'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { parsePDF } from '@/lib/pdf-parsers'

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Simple preview test API called')
    
    // Create a simple test text to verify chunking works
    const testText = `
This is a comprehensive test document for debugging the chunk preview functionality.
The document contains multiple paragraphs and sections to test how the text
splitter handles different types of content properly.

Section 1: Introduction
This section introduces the main concepts that will be covered in the document.
We want to ensure that the chunking algorithm properly handles section breaks
and maintains context between related paragraphs for optimal search results.

Section 2: Methodology  
Here we describe the approach taken to solve the problem. The methodology
includes several steps that must be followed in sequence to achieve the
desired outcome. Each step builds upon the previous one systematically.

Section 3: Results and Analysis
The results show significant improvements in performance and accuracy metrics.
Multiple evaluation criteria were used to assess the effectiveness of the approach.
The data clearly demonstrates the value and impact of the proposed solution.

Section 4: Conclusion and Future Work
In conclusion, this document demonstrates the proper functioning of the
chunk preview system. The text has been successfully split into manageable
pieces while maintaining semantic coherence and contextual relationships.
    `.trim()

    console.log('📝 Test text length:', testText.length, 'characters')

    // Test chunking with default settings
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 400,
      chunkOverlap: 100,
    })

    console.log('✂️ Starting text splitting...')
    const chunks = await textSplitter.splitText(testText)
    console.log('✅ Created', chunks.length, 'chunks')

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No chunks could be generated' }, { status: 400 })
    }

    // Calculate statistics
    const chunkLengths = chunks.map(chunk => chunk.length)
    const totalChunks = chunks.length
    const avgLength = Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / totalChunks)
    const minLength = Math.min(...chunkLengths)
    const maxLength = Math.max(...chunkLengths)

    console.log('📈 Chunk statistics:', { totalChunks, avgLength, minLength, maxLength })

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
      all_chunks: chunkPreviews,
      test_info: {
        source: 'Generated test text',
        original_length: testText.length,
        chunk_settings: {
          chunk_size: 400,
          chunk_overlap: 100,
          splitter_type: 'recursive'
        }
      }
    }

    console.log('✅ Simple preview test completed successfully')

    return NextResponse.json({
      success: true,
      chunkStats,
      message: 'Simple chunk preview test completed successfully'
    })

  } catch (error) {
    console.error('❌ Error in simple preview test:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Error details:', errorMessage)
    
    return NextResponse.json(
      { error: `Simple preview test failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Simple chunk preview test endpoint. Use POST to run test.',
    instructions: 'Send POST request to test chunking functionality'
  })
} 