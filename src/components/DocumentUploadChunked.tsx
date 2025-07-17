'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, Eye, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { DocumentMetadata, UploadProgress } from '@/types'
import { formatFileSize } from '@/lib/utils'
import { ChunkedUploader, ChunkedUploadProgress } from '@/lib/chunked-upload'

export function DocumentUploadChunked() {
  const [files, setFiles] = useState<File[]>([])
  const [metadata, setMetadata] = useState<DocumentMetadata>({
    title: '',
    author: '',
    doc_type: '',
    genre: '',
    topic: '',
    difficulty: '',
    tags: '',
    description: ''
  })
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [splitterType, setSplitterType] = useState<'recursive' | 'character' | 'markdown' | 'html'>('recursive')
  const [chunkSize, setChunkSize] = useState(5000)
  const [chunkOverlap, setChunkOverlap] = useState(500)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf')
    
    if (pdfFiles.length === 0) {
      alert('Please select PDF files only.')
      return
    }

    setFiles(pdfFiles)
    setResult(null)
    setError('')
    setUploadProgress(null)
    
    // Auto-fill title from first file if empty
    if (pdfFiles.length > 0 && !metadata.title) {
      const fileName = pdfFiles[0].name.replace('.pdf', '')
      setMetadata(prev => ({ ...prev, title: fileName }))
    }
  }, [metadata.title])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: false // For chunked upload, handle one file at a time
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleMetadataChange = (field: keyof DocumentMetadata, value: string) => {
    setMetadata(prev => ({ ...prev, [field]: value }))
  }

  const uploadDocuments = async () => {
    if (!files || files.length === 0) {
      alert('Please select a PDF file first')
      return
    }

    if (!metadata.title) {
      alert('Please enter a title')
      return
    }

    setIsLoading(true)
    setError('')
    setResult(null)

    try {
      const file = files[0] // Handle one file at a time for chunked upload
      
      // Check if file needs chunked upload
      const needsChunkedUpload = ChunkedUploader.needsChunkedUpload(file)
      
      if (needsChunkedUpload) {
        console.log(`📦 Large file detected (${(file.size / 1024 / 1024).toFixed(1)}MB) - using chunked upload`)
        
        const uploader = new ChunkedUploader(file, {
          metadata,
          processingOptions: {
            splitterType,
            chunkSize,
            chunkOverlap,
            pdfParser: 'pdf-parse'
          },
          onProgress: (progress) => {
            setUploadProgress(progress)
          }
        })

        const uploadResult = await uploader.upload()
        setResult(uploadResult)
        
      } else {
        console.log(`📄 Small file (${(file.size / 1024 / 1024).toFixed(1)}MB) - using direct upload`)
        
        // Use existing direct upload for smaller files
        const formData = new FormData()
        formData.append('files', file)
        formData.append('metadata', JSON.stringify(metadata))
        formData.append('splitterType', splitterType)
        formData.append('chunkSize', chunkSize.toString())
        formData.append('chunkOverlap', chunkOverlap.toString())

        setUploadProgress({
          stage: 'uploading',
          progress: 50,
          message: 'Uploading document...'
        })

        const response = await fetch('/api/upload-documents', {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          throw new Error('Failed to upload document')
        }

        const data = await response.json()
        setResult(data)
        
        setUploadProgress({
          stage: 'complete',
          progress: 100,
          message: `Successfully uploaded ${data.documentsCount} documents with ${data.chunksCount} chunks!`
        })
      }

      // Reset form after successful upload
      setTimeout(() => {
        setFiles([])
        setMetadata({
          title: '',
          author: '',
          doc_type: '',
          genre: '',
          topic: '',
          difficulty: '',
          tags: '',
          description: ''
        })
        setUploadProgress(null)
      }, 5000)

    } catch (error) {
      console.error('Error uploading document:', error)
      setError(error instanceof Error ? error.message : 'Unknown error occurred')
      setUploadProgress({
        stage: 'error',
        progress: 0,
        message: 'Upload failed. Please try again.'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFiles([])
    setMetadata({
      title: '',
      author: '',
      doc_type: '',
      genre: '',
      topic: '',
      difficulty: '',
      tags: '',
      description: ''
    })
    setUploadProgress(null)
    setResult(null)
    setError('')
  }

  const renderProgressBar = () => {
    if (!uploadProgress) return null

    const progressColor = 
      uploadProgress.stage === 'complete' ? 'bg-green-500' :
      uploadProgress.stage === 'error' ? 'bg-red-500' :
      'bg-blue-500'

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          {uploadProgress.stage === 'complete' && <CheckCircle className="w-5 h-5 text-green-500" />}
          {uploadProgress.stage === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
          {!['complete', 'error'].includes(uploadProgress.stage) && <Clock className="w-5 h-5 text-blue-500 animate-spin" />}
          <span className="font-medium">{uploadProgress.message}</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${progressColor}`}
            style={{ width: `${uploadProgress.progress}%` }}
          ></div>
        </div>
        
        {uploadProgress.currentChunk && uploadProgress.totalChunks && (
          <div className="mt-2 text-sm text-gray-600">
            Chunk {uploadProgress.currentChunk} of {uploadProgress.totalChunks}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          📄 Smart PDF Upload (Auto-detects Large Files)
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
            Drag & drop a PDF file here, or click to select
          </p>
          <p className="text-sm text-gray-500">
            ⚡ Automatically uses chunked upload for files &gt; 4.5MB
          </p>
          <p className="text-xs text-green-600 mt-1">
            ✓ No size limits • ✓ Resume capability • ✓ Error recovery
          </p>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-700 mb-3">Selected File:</h3>
            <div className="space-y-2">
              {files.map((file, index) => {
                const needsChunkedUpload = ChunkedUploader.needsChunkedUpload(file)
                return (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-gray-500 text-sm">
                      ({formatFileSize(file.size)})
                    </span>
                    {needsChunkedUpload && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                        Chunked Upload
                      </span>
                    )}
                    <button
                      onClick={() => removeFile(index)}
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Metadata Form */}
        {files.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={metadata.title}
                onChange={(e) => handleMetadataChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Document title"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Author
              </label>
              <input
                type="text"
                value={metadata.author}
                onChange={(e) => handleMetadataChange('author', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Author name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Type
              </label>
              <select
                value={metadata.doc_type}
                onChange={(e) => handleMetadataChange('doc_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type</option>
                <option value="Book">Book</option>
                <option value="Article">Article</option>
                <option value="Research Paper">Research Paper</option>
                <option value="Manual">Manual</option>
                <option value="Report">Report</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topic
              </label>
              <input
                type="text"
                value={metadata.topic}
                onChange={(e) => handleMetadataChange('topic', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Main topic"
              />
            </div>
          </div>
        )}

        {/* Advanced Settings */}
        {files.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <span>⚙️</span>
              Advanced Processing Settings
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Text Chunk Size
                  </label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    min="500"
                    max="8000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Characters per text chunk (optimal: 3000-6000)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  <p className="text-xs text-gray-500 mt-1">Characters overlap (optimal: 200-800)</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress Display */}
        {renderProgressBar()}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700 font-medium">Upload Error</span>
            </div>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
        )}

        {/* Success Result */}
        {result && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-700 font-medium">Upload Successful!</span>
            </div>
            <div className="mt-2 text-sm text-green-600">
              <p>Document ID: {result.documentId}</p>
              <p>Chunks stored: {result.chunksStored || result.chunksCount}</p>
              {result.originalFileSize && (
                <p>Original file size: {formatFileSize(result.originalFileSize)}</p>
              )}
            </div>
          </div>
        )}

        {/* Upload Button */}
        {files.length > 0 && !uploadProgress && (
          <div className="mt-6 flex gap-4">
            <button
              onClick={uploadDocuments}
              disabled={isLoading || !metadata.title}
              className="flex-1 bg-blue-500 text-white py-3 px-6 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? 'Processing...' : 'Upload Document'}
            </button>
            <button
              onClick={resetForm}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  )
} 