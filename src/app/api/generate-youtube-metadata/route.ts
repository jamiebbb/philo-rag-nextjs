import { NextRequest, NextResponse } from 'next/server'
import { generateChatCompletion } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    const { title, transcriptSample, videoMetadata } = await request.json()

    if (!title || !transcriptSample) {
      return NextResponse.json({ error: 'Title and transcript sample are required' }, { status: 400 })
    }

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
Type: [Content type - should be "Video"]
Author: [The actual author/speaker of the content, not the YouTube channel]
Tags: [tag1, tag2, tag3, etc.]
Difficulty: [Beginner/Intermediate/Advanced/Expert]`

    const userMessage = `Generate metadata for YouTube video titled '${title}' with this transcript sample: ${transcriptSample}`

    const response = await generateChatCompletion([
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ])

    // Parse response
    const metadata: any = {}
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
            case 'type':
              metadata.type = value
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

      // Fallback values if parsing fails
      if (!metadata.summary) metadata.summary = 'Summary extraction failed'
      if (!metadata.genre) metadata.genre = 'Educational'
      if (!metadata.topic) metadata.topic = 'Unknown'
      if (!metadata.type) metadata.type = 'Video'
      if (!metadata.author) metadata.author = 'Unknown'
      if (!metadata.tags) metadata.tags = 'youtube, video'
      if (!metadata.difficulty) metadata.difficulty = 'Intermediate'
      
      // Add video metadata
      metadata.title = title
      metadata.video_id = videoMetadata?.video_id
      metadata.youtube_channel = videoMetadata?.youtube_channel

    } catch (parseError) {
      console.error('Error parsing metadata:', parseError)
      // Return fallback metadata
      return NextResponse.json({
        title,
        summary: 'Summary extraction failed',
        genre: 'Educational',
        topic: 'Unknown',
        type: 'Video',
        author: 'Unknown',
        tags: 'youtube, video',
        difficulty: 'Intermediate',
        video_id: videoMetadata?.video_id,
        youtube_channel: videoMetadata?.youtube_channel
      })
    }

    return NextResponse.json(metadata)

  } catch (error) {
    console.error('Error generating metadata:', error)
    return NextResponse.json(
      { error: 'Failed to generate metadata' },
      { status: 500 }
    )
  }
} 