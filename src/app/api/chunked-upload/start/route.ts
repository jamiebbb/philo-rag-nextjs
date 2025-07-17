import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

// Configure timeout for this route
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting chunked upload session...')
    
    const supabase = createServerSupabaseClient()
    
    const { 
      filename, 
      fileSize, 
      fileType, 
      metadata,
      chunkSize = 4 * 1024 * 1024 // 4MB chunks by default
    } = await request.json()

    console.log('📋 Chunked upload request:', {
      filename,
      fileSize: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
      fileType,
      chunkSize: `${(chunkSize / 1024 / 1024).toFixed(1)}MB`
    })

    // Validate inputs
    if (!filename || !fileSize || fileSize <= 0) {
      return NextResponse.json({ error: 'Invalid file parameters' }, { status: 400 })
    }

    if (fileType !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    // Only use chunked upload for files > 4.5MB
    const CHUNKED_UPLOAD_THRESHOLD = 4.5 * 1024 * 1024 // 4.5MB
    if (fileSize <= CHUNKED_UPLOAD_THRESHOLD) {
      return NextResponse.json({ 
        useChunkedUpload: false,
        message: 'File is small enough for direct upload'
      })
    }

    // Calculate chunks
    const totalChunks = Math.ceil(fileSize / chunkSize)
    const sessionId = uuidv4()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // 24-hour expiry

    console.log('📊 Chunked upload plan:', {
      sessionId,
      totalChunks,
      chunkSize: `${(chunkSize / 1024 / 1024).toFixed(1)}MB`,
      expiresAt
    })

    // Create upload session record
    const { data: sessionData, error: sessionError } = await supabase
      .from('upload_sessions')
      .insert({
        id: sessionId,
        filename,
        total_size: fileSize,
        chunk_size: chunkSize,
        total_chunks: totalChunks,
        uploaded_chunks: [],
        metadata: metadata || {},
        status: 'uploading',
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (sessionError) {
      console.error('❌ Error creating upload session:', sessionError)
      return NextResponse.json({ 
        error: 'Failed to create upload session',
        details: sessionError.message 
      }, { status: 500 })
    }

    console.log('✅ Upload session created:', sessionId)

    return NextResponse.json({
      success: true,
      useChunkedUpload: true,
      sessionId,
      totalChunks,
      chunkSize,
      message: `Ready for chunked upload: ${totalChunks} chunks of ${(chunkSize / 1024 / 1024).toFixed(1)}MB each`
    })

  } catch (error) {
    console.error('❌ Error starting chunked upload:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 