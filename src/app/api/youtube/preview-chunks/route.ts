import { NextRequest, NextResponse } from 'next/server'
import { CharacterTextSplitter } from 'langchain/text_splitter'

export async function POST(request: NextRequest) {
  try {
    console.log('📋 YouTube chunk preview API called')
    
    const body = await request.json()
    const { transcript, chunkSize = 5000, chunkOverlap = 500 } = body

    console.log('📋 Preview request:', {
      transcriptLength: transcript?.length || 0,
      chunkSize,
      chunkOverlap
    })

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json({ error: 'No transcript provided' }, { status: 400 })
    }

    console.log('📋 Processing transcript for preview...')

    // Initialize character text splitter for YouTube
    const textSplitter = new CharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separator: '\n\n' // Use paragraph breaks for YouTube transcripts
    })

    console.log('🔧 Character text splitter initialized for YouTube')

    // Split text into chunks
    console.log('✂️ Starting text splitting...')
    const chunks = await textSplitter.splitText(transcript)
    console.log(`✅ Created ${chunks.length} chunks from transcript`)

    if (chunks.length === 0) {
      console.error('❌ No chunks could be generated from the transcript')
      return NextResponse.json({ error: 'No chunks could be generated from the transcript' }, { status: 400 })
    }

    console.log(`📊 Final chunk count: ${chunks.length}`)

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
      all_chunks: chunkPreviews
    }

    console.log('✅ YouTube chunk preview generated successfully')

    return NextResponse.json({
      success: true,
      chunkStats
    })

  } catch (error) {
    console.error('❌ Error in YouTube chunk preview API:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Error details:', errorMessage)
    
    return NextResponse.json(
      { error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    )
  }
} 