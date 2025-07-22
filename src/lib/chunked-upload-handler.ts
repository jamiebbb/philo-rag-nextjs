'use client'

import { supabase } from './supabase'

// Chunk size: 2MB to safely stay under Vercel's 4.5MB limit
const CHUNK_SIZE = 2 * 1024 * 1024 // 2MB per chunk
const FILE_SIZE_THRESHOLD = 4.5 * 1024 * 1024 // 4.5MB threshold

export interface ChunkedUploadResult {
  success: boolean
  sessionId?: string
  documentsCount?: number
  chunksCount?: number
  uploadMethod: 'chunked-upload' | 'direct-upload'
  error?: string
  documentId?: string
}

export interface ChunkedUploadOptions {
  chunkSize?: number
  chunkOverlap?: number
  splitterType?: 'recursive' | 'character' | 'markdown' | 'html'
  onProgress?: (stage: string, progress: number, message: string) => void
}

/**
 * Smart upload handler that uses chunked upload for large files
 */
export async function chunkedUploadPDFs(
  files: File[], 
  metadata: any, 
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult> {
  const { onProgress } = options
  
  try {
    onProgress?.('analyzing', 0, 'Analyzing files...')
    
    // Validate all files first
    for (const file of files) {
      if (file.type !== 'application/pdf') {
        throw new Error(`File "${file.name}" is not a PDF`)
      }
    }
    
    // Calculate total file size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const hasLargeFiles = files.some(file => file.size > FILE_SIZE_THRESHOLD)
    
    console.log('📊 Chunked upload analysis:', {
      fileCount: files.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(1),
      hasLargeFiles,
      threshold: '4.5MB'
    })
    
    // Route based on file sizes
    if (hasLargeFiles) {
      console.log('🔄 Using chunked upload for large files...')
      return await handleChunkedUpload(files, metadata, options)
    } else {
      console.log('⚡ Using direct upload for small files...')
      return await handleDirectUpload(files, metadata, options)
    }
    
  } catch (error) {
    console.error('❌ Chunked upload error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('aborted')
    
    return {
      success: false,
      uploadMethod: 'direct-upload',
      error: isTimeout 
        ? 'Upload timed out. Large files may take longer to process. Please try again or contact support if the issue persists.'
        : errorMessage
    }
  }
}

/**
 * Handle small files using existing direct upload
 */
async function handleDirectUpload(
  files: File[], 
  metadata: any, 
  options: ChunkedUploadOptions
): Promise<ChunkedUploadResult> {
  const { 
    chunkSize = 5000, 
    chunkOverlap = 500, 
    splitterType = 'recursive',
    onProgress 
  } = options
  
  try {
    onProgress?.('uploading', 20, 'Uploading to server...')
    
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    formData.append('metadata', JSON.stringify(metadata))
    formData.append('splitterType', splitterType)
    formData.append('chunkSize', chunkSize.toString())
    formData.append('chunkOverlap', chunkOverlap.toString())
    formData.append('pdfParser', 'pdf-parse')

    const response = await fetch('/api/upload-documents', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Server error: ${response.status}`)
    }

    const result = await response.json()
    onProgress?.('complete', 100, 'Upload completed successfully!')
    
    return {
      success: true,
      documentsCount: result.documentsCount || 1,
      chunksCount: result.chunksCount || 0,
      uploadMethod: 'direct-upload',
      documentId: result.documentId
    }
    
  } catch (error) {
    console.error('❌ Direct upload failed:', error)
    throw error
  }
}

/**
 * Handle large files using chunked upload
 */
async function handleChunkedUpload(
  files: File[], 
  metadata: any, 
  options: ChunkedUploadOptions
): Promise<ChunkedUploadResult> {
  const { onProgress } = options
  
  try {
    // Process each file with chunked upload
    for (const file of files) {
      const sessionId = await initializeChunkedSession(file, metadata)
      
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
      console.log(`📄 Starting chunked upload: ${file.name} (${totalChunks} chunks)`)
      
      // Upload chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const progress = 10 + (chunkIndex / totalChunks) * 70 // 10-80% of progress
        onProgress?.('uploading', progress, `Uploading chunk ${chunkIndex + 1}/${totalChunks} of ${file.name}`)
        
        const success = await uploadChunk(sessionId, file, chunkIndex)
        if (!success) {
          throw new Error(`Failed to upload chunk ${chunkIndex + 1}`)
        }
      }
      
      // Process the completed upload
      onProgress?.('processing', 85, `Processing ${file.name} - reassembling file and generating embeddings...`)
      const result = await processCompletedChunkedUpload(sessionId, metadata, options)
      
      if (!result.success) {
        throw new Error(`Failed to process ${file.name}`)
      }
      
      onProgress?.('complete', 100, 'Upload and processing completed!')
      
      return {
        success: true,
        sessionId,
        documentsCount: result.documentsCount,
        chunksCount: result.chunksCount,
        uploadMethod: 'chunked-upload',
        documentId: result.documentId
      }
    }
    
    throw new Error('No files processed')
    
  } catch (error) {
    console.error('❌ Chunked upload failed:', error)
    throw error
  }
}

/**
 * Initialize a chunked upload session
 */
async function initializeChunkedSession(file: File, metadata: any): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client not available')
  }
  
  const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substring(2)}`
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  
  const { error } = await supabase
    .from('upload_sessions')
    .insert({
      id: sessionId,
      filename: file.name,
      file_size: file.size,
      chunk_size: CHUNK_SIZE,
      total_chunks: totalChunks,
      uploaded_chunks: [],
      metadata,
      status: 'pending',
      created_at: new Date().toISOString()
    })
  
  if (error) {
    throw new Error(`Failed to initialize upload session: ${error.message}`)
  }
  
  console.log(`✅ Initialized session ${sessionId} for ${file.name}`)
  return sessionId
}

/**
 * Upload a single chunk
 */
async function uploadChunk(sessionId: string, file: File, chunkIndex: number): Promise<boolean> {
  try {
    const start = chunkIndex * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)
    
    console.log(`📤 Uploading chunk ${chunkIndex}: ${start}-${end} (${chunk.size} bytes)`)
    
    const formData = new FormData()
    formData.append('sessionId', sessionId)
    formData.append('chunkIndex', chunkIndex.toString())
    formData.append('chunk', chunk)
    
    const response = await fetch('/api/upload-chunk', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Chunk upload failed: ${response.status}`)
    }
    
    console.log(`✅ Uploaded chunk ${chunkIndex}`)
    return true
    
  } catch (error) {
    console.error(`❌ Error uploading chunk ${chunkIndex}:`, error)
    return false
  }
}

/**
 * Process completed chunked upload
 */
async function processCompletedChunkedUpload(
  sessionId: string, 
  metadata: any, 
  options: ChunkedUploadOptions
): Promise<{ success: boolean; documentsCount?: number; chunksCount?: number; documentId?: string }> {
  try {
    const response = await fetch('/api/process-chunked-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId, 
        metadata,
        chunkSize: options.chunkSize || 5000,
        chunkOverlap: options.chunkOverlap || 500,
        splitterType: options.splitterType || 'recursive'
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Processing failed')
    }
    
    const result = await response.json()
    return {
      success: true,
      documentsCount: result.documentsCount,
      chunksCount: result.chunksCount,
      documentId: result.documentId
    }
    
  } catch (error) {
    console.error('❌ Error processing completed upload:', error)
    return { success: false }
  }
}

/**
 * Get recommended upload method for files
 */
export function getChunkedUploadMethod(files: File[]): {
  method: 'chunked-upload' | 'direct-upload'
  reason: string
  totalSizeMB: number
} {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const hasLargeFiles = files.some(file => file.size > FILE_SIZE_THRESHOLD)
  
  const totalSizeMB = totalSize / 1024 / 1024
  
  if (hasLargeFiles) {
    return {
      method: 'chunked-upload',
      reason: `Large files detected (${totalSizeMB.toFixed(1)}MB total) - using chunked upload`,
      totalSizeMB
    }
  } else {
    return {
      method: 'direct-upload',
      reason: `Small files (${totalSizeMB.toFixed(1)}MB total) - using direct upload`,
      totalSizeMB
    }
  }
} 