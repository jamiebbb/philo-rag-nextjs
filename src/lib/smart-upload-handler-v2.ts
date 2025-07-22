'use client'

import { supabase } from './supabase'

// File size threshold for routing between direct upload and storage upload
const FILE_SIZE_THRESHOLD = 4 * 1024 * 1024 // 4MB (Vercel's limit)

export interface UploadResult {
  success: boolean
  documentsCount: number
  chunksCount: number
  uploadMethod: 'direct-upload' | 'storage-upload'
  errorCount?: number
  error?: string
  documentId?: string
  processingStats?: any
}

export interface UploadOptions {
  chunkSize?: number
  chunkOverlap?: number
  splitterType?: 'recursive' | 'character' | 'markdown' | 'html'
  onProgress?: (stage: string, progress: number, message: string) => void
}

/**
 * Smart upload handler that routes based on file size - V2 (Simplified)
 */
export async function smartUploadPDFsV2(
  files: File[], 
  metadata: any, 
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { onProgress } = options
  
  try {
    if (!supabase) {
      throw new Error('Supabase client not available')
    }

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
    
    console.log('📊 Upload analysis V2:', {
      fileCount: files.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(1),
      hasLargeFiles,
      threshold: '4MB'
    })
    
    // Route based on file sizes
    if (hasLargeFiles) {
      console.log('🔄 Using storage upload for large files...')
      return await handleStorageUpload(files, metadata, options)
    } else {
      console.log('⚡ Using direct upload for small files...')
      return await handleDirectUpload(files, metadata, options)
    }
    
  } catch (error) {
    console.error('❌ Smart upload V2 error:', error)
    return {
      success: false,
      documentsCount: 0,
      chunksCount: 0,
      uploadMethod: 'direct-upload',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Handle small files using existing server-side route (unchanged)
 */
async function handleDirectUpload(
  files: File[], 
  metadata: any, 
  options: UploadOptions
): Promise<UploadResult> {
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
      documentId: result.documentId,
      processingStats: result.processingStats
    }
    
  } catch (error) {
    console.error('❌ Direct upload failed:', error)
    throw error
  }
}

/**
 * Handle large files by uploading to storage first, then processing server-side
 */
async function handleStorageUpload(
  files: File[], 
  metadata: any, 
  options: UploadOptions
): Promise<UploadResult> {
  const { 
    chunkSize = 5000, 
    chunkOverlap = 500, 
    splitterType = 'recursive',
    onProgress 
  } = options
  
  try {
    if (!supabase) {
      throw new Error('Supabase client not available')
    }

    onProgress?.('uploading', 10, 'Uploading large files to storage...')
    
    const uploadedFiles: { path: string; originalName: string }[] = []
    
    // Upload each file to Supabase Storage
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      const fileProgress = 10 + (i / files.length) * 60 // 10-70% of total progress
      onProgress?.('uploading', fileProgress, `Uploading ${file.name}...`)
      
      // Generate unique file path
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).substring(2)
      const fileExtension = file.name.split('.').pop()
      const fileName = `${timestamp}_${randomId}.${fileExtension}`
      const filePath = `large-uploads/${fileName}`
      
      console.log(`📤 Uploading ${file.name} to storage...`)
      
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })
      
      if (error) {
        throw new Error(`Failed to upload ${file.name}: ${error.message}`)
      }
      
      uploadedFiles.push({
        path: filePath,
        originalName: file.name
      })
      
      console.log(`✅ Uploaded ${file.name} to ${filePath}`)
    }
    
    onProgress?.('processing', 75, 'Processing files on server...')
    
    // Process uploaded files using server-side PDF parsing
    const response = await fetch('/api/process-storage-files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: uploadedFiles,
        metadata,
        splitterType,
        chunkSize,
        chunkOverlap
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Processing failed: ${response.status}`)
    }
    
    const result = await response.json()
    onProgress?.('complete', 100, 'Upload and processing completed!')
    
    // Clean up storage files after processing
    onProgress?.('cleanup', 100, 'Cleaning up temporary files...')
    try {
      const filePaths = uploadedFiles.map(f => f.path)
      await supabase.storage.from('documents').remove(filePaths)
      console.log('✅ Cleaned up temporary storage files')
    } catch (cleanupError) {
      console.warn('⚠️ Failed to clean up storage files:', cleanupError)
    }
    
    return {
      success: true,
      documentsCount: result.documentsCount || 1,
      chunksCount: result.chunksCount || 0,
      uploadMethod: 'storage-upload',
      documentId: result.documentId,
      processingStats: result.processingStats
    }
    
  } catch (error) {
    console.error('❌ Storage upload failed:', error)
    throw error
  }
}

/**
 * Get recommended upload method for files
 */
export function getUploadMethodV2(files: File[]): {
  method: 'direct-upload' | 'storage-upload'
  reason: string
  totalSizeMB: number
} {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const hasLargeFiles = files.some(file => file.size > FILE_SIZE_THRESHOLD)
  
  const totalSizeMB = totalSize / 1024 / 1024
  
  if (hasLargeFiles) {
    return {
      method: 'storage-upload',
      reason: `Large files detected (${totalSizeMB.toFixed(1)}MB total) - using storage upload`,
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