import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Configure timeout for this route
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Uploading file chunk...')
    
    const supabase = createServerSupabaseClient()
    
    const formData = await request.formData()
    const sessionId = formData.get('sessionId') as string
    const chunkIndex = parseInt(formData.get('chunkIndex') as string)
    const chunkData = formData.get('chunk') as File

    console.log('📋 Chunk upload request:', {
      sessionId,
      chunkIndex,
      chunkSize: chunkData ? `${(chunkData.size / 1024 / 1024).toFixed(2)}MB` : 'No data'
    })

    // Validate inputs
    if (!sessionId || chunkIndex < 0 || !chunkData) {
      return NextResponse.json({ error: 'Invalid chunk parameters' }, { status: 400 })
    }

    // Get upload session
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      console.error('❌ Upload session not found:', sessionError)
      return NextResponse.json({ error: 'Upload session not found' }, { status: 404 })
    }

    // Check if session is expired
    if (new Date() > new Date(session.expires_at)) {
      console.error('❌ Upload session expired')
      return NextResponse.json({ error: 'Upload session expired' }, { status: 410 })
    }

    // Check if chunk already uploaded
    if (session.uploaded_chunks.includes(chunkIndex)) {
      console.log('✅ Chunk already uploaded, skipping...')
      return NextResponse.json({
        success: true,
        chunkIndex,
        alreadyUploaded: true,
        message: 'Chunk already uploaded'
      })
    }

    // Store chunk in Supabase Storage
    const chunkPath = `chunked-uploads/${sessionId}/chunk-${chunkIndex}`
    const arrayBuffer = await chunkData.arrayBuffer()
    
    console.log('💾 Storing chunk in Supabase Storage:', chunkPath)
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('document-chunks')  // You'll need to create this bucket
      .upload(chunkPath, arrayBuffer, {
        contentType: 'application/octet-stream',
        upsert: true
      })

    if (uploadError) {
      console.error('❌ Error uploading chunk to storage:', uploadError)
      return NextResponse.json({ 
        error: 'Failed to store chunk',
        details: uploadError.message 
      }, { status: 500 })
    }

    // Update session with uploaded chunk
    const updatedChunks = [...session.uploaded_chunks, chunkIndex].sort((a, b) => a - b)
    
    const { error: updateError } = await supabase
      .from('upload_sessions')
      .update({
        uploaded_chunks: updatedChunks,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('❌ Error updating session:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update session',
        details: updateError.message 
      }, { status: 500 })
    }

    const isComplete = updatedChunks.length === session.total_chunks
    console.log(`✅ Chunk ${chunkIndex} uploaded. Progress: ${updatedChunks.length}/${session.total_chunks}`)

    return NextResponse.json({
      success: true,
      chunkIndex,
      uploadedChunks: updatedChunks.length,
      totalChunks: session.total_chunks,
      isComplete,
      message: isComplete 
        ? 'All chunks uploaded! Ready for processing.'
        : `Chunk ${chunkIndex} uploaded successfully`
    })

  } catch (error) {
    console.error('❌ Error uploading chunk:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 