'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, Eye, CheckCircle, AlertCircle, Loader2, Info, Zap, Cpu } from 'lucide-react'
import { DocumentMetadata } from '@/types'
import { smartUploadPDFs, getUploadMethod, UploadResult } from '@/lib/smart-upload-handler'
import { formatFileSize } from '@/lib/utils'

export function SmartUpload() {
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
  
  const [uploadMethod, setUploadMethod] = useState<{
    method: 'server-side' | 'client-side-chunks'
    reason: string
    totalSizeMB: number
  } | null>(null)
  
  const [splitterType, setSplitterType] = useState<'recursive' | 'character' | 'markdown' | 'html'>('recursive')
  const [chunkSize, setChunkSize] = useState(5000)
  const [chunkOverlap, setChunkOverlap] = useState(500)
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ stage: '', progress: 0, message: '' })
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')

  // Update upload method when files change
  useEffect(() => {
    if (files.length > 0) {
      const method = getUploadMethod(files)
      setUploadMethod(method)
    } else {
      setUploadMethod(null)
    }
  }, [files])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf')
    
    if (pdfFiles.length === 0) {
      alert('Please select PDF files only.')
      return
    }

    setFiles(pdfFiles)
    setError('')
    setUploadResult(null)
    
    // Auto-fill title from first file if empty
    if (pdfFiles.length === 1 && !metadata.title) {
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
    }
  }

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      alert('Please select PDF files first')
      return
    }

    if (!metadata.title.trim()) {
      alert('Please enter a title')
      return
    }

    setIsUploading(true)
    setError('')
    setUploadResult(null)

    try {
      const result = await smartUploadPDFs(files, metadata, {
        chunkSize,
        chunkOverlap,
        splitterType,
        onProgress: (stage, progress, message) => {
          setUploadProgress({ stage, progress, message })
        }
      })

      setUploadResult(result)
      
      if (result.success) {
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
          setUploadResult(null)
        }, 5000)
      }
      
    } catch (error) {
      console.error('Upload error:', error)
      setError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
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
    setUploadResult(null)
    setError('')
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        📄 Smart PDF Upload
      </h2>
      
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 text-blue-700 text-sm">
          <Info className="w-4 h-4" />
          <span className="font-medium">Automatic File Size Detection</span>
        </div>
        <p className="text-blue-600 text-sm mt-1">
          Files ≤4MB use fast server processing. Files >4MB use client-side processing to bypass Vercel limits.
        </p>
      </div>

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
                Supports files of any size • Automatic processing method selection
              </p>
            </div>
          )}
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Selected Files:</h3>
              {uploadMethod && (
                <div className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm ${
                  uploadMethod.method === 'server-side' 
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-blue-100 text-blue-700 border border-blue-200'
                }`}>
                  {uploadMethod.method === 'server-side' ? (
                    <Zap className="w-4 h-4" />
                  ) : (
                    <Cpu className="w-4 h-4" />
                  )}
                  <span className="font-medium">
                    {uploadMethod.method === 'server-side' ? 'Server Processing' : 'Client Processing'}
                  </span>
                  <span className="text-xs opacity-75">
                    ({uploadMethod.totalSizeMB.toFixed(1)}MB)
                  </span>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-red-500" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{formatFileSize(file.size)}</span>
                        {file.size > 4 * 1024 * 1024 && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                            Large File
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
            
            {uploadMethod && (
              <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg">
                <strong>Processing Method:</strong> {uploadMethod.reason}
              </div>
            )}
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
                  disabled={!metadata.title.trim()}
                  className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  🧠 Generate
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
              <input
                type="text"
                value={metadata.author}
                onChange={(e) => handleMetadataChange('author', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Author name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <input
                type="text"
                value={metadata.doc_type}
                onChange={(e) => handleMetadataChange('doc_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Book, Article, Report"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Genre</label>
              <input
                type="text"
                value={metadata.genre}
                onChange={(e) => handleMetadataChange('genre', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Philosophy, Science"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
              <input
                type="text"
                value={metadata.topic}
                onChange={(e) => handleMetadataChange('topic', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Ethics, Quantum Physics"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
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
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <input
                type="text"
                value={metadata.tags}
                onChange={(e) => handleMetadataChange('tags', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Comma-separated tags"
              />
            </div>
            
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={metadata.description}
                onChange={(e) => handleMetadataChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Brief description of the document content"
              />
            </div>
          </div>
        </div>
      )}

      {/* Advanced Settings */}
      {files.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <span>Advanced Settings</span>
            <span className={`transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {showAdvanced && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Text Splitter
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
                    onChange={(e) => setChunkSize(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="500"
                    max="10000"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chunk Overlap
                  </label>
                  <input
                    type="number"
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="2000"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="font-medium text-blue-800">
              {uploadProgress.stage || 'Processing'}...
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.progress}%` }}
            />
          </div>
          <p className="text-sm text-blue-700">{uploadProgress.message}</p>
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className={`mb-6 p-4 rounded-lg border ${
          uploadResult.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {uploadResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-medium ${
              uploadResult.success ? 'text-green-800' : 'text-red-800'
            }`}>
              {uploadResult.success ? 'Upload Successful!' : 'Upload Failed'}
            </span>
          </div>
          
          {uploadResult.success ? (
            <div className="text-sm text-green-700">
              <p>📄 Documents: {uploadResult.documentsCount}</p>
              <p>📝 Chunks: {uploadResult.chunksCount}</p>
              <p>⚙️ Method: {uploadResult.uploadMethod}</p>
              {uploadResult.errorCount && uploadResult.errorCount > 0 && (
                <p>⚠️ Errors: {uploadResult.errorCount}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-700">{uploadResult.error}</p>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="font-medium text-red-800">Error</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleUpload}
          disabled={!files.length || !metadata.title.trim() || isUploading}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {isUploading ? 'Uploading...' : 'Upload Documents'}
        </button>
        
        {(files.length > 0 || uploadResult) && (
          <button
            onClick={resetForm}
            disabled={isUploading}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
} 