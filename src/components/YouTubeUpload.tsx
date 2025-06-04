'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle, Settings, Youtube, Eye } from 'lucide-react'

export function YouTubeUpload() {
  const [url, setUrl] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [chunkSize, setChunkSize] = useState(400)
  const [chunkOverlap, setChunkOverlap] = useState(200)
  const [result, setResult] = useState<{ 
    success: boolean; 
    message: string; 
    metadata?: any;
    transcriptLength?: number;
    chunksAdded?: number;
  } | null>(null)
  const [processingStep, setProcessingStep] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsProcessing(true)
    setResult(null)
    setProcessingStep('Initializing...')

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
          message: `Successfully processed YouTube video!`,
          metadata: data.metadata,
          transcriptLength: data.transcriptLength,
          chunksAdded: data.chunksAdded
        })
        // Reset form
        setUrl('')
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
    setResult(null)
    setProcessingStep('')
  }

  const isValidYouTubeUrl = (url: string) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/
    return youtubeRegex.test(url)
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Youtube className="w-6 h-6 text-red-500" />
        Smart YouTube Processing
      </h2>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
          <span>🤖</span>
          Intelligent Processing Workflow
        </h3>
        <div className="text-sm text-blue-800 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Extracts actual video title and channel information
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Downloads transcript using SUPADATA API
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Automatically generates metadata from transcript content
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Extracts speaker/author information intelligently
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Creates optimized chunks for vector search
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* YouTube URL Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            YouTube URL *
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              url.trim() && !isValidYouTubeUrl(url.trim()) 
                ? 'border-red-300' 
                : 'border-gray-300'
            }`}
            required
          />
          {url.trim() && !isValidYouTubeUrl(url.trim()) && (
            <p className="mt-1 text-sm text-red-600">Please enter a valid YouTube URL</p>
          )}
        </div>

        {/* Advanced Settings */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <Settings className="w-4 h-4" />
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
                  min="100"
                  max="4000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Characters per chunk (100-4000)</p>
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

        {/* Processing Status */}
        {isProcessing && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <div>
                <p className="font-medium text-blue-900">Processing YouTube Video...</p>
                <p className="text-sm text-blue-700">{processingStep}</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-blue-600">
              This may take 30-60 seconds depending on video length...
            </div>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className={`p-4 rounded-lg border ${
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

        {/* Submit Button */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!url.trim() || !isValidYouTubeUrl(url.trim()) || isProcessing}
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Process Video
              </>
            )}
          </button>

          {(result || url.trim()) && (
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Reset
            </button>
          )}
        </div>
      </form>

      {/* Help Text */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-2">💡 How it works:</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>1. <strong>Paste any YouTube URL</strong> - We&apos;ll automatically extract the video ID</p>
          <p>2. <strong>Smart metadata extraction</strong> - AI analyzes the transcript to determine author, topic, difficulty, and generate summary</p>
          <p>3. <strong>Intelligent chunking</strong> - Content is split optimally for semantic search</p>
          <p>4. <strong>Vector storage</strong> - Chunks are embedded and stored for RAG chat interface</p>
        </div>
      </div>
    </div>
  )
} 