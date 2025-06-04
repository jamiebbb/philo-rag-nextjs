'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle, Settings, Youtube } from 'lucide-react'
import { YouTubeMetadata } from '@/types'

export function YouTubeUpload() {
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState<YouTubeMetadata>({
    video_id: '',
    title: '',
    author: '',
    summary: '',
    genre: '',
    topic: '',
    tags: '',
    difficulty: 'Intermediate',
    youtube_channel: '',
    source_url: '',
    source_type: 'youtube_video'
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [chunkSize, setChunkSize] = useState(400)
  const [chunkOverlap, setChunkOverlap] = useState(200)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false)
  const [metadataError, setMetadataError] = useState<string | null>(null)

  const handleGenerateMetadata = async () => {
    if (!url.trim()) return

    setIsGeneratingMetadata(true)
    setMetadataError(null)
    
    try {
      const response = await fetch('/api/generate-youtube-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      })

      const data = await response.json()

      if (response.ok) {
        setMetadata(prev => ({
          ...prev,
          ...data.metadata,
          source_url: url.trim()
        }))
        setMetadataError(null)
      } else {
        setMetadataError(data.error || 'Failed to generate metadata. Please enter manually.')
      }
    } catch (error) {
      console.error('Error generating metadata:', error)
      setMetadataError('Network error. Please check your connection and try again.')
    } finally {
      setIsGeneratingMetadata(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || !metadata.title.trim()) return

    setIsProcessing(true)
    setResult(null)

    try {
      const response = await fetch('/api/youtube/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          ...metadata,
          chunkSize,
          chunkOverlap
        })
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully processed YouTube video: ${data.chunksAdded} chunks added`
        })
        // Reset form
        setUrl('')
        setMetadata({
          video_id: '',
          title: '',
          author: '',
          summary: '',
          genre: '',
          topic: '',
          tags: '',
          difficulty: 'Intermediate',
          youtube_channel: '',
          source_url: '',
          source_type: 'youtube_video'
        })
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
        message: 'Error processing YouTube video'
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Youtube className="w-6 h-6 text-red-500" />
        YouTube Transcript Upload
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* YouTube URL Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            YouTube URL *
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setMetadataError(null)
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="button"
              onClick={handleGenerateMetadata}
              disabled={!url.trim() || isGeneratingMetadata}
              className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGeneratingMetadata ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  🧠 Auto-fill Metadata
                </>
              )}
            </button>
          </div>
          {/* Error Message */}
          {metadataError && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{metadataError}</p>
            </div>
          )}
        </div>

        {/* Metadata Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={metadata.title}
              onChange={(e) => setMetadata(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Author/Creator *
            </label>
            <input
              type="text"
              value={metadata.author}
              onChange={(e) => setMetadata(prev => ({ ...prev, author: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Genre
            </label>
            <select
              value={metadata.genre}
              onChange={(e) => setMetadata(prev => ({ ...prev, genre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Genre</option>
              <option value="Educational">Educational</option>
              <option value="Philosophy">Philosophy</option>
              <option value="Science">Science</option>
              <option value="Technology">Technology</option>
              <option value="Documentary">Documentary</option>
              <option value="Interview">Interview</option>
              <option value="Lecture">Lecture</option>
              <option value="Tutorial">Tutorial</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic/Subject
          </label>
          <input
            type="text"
            value={metadata.topic}
            onChange={(e) => setMetadata(prev => ({ ...prev, topic: e.target.value }))}
            placeholder="e.g., Ethics, AI, Philosophy of Mind"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <input
            type="text"
            value={metadata.tags}
            onChange={(e) => setMetadata(prev => ({ ...prev, tags: e.target.value }))}
            placeholder="e.g., philosophy, ethics, consciousness"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Summary/Description
          </label>
          <textarea
            value={metadata.summary}
            onChange={(e) => setMetadata(prev => ({ ...prev, summary: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief description of the video content..."
          />
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
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chunk Size
                  </label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    min="100"
                    max="2000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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
                    max="500"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isProcessing || !url.trim() || !metadata.title.trim()}
          className="w-full px-4 py-3 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing YouTube Video...
            </>
          ) : (
            <>
              <Youtube className="w-5 h-5" />
              Process YouTube Video
            </>
          )}
        </button>
      </form>

      {/* Result Message */}
      {result && (
        <div className={`mt-6 p-4 rounded-lg flex items-center gap-2 ${
          result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {result.success ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  )
} 