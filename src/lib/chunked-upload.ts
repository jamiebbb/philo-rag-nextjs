/**
 * Client-side chunked upload utility for large PDF files
 * Handles files > 4.5MB by splitting them into chunks and uploading with resume capability
 */

export interface ChunkedUploadSession {
  sessionId: string
  totalChunks: number
  chunkSize: number
  uploadedChunks: number
  isComplete: boolean
}

export interface ChunkedUploadProgress {
  stage: 'starting' | 'uploading' | 'processing' | 'complete' | 'error'
  progress: number
  message: string
  session?: ChunkedUploadSession
  uploadedChunks?: number
  totalChunks?: number
  currentChunk?: number
}

export interface ChunkedUploadOptions {
  chunkSize?: number
  metadata: any
  processingOptions?: {
    splitterType?: string
    chunkSize?: number
    chunkOverlap?: number
    pdfParser?: string
  }
  onProgress?: (progress: ChunkedUploadProgress) => void
}

export class ChunkedUploader {
  private file: File
  private options: ChunkedUploadOptions
  private sessionId: string | null = null
  private totalChunks: number = 0
  private chunkSize: number = 4 * 1024 * 1024 // 4MB default

  constructor(file: File, options: ChunkedUploadOptions) {
    this.file = file
    this.options = options
    this.chunkSize = options.chunkSize || this.chunkSize
  }

  private notifyProgress(progress: ChunkedUploadProgress) {
    if (this.options.onProgress) {
      this.options.onProgress(progress)
    }
  }

  /**
   * Check if file needs chunked upload (> 4.5MB)
   */
  static needsChunkedUpload(file: File): boolean {
    const CHUNKED_UPLOAD_THRESHOLD = 4.5 * 1024 * 1024 // 4.5MB
    return file.size > CHUNKED_UPLOAD_THRESHOLD
  }

  /**
   * Start chunked upload session
   */
  async startSession(): Promise<string> {
    this.notifyProgress({
      stage: 'starting',
      progress: 0,
      message: 'Starting chunked upload session...'
    })

    try {
      const response = await fetch('/api/chunked-upload/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: this.file.name,
          fileSize: this.file.size,
          fileType: this.file.type,
          metadata: this.options.metadata,
          chunkSize: this.chunkSize
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.useChunkedUpload) {
        throw new Error('File does not require chunked upload')
      }

             this.sessionId = data.sessionId
       this.totalChunks = data.totalChunks

       this.notifyProgress({
         stage: 'starting',
         progress: 5,
         message: `Session started: ${this.totalChunks} chunks to upload`,
         session: {
           sessionId: this.sessionId || '',
           totalChunks: this.totalChunks,
           chunkSize: this.chunkSize,
           uploadedChunks: 0,
           isComplete: false
         }
       })

      return this.sessionId
    } catch (error) {
      this.notifyProgress({
        stage: 'error',
        progress: 0,
        message: `Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      throw error
    }
  }

  /**
   * Upload all chunks with retry capability
   */
  async uploadChunks(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Session not started')
    }

    this.notifyProgress({
      stage: 'uploading',
      progress: 10,
      message: 'Starting chunk uploads...',
      totalChunks: this.totalChunks,
      uploadedChunks: 0
    })

    const maxRetries = 3
    let uploadedCount = 0

    for (let chunkIndex = 0; chunkIndex < this.totalChunks; chunkIndex++) {
      const start = chunkIndex * this.chunkSize
      const end = Math.min(start + this.chunkSize, this.file.size)
      const chunkBlob = this.file.slice(start, end)

      let retries = 0
      let success = false

      while (retries < maxRetries && !success) {
        try {
          this.notifyProgress({
            stage: 'uploading',
            progress: 10 + (uploadedCount / this.totalChunks) * 70,
            message: `Uploading chunk ${chunkIndex + 1}/${this.totalChunks}${retries > 0 ? ` (retry ${retries})` : ''}`,
            currentChunk: chunkIndex + 1,
            totalChunks: this.totalChunks,
            uploadedChunks: uploadedCount
          })

          await this.uploadChunk(chunkIndex, chunkBlob)
          success = true
          uploadedCount++
        } catch (error) {
          retries++
          console.error(`Chunk ${chunkIndex} upload failed (attempt ${retries}):`, error)
          
          if (retries >= maxRetries) {
            throw new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries))
        }
      }
    }

    this.notifyProgress({
      stage: 'uploading',
      progress: 80,
      message: 'All chunks uploaded successfully!',
      uploadedChunks: uploadedCount,
      totalChunks: this.totalChunks
    })
  }

  /**
   * Upload a single chunk
   */
     private async uploadChunk(chunkIndex: number, chunkBlob: Blob): Promise<void> {
     if (!this.sessionId) {
       throw new Error('Session not started')
     }
     
     const formData = new FormData()
     formData.append('sessionId', this.sessionId)
     formData.append('chunkIndex', chunkIndex.toString())
     formData.append('chunk', chunkBlob, `chunk-${chunkIndex}`)

    const response = await fetch('/api/chunked-upload/chunk', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.message || 'Chunk upload failed')
    }
  }

  /**
   * Process uploaded chunks
   */
  async processChunks(): Promise<any> {
    if (!this.sessionId) {
      throw new Error('Session not started')
    }

    this.notifyProgress({
      stage: 'processing',
      progress: 85,
      message: 'Processing uploaded chunks...'
    })

    try {
      const response = await fetch('/api/chunked-upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          metadata: this.options.metadata,
          processingOptions: this.options.processingOptions
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const result = await response.json()

      this.notifyProgress({
        stage: 'complete',
        progress: 100,
        message: `Successfully processed ${this.file.name}! ${result.chunksStored} chunks stored.`
      })

      return result
    } catch (error) {
      this.notifyProgress({
        stage: 'error',
        progress: 85,
        message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      throw error
    }
  }

  /**
   * Complete chunked upload process
   */
  async upload(): Promise<any> {
    try {
      await this.startSession()
      await this.uploadChunks()
      return await this.processChunks()
    } catch (error) {
      this.notifyProgress({
        stage: 'error',
        progress: 0,
        message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      throw error
    }
  }
}

/**
 * Utility function for easy chunked upload
 */
export async function uploadLargeFile(
  file: File, 
  options: ChunkedUploadOptions
): Promise<any> {
  const uploader = new ChunkedUploader(file, options)
  return await uploader.upload()
} 