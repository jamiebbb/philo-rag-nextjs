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
    description: ''
  })
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [chunkStats, setChunkStats] = useState<ChunkStats | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [splitterType, setSplitterType] = useState<'recursive' | 'character'>('recursive')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf')
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

  const previewChunks = async () => {
    if (files.length === 0 || !metadata.title) return

    setUploadProgress({
      stage: 'processing',
      progress: 0,
      message: 'Generating chunk preview...'
    })

    try {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      formData.append('metadata', JSON.stringify(metadata))
      formData.append('splitterType', splitterType)

      const response = await fetch('/api/preview-chunks', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to preview chunks')
      }

      const data = await response.json()
      setChunkStats(data.chunkStats)
      setShowPreview(true)
      setUploadProgress({
        stage: 'complete',
        progress: 100,
        message: 'Preview generated successfully!'
      })
    } catch (error) {
      console.error('Error previewing chunks:', error)
      setUploadProgress({
        stage: 'error',
        progress: 0,
        message: 'Failed to generate preview. Please try again.'
      })
    }
  }

  const uploadDocuments = async () => {
    if (!chunkStats) {
      await previewChunks()
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
                Supports multiple PDF files
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <div className="md:col-span-2">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Text Splitter
              </label>
              <select
                value={splitterType}
                onChange={(e) => setSplitterType(e.target.value as 'recursive' | 'character')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recursive">Recursive Character (Recommended)</option>
                <option value="character">Character</option>
              </select>
            </div>
          </div>
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
              <p className="text-2xl font-bold text-blue-600">{chunkStats.total_chunks}</p>
              <p className="text-sm text-gray-600">Total Chunks</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{chunkStats.avg_length}</p>
              <p className="text-sm text-gray-600">Avg Length</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{chunkStats.min_length}</p>
              <p className="text-sm text-gray-600">Min Length</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{chunkStats.max_length}</p>
              <p className="text-sm text-gray-600">Max Length</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">First Chunk:</h4>
              <div className="bg-white p-3 rounded border text-sm">
                {chunkStats.first_chunk.content.substring(0, 200)}...
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Last Chunk:</h4>
              <div className="bg-white p-3 rounded border text-sm">
                {chunkStats.last_chunk.content.substring(0, 200)}...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
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
          {uploadProgress.stage !== 'complete' && uploadProgress.stage !== 'error' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={previewChunks}
          disabled={files.length === 0 || !metadata.title || uploadProgress?.stage === 'processing'}
          className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          Preview Chunks
        </button>
        
        <button
          onClick={uploadDocuments}
          disabled={!chunkStats || uploadProgress?.stage === 'uploading'}
          className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload to Supabase
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