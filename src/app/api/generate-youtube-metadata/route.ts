import { NextRequest, NextResponse } from 'next/server'
import { generateChatCompletion } from '@/lib/openai'
import { YoutubeTranscript } from 'youtube-transcript'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

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
    } catch (error) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
    }

    try {
      // Fetch transcript
      const transcript = await YoutubeTranscript.fetchTranscript(videoId)
      
      if (!transcript || transcript.length === 0) {
        return NextResponse.json({ error: 'No transcript available for this video' }, { status: 400 })
      }

      // Combine transcript text and get a sample
      const fullTranscript = transcript.map(item => item.text).join(' ')
      const transcriptSample = fullTranscript.substring(0, 2000) // First 2000 characters

      // Try to get video title from the URL or use a default
      const title = `YouTube Video ${videoId}`

      const systemMessage = `You are a metadata expert who creates high-quality content summaries and tags for YouTube videos.
Follow these instructions carefully:
1. Create a concise summary using clear, concise language with active voice
2. Identify the genre/topic and content type
3. Identify the ACTUAL AUTHOR of the content (not the YouTube channel) from the title and content
4. Assign a difficulty rating (Beginner, Intermediate, Advanced, Expert) based on complexity and target audience
5. Generate relevant tags that would be useful in a chatbot context

Format your response exactly as follows:
Summary: [Your summary here]
Genre: [Genre]
Topic: [Topic]
Author: [The actual author/speaker of the content]
Tags: [tag1, tag2, tag3, etc.]
Difficulty: [Beginner/Intermediate/Advanced/Expert]`

      const userMessage = `Generate metadata for this YouTube video transcript sample: ${transcriptSample}`

      const response = await generateChatCompletion([
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ])

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
        if (!metadata.summary) metadata.summary = 'Summary extracted from YouTube video transcript'
        if (!metadata.genre) metadata.genre = 'Educational'
        if (!metadata.topic) metadata.topic = 'Unknown'
        if (!metadata.author) metadata.author = 'Unknown'
        if (!metadata.tags) metadata.tags = 'youtube, video, education'
        if (!metadata.difficulty) metadata.difficulty = 'Intermediate'

      } catch (parseError) {
        console.error('Error parsing metadata:', parseError)
        // Set fallback metadata
        metadata.summary = 'Summary extracted from YouTube video transcript'
        metadata.genre = 'Educational'
        metadata.topic = 'Unknown'
        metadata.author = 'Unknown'
        metadata.tags = 'youtube, video, education'
        metadata.difficulty = 'Intermediate'
      }

      return NextResponse.json({ metadata })

    } catch (transcriptError) {
      console.error('Error fetching transcript:', transcriptError)
      return NextResponse.json({ 
        error: 'Could not fetch transcript for this video. It may not have captions available.' 
      }, { status: 400 })
    }

  } catch (error) {
    console.error('Error generating YouTube metadata:', error)
    return NextResponse.json(
      { error: 'Failed to generate metadata' },
      { status: 500 }
    )
  }
} 