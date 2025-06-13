'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, Eye, CheckCircle, AlertCircle } from 'lucide-react'
import { DocumentMetadata, UploadProgress, ChunkStats } from '@/types'
import { formatFileSize } from '@/lib/utils'

export function DocumentUpload() {
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
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [chunkStats, setChunkStats] = useState<ChunkStats | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [splitterType, setSplitterType] = useState<'recursive' | 'character' | 'markdown' | 'html'>('recursive')
  const [chunkSize, setChunkSize] = useState(5000)
  const [chunkOverlap, setChunkOverlap] = useState(500)
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // No file size limits for server-side processing
  // Server can handle larger files efficiently

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf')
    
    // Just validate that files are PDFs, no size restrictions
    if (pdfFiles.length === 0) {
      alert('Please select PDF files only.')
      return
    }

    setFiles(pdfFiles)
    
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
    multiple: true
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleMetadataChange = (field: keyof DocumentMetadata, value: string) => {
    setMetadata(prev => ({ ...prev, [field]: value }))
  }

  const generateMetadata = async () => {
    if (!metadata.title.trim()) {
      alert('Please enter a title first')
      return
    }

    setIsGeneratingMetadata(true)
    try {
      const response = await fetch('/api/generate-document-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: metadata.title.trim() })
      })

      if (response.ok) {
        const data = await response.json()
        setMetadata(prev => ({
          ...prev,
          ...data.metadata
        }))
      } else {
        alert('Failed to generate metadata. Please enter manually.')
      }
    } catch (error) {
      console.error('Error generating metadata:', error)
      alert('Failed to generate metadata. Please enter manually.')
    } finally {
      setIsGeneratingMetadata(false)
    }
  }

  const handlePreview = async () => {
    if (!files || files.length === 0) {
      alert('Please select PDF files first')
      return
    }

    setIsLoading(true)
    setError('')
    setChunkStats(null)

    try {
      console.log('🚀 Starting preview request')
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      formData.append('metadata', JSON.stringify(metadata))
      formData.append('splitterType', splitterType)
      formData.append('chunkSize', chunkSize.toString())
      formData.append('chunkOverlap', chunkOverlap.toString())
      formData.append('pdfParser', 'pdf-parse')

      console.log('📤 Sending preview request:', {
        fileCount: files.length,
        splitterType,
        chunkSize,
        chunkOverlap
      })

      const response = await fetch('/api/preview-chunks', {
        method: 'POST',
        body: formData
      })

      console.log('📥 Received response:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      })

      if (!response.ok) {
        let errorMessage = 'Unknown error occurred'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
          console.error('❌ Server error response:', errorData)
        } catch (jsonError) {
          console.error('❌ Failed to parse error response:', jsonError)
        }
        
        // Handle specific error types
        if (response.status === 413) {
          errorMessage = `File too large: ${errorMessage}\n\nTip: Try uploading smaller PDF files (under 2MB each) or split large documents into smaller parts.`
        } else if (response.status === 500) {
          errorMessage = `Server error: ${errorMessage}\n\nThis might be due to file size or complexity. Try a smaller file.`
        }
        
        throw new Error(errorMessage)
      }

      let data
      try {
        const responseText = await response.text()
        console.log('📦 Raw response text:', responseText)
        data = JSON.parse(responseText)
        console.log('✅ Parsed response data:', {
          success: data.success,
          totalChunks: data.chunkStats?.total_chunks,
          previewChunksCount: data.chunkStats?.preview_chunks?.length
        })
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError)
        throw new Error('Failed to parse server response')
      }

      if (!data.success || !data.chunkStats) {
        console.error('❌ Invalid response format:', data)
        throw new Error('Invalid response from server')
      }

      setChunkStats(data.chunkStats)
      setShowPreview(true)
      console.log('✅ Preview successful')
    } catch (error) {
      console.error('❌ Error previewing chunks:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setError(`Failed to preview chunks: ${errorMessage}`)
      setShowPreview(false)
    } finally {
      setIsLoading(false)
    }
  }

  const uploadDocuments = async () => {
    if (!chunkStats) {
      await handlePreview()
      return
    }

    setUploadProgress({
      stage: 'uploading',
      progress: 0,
      message: 'Uploading documents...'
    })

    try {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      formData.append('metadata', JSON.stringify(metadata))
      formData.append('splitterType', splitterType)
      formData.append('chunkSize', chunkSize.toString())
      formData.append('chunkOverlap', chunkOverlap.toString())

      const response = await fetch('/api/upload-documents', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to upload documents')
      }

      const data = await response.json()
      setUploadProgress({
        stage: 'complete',
        progress: 100,
        message: `Successfully uploaded ${data.documentsCount} documents with ${data.chunksCount} chunks!`
      })

      // Reset form
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
        setChunkStats(null)
        setShowPreview(false)
        setUploadProgress(null)
      }, 3000)
    } catch (error) {
      console.error('Error uploading documents:', error)
      setUploadProgress({
        stage: 'error',
        progress: 0,
        message: 'Failed to upload documents. Please try again.'
      })
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
    setChunkStats(null)
    setShowPreview(false)
    setUploadProgress(null)
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Documents</h2>

      {/* File Upload */}
      <div className="mb-6">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          {isDragActive ? (
            <p className="text-blue-600">Drop the PDF files here...</p>
          ) : (
            <div>
              <p className="text-gray-600 mb-2">
                Drag & drop PDF files here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Supports multiple PDF files of any size
              </p>
              <p className="text-xs text-blue-600 mt-1">
                ⚡ Server-side processing handles large files efficiently
              </p>
            </div>
          )}
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="font-medium text-gray-900">Selected Files:</h3>
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata Form */}
      {files.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-4">Document Metadata</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => handleMetadataChange('title', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Document title"
                  required
                />
                <button
                  type="button"
                  onClick={generateMetadata}
                  disabled={!metadata.title.trim() || isGeneratingMetadata}
                  className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGeneratingMetadata ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      🧠 Generate Metadata
                    </>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Type
              </label>
              <input
                type="text"
                value={metadata.doc_type}
                onChange={(e) => handleMetadataChange('doc_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Book, Article, Report"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Genre
              </label>
              <input
                type="text"
                value={metadata.genre}
                onChange={(e) => handleMetadataChange('genre', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Philosophy, Science, Fiction"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic
              </label>
              <input
                type="text"
                value={metadata.topic}
                onChange={(e) => handleMetadataChange('topic', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Ethics, Quantum Physics, History"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
              </label>
              <select
                value={metadata.difficulty}
                onChange={(e) => handleMetadataChange('difficulty', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select difficulty</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
                <option value="Expert">Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <input
                type="text"
                value={metadata.tags}
                onChange={(e) => handleMetadataChange('tags', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., philosophy, education, research"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={metadata.description}
                onChange={(e) => handleMetadataChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of the document"
                rows={3}
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Text Splitter
              </label>
              <select
                value={splitterType}
                onChange={(e) => setSplitterType(e.target.value as 'recursive' | 'character' | 'markdown' | 'html')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recursive">Recursive Character (Recommended)</option>
                <option value="character">Character</option>
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
              </select>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <span>⚙️</span>
              Advanced Chunking Settings
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chunk Size
                  </label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    min="500"
                    max="8000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Characters per chunk (optimal: 3000-6000)</p>
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
        </div>
      )}

      {/* Debug Info - Remove this in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
          <strong>Debug Info:</strong>
          <div>showPreview: {showPreview.toString()}</div>
          <div>chunkStats: {chunkStats ? 'Present' : 'Null'}</div>
          {chunkStats && (
            <div>chunkStats.total_chunks: {chunkStats.total_chunks}</div>
          )}
          <div>uploadProgress: {uploadProgress?.stage || 'None'}</div>
        </div>
      )}

      {/* Chunk Preview */}
      {showPreview && chunkStats && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Chunk Preview
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{chunkStats.total_chunks || 0}</p>
              <p className="text-sm text-gray-600">Total Chunks</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{chunkStats.avg_length || 0}</p>
              <p className="text-sm text-gray-600">Avg Length</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{chunkStats.min_length || 0}</p>
              <p className="text-sm text-gray-600">Min Length</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{chunkStats.max_length || 0}</p>
              <p className="text-sm text-gray-600">Max Length</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {chunkStats.first_chunk && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">First Chunk:</h4>
                <div className="bg-white p-3 rounded border text-sm">
                  {(chunkStats.first_chunk.content || '').substring(0, 200)}
                  {(chunkStats.first_chunk.content || '').length > 200 && '...'}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Length: {chunkStats.first_chunk.length || (chunkStats.first_chunk.content || '').length} characters
                </p>
              </div>
            )}
            {chunkStats.last_chunk && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Last Chunk:</h4>
                <div className="bg-white p-3 rounded border text-sm">
                  {(chunkStats.last_chunk.content || '').substring(0, 200)}
                  {(chunkStats.last_chunk.content || '').length > 200 && '...'}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Length: {chunkStats.last_chunk.length || (chunkStats.last_chunk.content || '').length} characters
                </p>
              </div>
            )}
          </div>
          
          {/* Add expandable all chunks view */}
          {chunkStats.preview_chunks && chunkStats.preview_chunks.length > 2 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-900 mb-2">Preview Chunks:</h4>
              <div className="space-y-4">
                {chunkStats.preview_chunks.map((chunk, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Chunk {chunk.index + 1}</span>
                      <span className="text-sm text-gray-500">{chunk.length} characters</span>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{chunk.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            {uploadProgress.stage === 'complete' ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : uploadProgress.stage === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-500" />
            ) : (
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="font-medium">{uploadProgress.message}</span>
          </div>
          {uploadProgress.stage !== 'error' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="font-medium text-red-800">Error</span>
          </div>
          <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handlePreview}
          disabled={files.length === 0 || !metadata.title || isLoading || uploadProgress?.stage === 'processing'}
          className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          {isLoading ? 'Generating Preview...' : 'Preview Chunks'}
        </button>
        
        <button
          onClick={uploadDocuments}
          disabled={files.length === 0 || !metadata.title || isLoading || uploadProgress?.stage === 'uploading'}
          className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {chunkStats ? 'Upload Documents' : 'Preview & Upload'}
        </button>

        <button
          onClick={resetForm}
          className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Reset
        </button>
      </div>
    </div>
  )
} 