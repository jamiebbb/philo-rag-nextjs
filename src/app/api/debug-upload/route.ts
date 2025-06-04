import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Debug upload API called')
    
    const requestData = await request.json()
    
    console.log('📊 Full request data structure:')
    console.log('- chunks type:', typeof requestData.chunks)
    console.log('- chunks length:', requestData.chunks?.length)
    console.log('- chunks[0] structure:', requestData.chunks?.[0])
    console.log('- metadata:', requestData.metadata)
    console.log('- processingInfo:', requestData.processingInfo)
    
    if (requestData.chunks && requestData.chunks.length > 0) {
      console.log('📄 First chunk analysis:')
      console.log('- content type:', typeof requestData.chunks[0].content)
      console.log('- content length:', requestData.chunks[0].content?.length)
      console.log('- content preview:', requestData.chunks[0].content?.substring(0, 100))
      console.log('- chunk properties:', Object.keys(requestData.chunks[0]))
    }
    
    return NextResponse.json({
      success: true,
      debug: {
        chunksReceived: requestData.chunks?.length || 0,
        metadataReceived: !!requestData.metadata,
        processingInfoReceived: !!requestData.processingInfo,
        firstChunkValid: !!(requestData.chunks?.[0]?.content),
        firstChunkLength: requestData.chunks?.[0]?.content?.length || 0
      }
    })
    
  } catch (error) {
    console.error('❌ Debug upload error:', error)
    return NextResponse.json({
      error: 'Debug failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 