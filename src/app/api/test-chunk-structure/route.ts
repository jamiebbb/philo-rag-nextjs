import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Testing chunk structure...')
    
    const body = await request.json()
    const { chunks, metadata, processingInfo } = body

    console.log('📊 Received body structure:', Object.keys(body))
    console.log('📊 Chunks type:', typeof chunks)
    console.log('📊 Chunks is array:', Array.isArray(chunks))
    console.log('📊 Chunks length:', chunks?.length)

    if (chunks && Array.isArray(chunks)) {
      console.log('📊 First chunk structure:', Object.keys(chunks[0] || {}))
      console.log('📊 First chunk content type:', typeof chunks[0]?.content)
      console.log('📊 First chunk content length:', chunks[0]?.content?.length)
      console.log('📊 First chunk sample:', JSON.stringify(chunks[0], null, 2).substring(0, 500))
    }

    // Test the validation logic from upload API
    const validChunks = chunks?.filter((chunk: any) => 
      chunk?.content && 
      typeof chunk.content === 'string' && 
      chunk.content.trim().length > 0
    )

    console.log('📊 Valid chunks count:', validChunks?.length)

    return NextResponse.json({
      success: true,
      debug: {
        bodyKeys: Object.keys(body),
        chunksType: typeof chunks,
        chunksIsArray: Array.isArray(chunks),
        chunksLength: chunks?.length,
        firstChunkKeys: chunks?.[0] ? Object.keys(chunks[0]) : null,
        firstChunkContentType: typeof chunks?.[0]?.content,
        firstChunkContentLength: chunks?.[0]?.content?.length,
        validChunksCount: validChunks?.length,
        firstChunkSample: chunks?.[0] ? JSON.stringify(chunks[0], null, 2).substring(0, 300) : null,
        metadata: metadata ? Object.keys(metadata) : null,
        processingInfo: processingInfo ? Object.keys(processingInfo) : null
      }
    })

  } catch (error) {
    console.error('❌ Error in test chunk structure:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 