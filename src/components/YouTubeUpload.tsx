'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle, Settings, Youtube, Eye, Link, Sparkles, RefreshCw } from 'lucide-react'

interface VideoMetadata {
  title: string
  author: string
  summary: string
  genre: string
  topic: string
  tags: string
  difficulty: string
  youtube_channel: string
  video_id: string
  source_url: string
  source_type: string
}

interface ProcessResult {
  success: boolean
  message: string
  metadata?: VideoMetadata
  transcriptLength?: number
  chunksAdded?: number
  videoId?: string
}

export function YouTubeUpload() {
  const [url, setUrl] = useState('')
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null)
  const [cleanedTranscript, setCleanedTranscript] = useState<string>('')
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [chunkSize, setChunkSize] = useState(400)
  const [chunkOverlap, setChunkOverlap] = useState(200)
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [processingStep, setProcessingStep] = useState('')

  const extractVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(regex)
    return match ? match[1] : null
  }

  const isValidYouTubeUrl = (url: string) => {
    return extractVideoId(url) !== null
  }

  const generateMetadata = async () => {
    if (!url.trim() || !isValidYouTubeUrl(url.trim())) return

    setIsGeneratingMetadata(true)
    setResult(null)
    setProcessingStep('Fetching video metadata and transcript...')

    try {
      const videoId = extractVideoId(url.trim())
      
      const response = await fetch('/api/youtube/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          videoId
        })
      })

      const data = await response.json()

      if (response.ok) {
        setVideoMetadata(data.metadata)
        setCleanedTranscript(data.cleanedTranscript)
        setProcessingStep('')
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to generate metadata'
        })
      }
    } catch (error) {
      console.error('Error generating metadata:', error)
      setResult({
        success: false,
        message: 'Error generating metadata. Please check your connection and try again.'
      })
    } finally {
      setIsGeneratingMetadata(false)
      setProcessingStep('')
    }
  }

  const uploadToSupabase = async () => {
    if (!videoMetadata || !cleanedTranscript) {
      setResult({
        success: false,
        message: 'Please generate metadata first'
      })
      return
    }

    setIsUploading(true)
    setResult(null)
    setProcessingStep('Processing and uploading to Supabase...')

    try {
      const response = await fetch('/api/youtube/upload-to-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoMetadata,
          cleanedTranscript,
          chunkSize,
          chunkOverlap
        })
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully uploaded ${data.chunksAdded} chunks to Supabase vector database!`,
          metadata: videoMetadata,
          transcriptLength: cleanedTranscript.length,
          chunksAdded: data.chunksAdded,
          videoId: videoMetadata.video_id
        })
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to upload to Supabase'
        })
      }
    } catch (error) {
      console.error('Error uploading to Supabase:', error)
      setResult({
        success: false,
        message: 'Error uploading to Supabase. Please check your connection and try again.'
      })
    } finally {
      setIsUploading(false)
      setProcessingStep('')
    }
  }

  const resetForm = () => {
    setUrl('')
    setVideoMetadata(null)
    setCleanedTranscript('')
    setResult(null)
    setProcessingStep('')
  }

  const updateMetadata = (field: keyof VideoMetadata, value: string) => {
    if (videoMetadata) {
      setVideoMetadata({
        ...videoMetadata,
        [field]: value
      })
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Youtube className="w-6 h-6 text-red-500" />
        Smart YouTube Processing
      </h2>

      {/* URL Input Section */}
      <div className="mb-6 p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
        <div className="text-center">
          <Link className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Add YouTube Video
          </h3>
          <p className="text-gray-600 mb-4">
            Paste a YouTube URL to extract transcript and generate intelligent metadata
          </p>
          
          <div className="max-w-md mx-auto">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center ${
                url.trim() && !isValidYouTubeUrl(url.trim()) 
                  ? 'border-red-300' 
                  : 'border-gray-300'
              }`}
            />
            {url.trim() && !isValidYouTubeUrl(url.trim()) && (
              <p className="mt-2 text-sm text-red-600">Please enter a valid YouTube URL</p>
            )}
          </div>

          {/* Step 1: Generate Metadata Button */}
          {url.trim() && isValidYouTubeUrl(url.trim()) && !videoMetadata && (
            <div className="mt-4">
              <button
                onClick={generateMetadata}
                disabled={isGeneratingMetadata}
                className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
              >
                {isGeneratingMetadata ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Metadata...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    🤖 Generate Metadata
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Processing Status */}
      {(isGeneratingMetadata || isUploading) && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <div>
              <p className="font-medium text-blue-900">
                {isGeneratingMetadata ? 'Generating Metadata...' : 'Uploading to Supabase...'}
              </p>
              <p className="text-sm text-blue-700">{processingStep || 'Processing...'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Review & Edit Form */}
      {videoMetadata && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-green-800">📝 Review & Edit YouTube Video Metadata</h3>
            <button
              onClick={generateMetadata}
              disabled={isGeneratingMetadata}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={videoMetadata.title}
                onChange={(e) => updateMetadata('title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author/Speaker</label>
              <input
                type="text"
                value={videoMetadata.author}
                onChange={(e) => updateMetadata('author', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">YouTube Channel</label>
              <input
                type="text"
                value={videoMetadata.youtube_channel}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Genre</label>
              <select
                value={videoMetadata.genre}
                onChange={(e) => updateMetadata('genre', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Educational">Educational</option>
                <option value="Tutorial">Tutorial</option>
                <option value="Documentary">Documentary</option>
                <option value="Interview">Interview</option>
                <option value="Lecture">Lecture</option>
                <option value="Entertainment">Entertainment</option>
                <option value="News">News</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
              <input
                type="text"
                value={videoMetadata.topic}
                onChange={(e) => updateMetadata('topic', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                value={videoMetadata.difficulty}
                onChange={(e) => updateMetadata('difficulty', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
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
                value={videoMetadata.tags}
                onChange={(e) => updateMetadata('tags', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="comma, separated, tags"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
              <textarea
                value={videoMetadata.summary}
                onChange={(e) => updateMetadata('summary', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Chunking Parameters */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <Settings className="w-4 h-4" />
              Chunking Parameters
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-white rounded-lg border grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chunk Size
                  </label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    min="200"
                    max="2000"
                    step="50"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Characters per chunk (200-2000)</p>
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
                    max="300"
                    step="25"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Characters overlap (0-300)</p>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Upload Button */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={uploadToSupabase}
              disabled={isUploading}
              className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  ✅ Upload to Supabase
                </>
              )}
            </button>

            <button
              onClick={resetForm}
              className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Result Display */}
      {result && (
        <div className={`mb-6 p-4 rounded-lg border ${
          result.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${
                result.success ? 'text-green-900' : 'text-red-900'
              }`}>
                {result.message}
              </p>
              
              {result.success && result.metadata && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-white p-3 rounded border">
                      <p className="font-medium text-gray-700">📊 Processing Stats</p>
                      <p className="text-gray-600">
                        • {result.chunksAdded} chunks created<br/>
                        • {result.transcriptLength?.toLocaleString()} characters processed
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <p className="font-medium text-gray-700">🎬 Video Info</p>
                      <p className="text-gray-600">
                        • <strong>Title:</strong> {result.metadata.title}<br/>
                        • <strong>Author:</strong> {result.metadata.author}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <p className="font-medium text-gray-700">🏷️ Generated Tags</p>
                      <p className="text-gray-600">
                        • <strong>Topic:</strong> {result.metadata.topic}<br/>
                        • <strong>Difficulty:</strong> {result.metadata.difficulty}
                      </p>
                    </div>
                  </div>
                  
                  {result.metadata.summary && (
                    <div className="bg-white p-3 rounded border">
                      <p className="font-medium text-gray-700 mb-1">📝 Summary</p>
                      <p className="text-sm text-gray-600">{result.metadata.summary}</p>
                    </div>
                  )}
                  
                  {result.metadata.tags && (
                    <div className="bg-white p-3 rounded border">
                      <p className="font-medium text-gray-700 mb-1">🏷️ Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {result.metadata.tags.split(',').map((tag: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 