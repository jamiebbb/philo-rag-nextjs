'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle, Settings, Youtube, Eye, Link, Sparkles } from 'lucide-react'

interface VideoMetadata {
  title: string
  author: string
  summary: string
  genre: string
  topic: string
  tags: string
  difficulty: string
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
  const [isProcessing, setIsProcessing] = useState(false)
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

  const fetchVideoInfo = async () => {
    if (!url.trim() || !isValidYouTubeUrl(url.trim())) return

    try {
      setProcessingStep('Fetching video information...')
      const videoId = extractVideoId(url.trim())
      
      // Fetch from YouTube oEmbed API for basic info
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`)
      
      if (response.ok) {
        const data = await response.json()
        setVideoMetadata({
          title: data.title || `YouTube Video ${videoId}`,
          author: data.author_name || 'Unknown Channel',
          summary: '',
          genre: '',
          topic: '',
          tags: '',
          difficulty: ''
        })
      }
    } catch (error) {
      console.error('Error fetching video info:', error)
      // Still allow processing even if preview fails
      const videoId = extractVideoId(url.trim())
      setVideoMetadata({
        title: `YouTube Video ${videoId}`,
        author: 'Unknown Channel',
        summary: '',
        genre: '',
        topic: '',
        tags: '',
        difficulty: ''
      })
    } finally {
      setProcessingStep('')
    }
  }

  const processVideo = async () => {
    if (!url.trim() || !isValidYouTubeUrl(url.trim())) return

    setIsProcessing(true)
    setResult(null)
    setProcessingStep('Initializing video processing...')

    try {
      const response = await fetch('/api/youtube/process-improved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          chunkSize,
          chunkOverlap
        })
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully processed and uploaded to Supabase vector database!`,
          metadata: data.metadata,
          transcriptLength: data.transcriptLength,
          chunksAdded: data.chunksAdded,
          videoId: data.videoId
        })
        // Keep the URL for potential reprocessing but show success
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to process YouTube video'
        })
      }
    } catch (error) {
      console.error('Error processing YouTube video:', error)
      setResult({
        success: false,
        message: 'Error processing YouTube video. Please check your connection and try again.'
      })
    } finally {
      setIsProcessing(false)
      setProcessingStep('')
    }
  }

  const resetForm = () => {
    setUrl('')
    setVideoMetadata(null)
    setResult(null)
    setProcessingStep('')
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
            Paste a YouTube URL to automatically extract transcript and generate intelligent metadata
          </p>
          
          <div className="max-w-md mx-auto">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={fetchVideoInfo}
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
        </div>

        {/* Video Preview Card */}
        {url.trim() && isValidYouTubeUrl(url.trim()) && (
          <div className="mt-4 max-w-md mx-auto">
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-3">
                <Youtube className="w-6 h-6 text-red-500" />
                <div>
                  <p className="font-medium text-gray-900">
                    {videoMetadata?.title || 'YouTube Video'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {videoMetadata?.author || 'Fetching channel info...'}
                  </p>
                </div>
              </div>
              <Sparkles className="w-5 h-5 text-red-500" />
            </div>
          </div>
        )}
      </div>

      {/* Video Metadata Display */}
      {videoMetadata && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-4">Video Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <div className="px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900">
                {videoMetadata.title}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel/Author
              </label>
              <div className="px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900">
                {videoMetadata.author}
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Processing & Auto-Upload Workflow
            </h4>
            <div className="text-sm text-blue-800 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Downloads transcript using SUPADATA API
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Corrects grammar and structures transcript with GPT-4o-mini
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                AI analyzes content to extract topic, difficulty, and summary
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Generates optimized chunks for semantic search
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <strong>Automatically uploads to Supabase vector database</strong>
              </div>
            </div>
            <div className="mt-2 p-2 bg-green-100 rounded text-xs text-green-800">
              ✨ <strong>One-click processing:</strong> Video is automatically processed and uploaded to your vector database for RAG chat!
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <Settings className="w-4 h-4" />
              Advanced Chunking Settings
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
                    min="100"
                    max="5000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Characters per chunk (100-5000)</p>
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
                  <p className="text-xs text-gray-500 mt-1">Characters overlap between chunks (0-1000)</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing Status */}
      {isProcessing && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <div>
              <p className="font-medium text-blue-900">Processing & Uploading to Supabase...</p>
              <p className="text-sm text-blue-700">{processingStep || 'Extracting transcript and generating embeddings...'}</p>
            </div>
          </div>
          <div className="mt-3 text-xs text-blue-600">
            This may take 30-60 seconds depending on video length. The video will be automatically uploaded to your vector database.
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
                  <div className="p-3 bg-green-100 rounded border border-green-300 mb-3">
                    <p className="font-medium text-green-800 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      ✅ Successfully uploaded to Supabase vector database
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Video content is now available for RAG chat queries. You can find it in your Documents Manager.
                    </p>
                  </div>
                  
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
                      <p className="font-medium text-gray-700 mb-1">📝 Auto-Generated Summary</p>
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

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={processVideo}
          disabled={!url.trim() || !isValidYouTubeUrl(url.trim()) || isProcessing}
          className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing & Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              🚀 Process & Upload to Supabase
            </>
          )}
        </button>

        {(result || url.trim()) && (
          <button
            onClick={resetForm}
            className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
} 