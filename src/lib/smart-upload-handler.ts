'use client'

import { processPDFFile, validatePDFFile } from './client-pdf-processor'

// File size threshold for routing between server-side and client-side processing
const FILE_SIZE_THRESHOLD = 4 * 1024 * 1024 // 4MB (Vercel's limit)

export interface UploadResult {
  success: boolean
  documentsCount: number
  chunksCount: number
  uploadMethod: 'server-side' | 'client-side-chunks'
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
 * Smart upload handler that routes based on file size
 */
export async function smartUploadPDFs(
  files: File[], 
  metadata: any, 
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { onProgress } = options
  
  try {
    onProgress?.('analyzing', 0, 'Analyzing files...')
    
    // Validate all files first
    for (const file of files) {
      const validation = validatePDFFile(file)
      if (!validation.valid) {
        throw new Error(`File "${file.name}": ${validation.error}`)
      }
    }
    
    // Calculate total file size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const hasLargeFiles = files.some(file => file.size > FILE_SIZE_THRESHOLD)
    
    console.log('📊 Upload analysis:', {
      fileCount: files.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(1),
      hasLargeFiles,
      threshold: '4MB'
    })
    
    // Route based on file sizes
    if (hasLargeFiles) {
      console.log('🔄 Using client-side processing for large files...')
      return await handleLargeFileUpload(files, metadata, options)
    } else {
      console.log('⚡ Using server-side processing for small files...')
      return await handleSmallFileUpload(files, metadata, options)
    }
    
  } catch (error) {
    console.error('❌ Smart upload error:', error)
    return {
      success: false,
      documentsCount: 0,
      chunksCount: 0,
      uploadMethod: 'server-side',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Handle small files using existing server-side route
 */
async function handleSmallFileUpload(
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
      uploadMethod: 'server-side',
      documentId: result.documentId,
      processingStats: result.processingStats
    }
    
  } catch (error) {
    console.error('❌ Server-side upload failed:', error)
    throw error
  }
}

/**
 * Handle large files using client-side processing + chunk upload
 */
async function handleLargeFileUpload(
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
    onProgress?.('processing', 10, 'Processing PDFs locally...')
    
    let allChunks: any[] = []
    let totalTextLength = 0
    let totalProcessingTime = 0
    const fileNames: string[] = []
    
    // Process each file locally
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      fileNames.push(file.name)
      
      const fileProgress = (i / files.length) * 50 + 10 // 10-60% of total progress
      onProgress?.('processing', fileProgress, `Processing ${file.name}...`)
      
      console.log(`📄 Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      const result = await processPDFFile(file, {
        chunkSize,
        chunkOverlap,
        splitterType
      })
      
      if (!result.success) {
        throw new Error(`Failed to process ${file.name}: ${result.error}`)
      }
      
      // Add filename to each chunk
      const fileChunks = result.chunks.map(chunk => ({
        ...chunk,
        fileName: file.name
      }))
      
      allChunks = allChunks.concat(fileChunks)
      totalTextLength += result.textLength
      totalProcessingTime += result.processingTime
      
      console.log(`✅ Processed ${file.name}: ${result.chunks.length} chunks`)
    }
    
    onProgress?.('uploading', 70, 'Uploading processed chunks...')
    
    // Upload processed chunks
    const processingStats = {
      totalChunks: allChunks.length,
      totalTextLength,
      processingTime: totalProcessingTime,
      fileNames,
      processingMethod: 'client-side'
    }
    
    console.log('📤 Uploading processed chunks:', {
      chunkCount: allChunks.length,
      totalTextLength,
      fileCount: files.length
    })
    
    const response = await fetch('/api/upload-processed-chunks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chunks: allChunks,
        metadata,
        processingStats
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Upload failed: ${response.status}`)
    }
    
    const result = await response.json()
    onProgress?.('complete', 100, 'Upload completed successfully!')
    
    return {
      success: true,
      documentsCount: result.documentsCount || 1,
      chunksCount: result.chunksCount || 0,
      uploadMethod: 'client-side-chunks',
      errorCount: result.errorCount || 0,
      documentId: result.documentId,
      processingStats: {
        ...processingStats,
        uploadStats: result.processingStats
      }
    }
    
  } catch (error) {
    console.error('❌ Client-side upload failed:', error)
    throw error
  }
}

/**
 * Get recommended upload method for files
 */
export function getUploadMethod(files: File[]): {
  method: 'server-side' | 'client-side-chunks'
  reason: string
  totalSizeMB: number
} {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const hasLargeFiles = files.some(file => file.size > FILE_SIZE_THRESHOLD)
  
  const totalSizeMB = totalSize / 1024 / 1024
  
  if (hasLargeFiles) {
    return {
      method: 'client-side-chunks',
      reason: `Files exceed 4MB limit (${totalSizeMB.toFixed(1)}MB total)`,
      totalSizeMB
    }
  } else {
    return {
      method: 'server-side',
      reason: `Files are under 4MB limit (${totalSizeMB.toFixed(1)}MB total)`,
      totalSizeMB
    }
  }
} 