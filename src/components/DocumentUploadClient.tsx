'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, Eye, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { processPDFFile, validatePDFFile, ProcessedChunk, PDFProcessingResult } from '@/lib/client-pdf-processor'

// Browser environment check
const isBrowser = typeof window !== 'undefined'

interface Metadata {
  title: string
  author: string
  summary: string
  genre: string
  topic: string
  tags: string
  difficulty: string
  doc_type: string
}

interface ProcessingProgress {
  stage: 'processing' | 'generating' | 'uploading' | 'complete' | 'error'
  message: string
  progress: number
}

export default function DocumentUploadClient() {
  const [isMounted, setIsMounted] = useState(false)
  
  // Only mount the component on the client side
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const [files, setFiles] = useState<File[]>([])
  const [metadata, setMetadata] = useState<Metadata>({
    title: '',
    author: '',
    summary: '',
    genre: 'Educational',
    topic: '',
    tags: '',
    difficulty: 'Intermediate',
    doc_type: 'Book'
  })
  
  const [splitterType, setSplitterType] = useState<'recursive' | 'character' | 'markdown' | 'html'>('recursive')
  const [chunkSize, setChunkSize] = useState(5000)
  const [chunkOverlap, setChunkOverlap] = useState(500)
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedData, setProcessedData] = useState<{
    chunks: ProcessedChunk[]
    result: PDFProcessingResult
  } | null>(null)
  
  const [progress, setProgress] = useState<ProcessingProgress | null>(null)
  const [error, setError] = useState('')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf')
    
    // Validate each file
    for (const file of pdfFiles) {
      const validation = validatePDFFile(file)
      if (!validation.valid) {
        alert(`File "${file.name}": ${validation.error}`)
        return
      }
    }

    setFiles(pdfFiles)
    setProcessedData(null)
    setError('')
    setProgress(null)
    
    // Auto-fill title if not set
    if (pdfFiles.length === 1 && !metadata.title) {
      const fileName = pdfFiles[0].name.replace('.pdf', '')
      setMetadata(prev => ({
        ...prev,
        title: fileName
      }))
    }
  }, [metadata.title])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true
  })

  const processFiles = async () => {
    if (!files || files.length === 0) {
      alert('Please select PDF files first')
      return
    }

    if (!metadata.title) {
      alert('Please enter a title')
      return
    }

    setIsProcessing(true)
    setError('')
    setProgress({ 
      stage: 'processing', 
      message: 'Processing PDF files on your device...', 
      progress: 0 
    })

    try {
      let allChunks: ProcessedChunk[] = []
      let totalProcessingTime = 0
      let totalTextLength = 0

      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        
        setProgress({ 
          stage: 'processing', 
          message: `Processing ${file.name} (${i + 1}/${files.length})...`, 
          progress: (i / files.length) * 80 
        })

        const result = await processPDFFile(file, {
          chunkSize,
          chunkOverlap,
          splitterType
        })

        if (!result.success) {
          throw new Error(`Failed to process ${file.name}: ${result.error}`)
        }

        // Add file info to chunks
        const fileChunks = result.chunks.map((chunk, index) => ({
          ...chunk,
          content: chunk.content,
          index: allChunks.length + index,
          length: chunk.length,
          fileName: file.name
        }))

        allChunks = [...allChunks, ...fileChunks]
        totalProcessingTime += result.processingTime
        totalTextLength += result.textLength
      }

      const finalResult: PDFProcessingResult = {
        success: true,
        chunks: allChunks,
        totalPages: 0, // Not tracked in client-side version
        extractedText: `Combined text from ${files.length} files`,
        textLength: totalTextLength,
        processingTime: totalProcessingTime
      }

      setProcessedData({
        chunks: allChunks,
        result: finalResult
      })

      setProgress({ 
        stage: 'complete', 
        message: `Successfully processed ${files.length} files into ${allChunks.length} chunks`, 
        progress: 100 
      })

    } catch (error) {
      console.error('Processing error:', error)
      setError(error instanceof Error ? error.message : 'Unknown error occurred')
      setProgress({ 
        stage: 'error', 
        message: 'Processing failed', 
        progress: 0 
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const uploadToVectorStore = async () => {
    if (!processedData || !processedData.chunks || processedData.chunks.length === 0) {
      setError('No processed chunks available to upload')
      return
    }

    console.log('🚀 Starting upload to vector store...')
    console.log('📊 Upload data:', {
      chunksCount: processedData.chunks.length,
      metadata: metadata,
      firstChunkSample: processedData.chunks[0]?.content?.substring(0, 200)
    })

    setProgress({ 
      stage: 'uploading', 
      message: 'Uploading chunks to vector database...', 
      progress: 0 
    })

    try {
      const uploadPayload = {
        chunks: processedData.chunks,
        metadata,
        processingInfo: {
          processingTime: processedData.result.processingTime,
          textLength: processedData.result.textLength,
          totalFiles: files.length,
          extractedText: processedData.result.extractedText
        }
      }
      
      console.log('📤 Sending upload request with payload:', {
        chunksCount: uploadPayload.chunks.length,
        metadataKeys: Object.keys(uploadPayload.metadata),
        processingInfoKeys: Object.keys(uploadPayload.processingInfo),
        payloadSize: JSON.stringify(uploadPayload).length
      })

      const response = await fetch('/api/upload-processed-chunks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(uploadPayload)
      })

      console.log('📨 Upload response status:', response.status)
      console.log('📨 Upload response ok:', response.ok)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ Upload failed with error data:', errorData)
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Upload successful! Result:', result)
      
      setProgress({ 
        stage: 'complete', 
        message: `✅ Successfully uploaded ${result.chunksCount || 0} chunks to vector database! Document ID: ${result.documentId}`, 
        progress: 100 
      })

      // DON'T auto-reset - let user see the results and decide
      console.log('🎉 Upload completed successfully - keeping results visible')

    } catch (error) {
      console.error('❌ Upload error:', error)
      setError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`)
      setProgress({ 
        stage: 'error', 
        message: 'Upload failed - check console for details', 
        progress: 0 
      })
    }
  }

  const debugTestUpload = async () => {
    if (!processedData || !processedData.chunks || processedData.chunks.length === 0) {
      setError('No processed chunks available to test')
      return
    }

    try {
      console.log('🔍 Testing upload data format...')
      const response = await fetch('/api/debug-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chunks: processedData.chunks,
          metadata,
          processingInfo: {
            processingTime: processedData.result.processingTime,
            textLength: processedData.result.textLength,
            totalFiles: files.length,
            extractedText: processedData.result.extractedText
          }
        })
      })

      const result = await response.json()
      console.log('🔍 Debug test result:', result)
      alert(`Debug Test Results:\n\nChunks received: ${result.debug?.chunksReceived}\nFirst chunk valid: ${result.debug?.firstChunkValid}\nFirst chunk length: ${result.debug?.firstChunkLength}\n\nCheck console for detailed logs.`)
      
    } catch (error) {
      console.error('Debug test error:', error)
      alert(`Debug test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const testChunkStructure = async () => {
    if (!processedData || !processedData.chunks || processedData.chunks.length === 0) {
      setError('No processed chunks available to test')
      return
    }

    try {
      console.log('🔍 Testing chunk structure...')
      const response = await fetch('/api/test-chunk-structure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chunks: processedData.chunks,
          metadata,
          processingInfo: {
            processingTime: processedData.result.processingTime,
            textLength: processedData.result.textLength,
            totalFiles: files.length,
            extractedText: processedData.result.extractedText
          }
        })
      })

      const result = await response.json()
      console.log('🔍 Chunk structure test result:', result)
      
      const debug = result.debug
      alert(`Chunk Structure Test Results:

📊 Chunks received: ${debug?.chunksLength}
📊 Valid chunks: ${debug?.validChunksCount}
📊 First chunk keys: ${debug?.firstChunkKeys?.join(', ')}
📊 Content type: ${debug?.firstChunkContentType}
📊 Content length: ${debug?.firstChunkContentLength}

Check console for detailed logs and chunk sample.`)
      
    } catch (error) {
      console.error('Chunk structure test error:', error)
      alert(`Chunk structure test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const testSupabaseUpload = async () => {
    try {
      console.log('🧪 Testing Supabase upload connectivity...')
      const response = await fetch('/api/test-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      console.log('🧪 Supabase test result:', result)
      
      if (result.success) {
        alert(`✅ Supabase Upload Test PASSED!

${result.message}

Tests:
${Object.entries(result.tests).map(([key, value]) => `${key}: ${value}`).join('\n')}

The database connection is working. Upload issue must be elsewhere.`)
      } else {
        alert(`❌ Supabase Upload Test FAILED!

Error: ${result.error}

Details: ${JSON.stringify(result.details, null, 2)}

Check console for full error details.`)
      }
      
    } catch (error) {
      console.error('Supabase test error:', error)
      alert(`Supabase test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const resetForNewUpload = () => {
    setFiles([])
    setProcessedData(null)
    setProgress(null)
    setError('')
    setMetadata({
      title: '',
      author: '',
      summary: '',
      genre: 'Educational',
      topic: '',
      tags: '',
      difficulty: 'Intermediate',
      doc_type: 'Book'
    })
  }

  // Don't render on server or before client hydration
  if (!isBrowser || !isMounted) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
            <span className="ml-4 text-gray-600">Loading client-side PDF processor...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          📄 Upload Documents (Client-Side Processing)
        </h2>
        
        {/* File Upload */}
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">
            Drag & drop PDF files here, or click to select
          </p>
          <p className="text-sm text-gray-500">
            Supports multiple PDF files (up to 100MB each)
          </p>
          <p className="text-xs text-green-600 mt-1">
            ⚡ Processed locally on your device - no size limits!
          </p>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-700 mb-3">Selected Files:</h3>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-500" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-gray-500 text-sm">
                    ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processing Settings */}
        {files.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-700 mb-4">Processing Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Text Splitter Type
                  </label>
                  <select
                    value={splitterType}
                    onChange={(e) => setSplitterType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="recursive">Recursive Character</option>
                    <option value="character">Character</option>
                    <option value="markdown">Markdown</option>
                    <option value="html">HTML</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chunk Size
                  </label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    min="100"
                    max="5000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Characters per chunk (100-5000)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chunk Overlap
                  </label>
                  <input
                    type="number"
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(Number(e.target.value))}
                    min="0"
                    max="1000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Characters overlap (0-1000)</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 mb-4">Document Metadata</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => setMetadata(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Document title"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    value={metadata.author}
                    onChange={(e) => setMetadata(prev => ({ ...prev, author: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Author name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Summary
                  </label>
                  <textarea
                    value={metadata.summary}
                    onChange={(e) => setMetadata(prev => ({ ...prev, summary: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Brief summary of the document"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Genre
                    </label>
                    <select
                      value={metadata.genre}
                      onChange={(e) => setMetadata(prev => ({ ...prev, genre: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Educational">Educational</option>
                      <option value="Philosophy">Philosophy</option>
                      <option value="Science">Science</option>
                      <option value="Technology">Technology</option>
                      <option value="Fiction">Fiction</option>
                      <option value="Non-Fiction">Non-Fiction</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Difficulty
                    </label>
                    <select
                      value={metadata.difficulty}
                      onChange={(e) => setMetadata(prev => ({ ...prev, difficulty: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                      <option value="Expert">Expert</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              {progress.stage === 'complete' ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : progress.stage === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-500" />
              ) : (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              )}
              <span className="font-medium">{progress.message}</span>
            </div>
            {progress.stage !== 'error' && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700 font-medium">Error:</span>
            </div>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
        )}

        {/* Processed Data Preview */}
        {processedData && (
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">✅ Processing Complete!</h4>
              <div className="text-sm text-green-700 space-y-1">
                <p>📄 Files processed: {files.length}</p>
                <p>✂️ Chunks created: {processedData.chunks.length}</p>
                <p>📝 Total text length: {processedData.result.textLength.toLocaleString()} characters</p>
                <p>⏱️ Processing time: {processedData.result.processingTime}ms</p>
              </div>
            </div>

            {/* Chunk Preview */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-3">📄 Chunk Preview</h4>
              <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto">
                {processedData.chunks.slice(0, 4).map((chunk: any, index: number) => (
                  <div key={index} className="bg-white p-4 rounded border border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-blue-600">
                        Chunk {index + 1} of {processedData.chunks.length}
                      </span>
                      <span className="text-sm text-gray-500">
                        {chunk.content.length} characters
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 leading-relaxed border-l-4 border-blue-200 pl-3">
                      {chunk.content.length > 800 ? (
                        <>
                          <div className="mb-2">
                            <strong>Preview (first 400 chars):</strong>
                            <div className="mt-1">{chunk.content.substring(0, 400)}...</div>
                          </div>
                          <div>
                            <strong>End (last 400 chars):</strong>
                            <div className="mt-1">...{chunk.content.substring(chunk.content.length - 400)}</div>
                          </div>
                        </>
                      ) : (
                        chunk.content
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {processedData.chunks.length > 4 && (
                <p className="text-sm text-blue-600 mt-3 text-center">
                  Showing 4 of {processedData.chunks.length} chunks. Upload to see all chunks in Supabase.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <div className="mt-6 flex gap-4">
            {/* Show upload another button if upload is complete */}
            {progress?.stage === 'complete' ? (
              <button
                onClick={resetForNewUpload}
                className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                📄 Upload Another Document
              </button>
            ) : (
              <>
                <button
                  onClick={processFiles}
                  disabled={!metadata.title || isProcessing}
                  className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {isProcessing ? 'Processing...' : 'Process Files'}
                </button>

                {processedData && (
                  <button
                    onClick={uploadToVectorStore}
                    disabled={progress?.stage === 'uploading'}
                    className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {progress?.stage === 'uploading' ? 'Uploading...' : 'Upload to Vector Store'}
                  </button>
                )}

                {processedData && (
                  <button
                    onClick={debugTestUpload}
                    disabled={progress?.stage === 'uploading'}
                    className="px-6 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    {progress?.stage === 'uploading' ? 'Testing...' : 'Debug Test Upload'}
                  </button>
                )}

                {processedData && (
                  <button
                    onClick={testChunkStructure}
                    disabled={progress?.stage === 'uploading'}
                    className="px-6 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    {progress?.stage === 'uploading' ? 'Testing...' : 'Test Chunk Structure'}
                  </button>
                )}

                {processedData && (
                  <button
                    onClick={testSupabaseUpload}
                    disabled={progress?.stage === 'uploading'}
                    className="px-6 py-2 bg-pink-500 text-white rounded-md hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    {progress?.stage === 'uploading' ? 'Testing...' : 'Test Supabase Upload'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 