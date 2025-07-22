import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Upload chunk API called')
    
    const supabase = createServerSupabaseClient()
    const formData = await request.formData()
    
    const sessionId = formData.get('sessionId') as string
    const chunkIndex = parseInt(formData.get('chunkIndex') as string)
    const chunk = formData.get('chunk') as File
    
    console.log('📊 Chunk upload request:', {
      sessionId,
      chunkIndex,
      chunkSize: chunk.size
    })

    if (!sessionId || chunkIndex === undefined || !chunk) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get upload session details
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Upload session not found' }, { status: 404 })
    }

    // Upload chunk to Supabase Storage
    const chunkPath = `chunks/${sessionId}/chunk_${chunkIndex.toString().padStart(4, '0')}`
    
    console.log(`📤 Uploading chunk to storage: ${chunkPath}`)
    
    const { error: uploadError } = await supabase.storage
      .from('document_chunks')
      .upload(chunkPath, chunk, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (uploadError) {
      console.error(`❌ Failed to upload chunk to storage:`, uploadError)
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
    }
    
    // Update session with uploaded chunk
    const uploadedChunks = [...(session.uploaded_chunks || []), chunkIndex].sort((a, b) => a - b)
    const isComplete = uploadedChunks.length === session.total_chunks
    
    const { error: updateError } = await supabase
      .from('upload_sessions')
      .update({ 
        uploaded_chunks: uploadedChunks,
        status: isComplete ? 'complete' : 'uploading',
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
    
    if (updateError) {
      console.error(`❌ Failed to update session:`, updateError)
      return NextResponse.json({ error: `Session update failed: ${updateError.message}` }, { status: 500 })
    }
    
    console.log(`✅ Chunk ${chunkIndex} uploaded successfully. Progress: ${uploadedChunks.length}/${session.total_chunks}`)
    
    return NextResponse.json({
      success: true,
      chunkIndex,
      uploadedChunks: uploadedChunks.length,
      totalChunks: session.total_chunks,
      isComplete,
      message: `Chunk ${chunkIndex} uploaded successfully`
    })

  } catch (error) {
    console.error('❌ Error in upload chunk API:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 