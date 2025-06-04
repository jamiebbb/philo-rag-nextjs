import axios from 'axios'
import { YouTubeVideoInfo, YouTubeMetadata } from '@/types'
import { generateChatCompletion } from '@/lib/openai'

const SUPADATA_API_URL = "https://api.supadata.ai"
const SUPADATA_TRANSCRIPT_ENDPOINT = "/v1/youtube/transcript"
const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY || ""

/**
 * Extract video ID from a YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:v=|\/)([0-9A-Za-z_-]{11}).*/,  // Standard YouTube URLs
    /(?:embed\/)([0-9A-Za-z_-]{11})/,  // Embedded URLs
    /(?:youtu\.be\/)([0-9A-Za-z_-]{11})/  // Shortened youtu.be URLs
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return match[1]
    }
  }
  return null
}

/**
 * Get video metadata from YouTube by scraping the page
 */
export async function getYouTubeMetadata(videoId: string): Promise<Partial<YouTubeVideoInfo>> {
  try {
    const metadata = {
      video_id: videoId,
      title: `YouTube Video ${videoId}`,
      youtube_channel: "Unknown Channel"
    }
    
    // Fetch the video page to extract title and channel info
    const url = `https://www.youtube.com/watch?v=${videoId}`
    const response = await fetch(url)
    
    if (response.ok) {
      const htmlContent = await response.text()
      
      // Extract title
      const titleMatch = htmlContent.match(/<meta name="title" content="([^"]+)"/)
      if (titleMatch) {
        metadata.title = titleMatch[1]
      }
      
      // Extract channel name
      const channelMatch = htmlContent.match(/<link itemprop="name" content="([^"]+)"/) ||
                          htmlContent.match(/"author":"([^"]+)"/)
      if (channelMatch) {
        metadata.youtube_channel = channelMatch[1]
      }
    }
    
    return metadata
  } catch (error) {
    console.error('Error fetching video metadata:', error)
    return {
      video_id: videoId,
      title: `YouTube Video ${videoId}`,
      youtube_channel: "Unknown Channel"
    }
  }
}

/**
 * Get transcript using Supadata API
 */
export async function getYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    console.log('SUPADATA_API_KEY available:', !!SUPADATA_API_KEY)
    console.log('SUPADATA_API_KEY length:', SUPADATA_API_KEY?.length || 0)
    
    if (!SUPADATA_API_KEY) {
      console.error('SUPADATA_API_KEY is not configured')
      return null
    }
    
    const apiUrl = `${SUPADATA_API_URL}${SUPADATA_TRANSCRIPT_ENDPOINT}`
    console.log('Making request to:', apiUrl)
    console.log('Video ID:', videoId)
    
    const response = await axios.get(apiUrl, {
      params: { videoId },
      headers: { 'X-API-Key': SUPADATA_API_KEY }
    })
    
    console.log('SUPADATA API response status:', response.status)
    console.log('SUPADATA API response data:', response.data)
    
    if (response.status === 200 && response.data?.content) {
      const transcript = response.data.content
        .map((segment: any) => segment.text || '')
        .join(' ')
      console.log('Transcript extracted, length:', transcript.length)
      return transcript
    }
    
    console.log('No content found in response or bad status')
    return null
  } catch (error: any) {
    console.error('Error getting transcript:', error)
    console.error('Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    })
    return null
  }
}

/**
 * Clean and format transcript using GPT-4o-mini with the exact Streamlit prompt
 */
export async function cleanYouTubeTranscript(transcript: string): Promise<string> {
  try {
    console.log('🧹 Starting transcript cleaning with GPT-4o-mini...')
    console.log('📊 Original transcript length:', transcript.length)
    
    const systemPrompt = `You are an expert in grammar corrections and textual structuring.

Correct the classification of the provided text, adding commas, periods, question marks and other symbols necessary for natural and consistent reading. Do not change any words, just adjust the punctuation according to the grammatical rules and context.

Organize your content using markdown, structuring it with titles, subtitles, lists or other protected elements to clearly highlight the topics and information captured. Leave it in English and remember to always maintain the original formatting.

Textual organization should always be a priority according to the content of the text, as well as the appropriate title, which must make sense.`

    // Limit transcript length to fit GPT-4o-mini token limits
    const MAX_CHUNK_SIZE = 12000 // Characters, safe for GPT-4o-mini
    
    if (transcript.length <= MAX_CHUNK_SIZE) {
      // Process entire transcript at once
      console.log('🧹 Processing transcript in single chunk...')
      
      const response = await generateChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is a YouTube transcript that needs cleaning and formatting:\n\n${transcript}` }
      ], 'gpt-4o-mini')

      console.log('✅ Transcript cleaned successfully')
      console.log('📊 Cleaned transcript length:', response.length)
      return response

    } else {
      // Split into chunks and process each
      console.log(`🧹 Transcript too long (${transcript.length} chars), splitting into chunks...`)
      
      const chunks = []
      for (let i = 0; i < transcript.length; i += MAX_CHUNK_SIZE) {
        chunks.push(transcript.slice(i, i + MAX_CHUNK_SIZE))
      }
      
      console.log(`🧹 Processing ${chunks.length} chunks...`)
      
      const cleanedChunks = []
      for (let i = 0; i < chunks.length; i++) {
        console.log(`🧹 Cleaning chunk ${i + 1}/${chunks.length}...`)
        
        const response = await generateChatCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is a YouTube transcript chunk that needs cleaning and formatting:\n\n${chunks[i]}` }
        ], 'gpt-4o-mini')
        
        cleanedChunks.push(response)
      }
      
      const finalCleaned = cleanedChunks.join('\n\n')
      console.log('✅ All chunks cleaned and combined')
      console.log('📊 Final cleaned transcript length:', finalCleaned.length)
      return finalCleaned
    }

  } catch (error) {
    console.error('❌ Error cleaning transcript with GPT-4o-mini:', error)
    console.log('⚠️ Returning original transcript due to error')
    return transcript // Return original if cleaning fails
  }
}

/**
 * Generate enhanced metadata for YouTube video
 */
export async function generateYouTubeMetadata(
  title: string, 
  transcriptSample: string, 
  videoMetadata: Partial<YouTubeVideoInfo>
): Promise<YouTubeMetadata> {
  try {
    const response = await fetch('/api/generate-youtube-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        transcriptSample: transcriptSample.substring(0, 1500),
        videoMetadata
      })
    })

    if (response.ok) {
      const data = await response.json()
      return {
        video_id: videoMetadata.video_id!,
        title: data.title || title,
        author: data.author || 'Unknown',
        summary: data.summary || 'Summary not available',
        genre: data.genre || 'Educational',
        topic: data.topic || 'Unknown',
        tags: data.tags || 'youtube, video',
        difficulty: data.difficulty || 'Intermediate',
        youtube_channel: videoMetadata.youtube_channel || 'Unknown Channel',
        source_url: `https://www.youtube.com/watch?v=${videoMetadata.video_id}`,
        source_type: 'youtube_video'
      }
    }
    
    // Fallback metadata
    return {
      video_id: videoMetadata.video_id!,
      title,
      author: 'Unknown',
      summary: 'Summary not available',
      genre: 'Educational',
      topic: 'Unknown',
      tags: 'youtube, video',
      difficulty: 'Intermediate',
      youtube_channel: videoMetadata.youtube_channel || 'Unknown Channel',
      source_url: `https://www.youtube.com/watch?v=${videoMetadata.video_id}`,
      source_type: 'youtube_video'
    }
  } catch (error) {
    console.error('Error generating metadata:', error)
    // Return fallback metadata
    return {
      video_id: videoMetadata.video_id!,
      title,
      author: 'Unknown',
      summary: 'Summary not available',
      genre: 'Educational',
      topic: 'Unknown',
      tags: 'youtube, video',
      difficulty: 'Intermediate',
      youtube_channel: videoMetadata.youtube_channel || 'Unknown Channel',
      source_url: `https://www.youtube.com/watch?v=${videoMetadata.video_id}`,
      source_type: 'youtube_video'
    }
  }
}

/**
 * Validate YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  const videoId = extractVideoId(url)
  return videoId !== null && videoId.length === 11
} 