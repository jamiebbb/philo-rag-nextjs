import { NextRequest, NextResponse } from 'next/server'
import { generateChatCompletion } from '@/lib/openai'
import { YoutubeTranscript } from 'youtube-transcript'

// Function to get video title from YouTube
async function getVideoTitle(videoId: string): Promise<string> {
  try {
    // Use YouTube oEmbed API to get video title
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    if (response.ok) {
      const data = await response.json()
      return data.title || `YouTube Video ${videoId}`
    }
  } catch (error) {
    console.log('Could not fetch video title from oEmbed, using fallback')
  }
  return `YouTube Video ${videoId}`
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    console.log('YouTube metadata generation request for URL:', url)

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 })
    }

    // Extract video ID from URL
    let videoId = ''
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes('youtube.com')) {
        videoId = urlObj.searchParams.get('v') || ''
      } else if (urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1)
      }
      
      if (!videoId) {
        throw new Error('Could not extract video ID from URL')
      }
      console.log('Extracted video ID:', videoId)
    } catch (error) {
      console.error('Error extracting video ID:', error)
      return NextResponse.json({ error: 'Invalid YouTube URL. Please use format: https://www.youtube.com/watch?v=VIDEO_ID' }, { status: 400 })
    }

    try {
      console.log('Attempting to fetch transcript for video ID:', videoId)
      // Fetch transcript
      const transcript = await YoutubeTranscript.fetchTranscript(videoId)
      console.log('Transcript fetched successfully, length:', transcript?.length || 0)
      
      if (!transcript || transcript.length === 0) {
        return NextResponse.json({ 
          error: 'No transcript available for this video. The video may not have captions or subtitles enabled.' 
        }, { status: 400 })
      }

      // Get actual video title
      console.log('Fetching video title...')
      const title = await getVideoTitle(videoId)
      console.log('Video title:', title)

      // Combine transcript text and get a sample
      const fullTranscript = transcript.map(item => item.text).join(' ')
      const transcriptSample = fullTranscript.substring(0, 2000) // First 2000 characters
      console.log('Transcript sample length:', transcriptSample.length)

      const systemMessage = `You are a metadata expert who creates high-quality content summaries and tags for YouTube videos.

Based on the video title and transcript provided, generate appropriate metadata.

Format your response exactly as follows:
Summary: [Your summary here]
Genre: [Genre: Educational, Philosophy, Science, Technology, etc.]
Topic: [Specific topic or subject matter]
Author: [The actual author/speaker of the content, or channel name if unclear]
Tags: [tag1, tag2, tag3, etc.]
Difficulty: [Beginner/Intermediate/Advanced/Expert]

Be intelligent about inferring information from the title and content.`

      const userMessage = `Generate metadata for this YouTube video:
Title: "${title}"
Transcript sample: ${transcriptSample}`

      console.log('Sending request to OpenAI...')
      const response = await generateChatCompletion([
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ])
      console.log('OpenAI response received, length:', response.length)

      // Parse response
      const metadata: any = {
        video_id: videoId,
        title: title,
        source_url: url,
        source_type: 'youtube_video',
        youtube_channel: 'Unknown Channel'
      }

      try {
        const lines = response.split('\n')
        console.log('Parsing', lines.length, 'lines from OpenAI response')
        
        for (const line of lines) {
          if (line.includes(':')) {
            const [key, ...valueParts] = line.split(':')
            const value = valueParts.join(':').trim()
            const cleanKey = key.toLowerCase().trim()
            
            switch (cleanKey) {
              case 'summary':
                metadata.summary = value
                break
              case 'genre':
                metadata.genre = value
                break
              case 'topic':
                metadata.topic = value
                break
              case 'author':
                metadata.author = value
                break
              case 'tags':
                metadata.tags = value
                break
              case 'difficulty':
                metadata.difficulty = value
                break
            }
          }
        }

        // Set fallback values if parsing fails
        if (!metadata.summary) metadata.summary = `Summary of ${title}`
        if (!metadata.genre) metadata.genre = 'Educational'
        if (!metadata.topic) metadata.topic = 'Video Content'
        if (!metadata.author) metadata.author = 'YouTube Creator'
        if (!metadata.tags) metadata.tags = 'youtube, video, education'
        if (!metadata.difficulty) metadata.difficulty = 'Intermediate'

        console.log('Metadata generated successfully:', Object.keys(metadata))

      } catch (parseError) {
        console.error('Error parsing metadata:', parseError)
        // Set fallback metadata
        metadata.summary = `Summary of ${title}`
        metadata.genre = 'Educational'
        metadata.topic = 'Video Content'
        metadata.author = 'YouTube Creator'
        metadata.tags = 'youtube, video, education'
        metadata.difficulty = 'Intermediate'
      }

      return NextResponse.json({ metadata })

    } catch (transcriptError) {
      console.error('Error fetching transcript:', transcriptError)
      
      // Provide more specific error messages
      let errorMessage = 'Could not fetch transcript for this video.'
      
      if (transcriptError instanceof Error) {
        if (transcriptError.message?.includes('Transcript is disabled')) {
          errorMessage = 'Transcript is disabled for this video.'
        } else if (transcriptError.message?.includes('Video unavailable')) {
          errorMessage = 'Video is unavailable or private.'
        } else if (transcriptError.message?.includes('No transcript found')) {
          errorMessage = 'No transcript/captions found for this video. The video may not have subtitles enabled.'
        }
      }
      
      return NextResponse.json({ 
        error: errorMessage + ' Please try a different video or enter metadata manually.'
      }, { status: 400 })
    }

  } catch (error) {
    console.error('Error generating YouTube metadata:', error)
    return NextResponse.json(
      { error: 'Failed to generate metadata: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 