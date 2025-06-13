import { NextRequest, NextResponse } from 'next/server'
import { generateChatCompletion } from '@/lib/openai'
import { 
  extractVideoId, 
  getYouTubeMetadata, 
  getYouTubeTranscript, 
  cleanYouTubeTranscript
} from '@/lib/youtube'
import { isDuplicateUrl } from '@/lib/document-tracker'

/**
 * Step 1 of YouTube processing workflow:
 * 1. Extract video ID from URL
 * 2. Check for duplicates
 * 3. Get video metadata from YouTube
 * 4. Get transcript using SUPADATA API
 * 5. Clean transcript with GPT-4o-mini
 * 6. Generate enhanced metadata with GPT-4o-mini
 * 7. Return metadata and cleaned transcript for user review
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🎬 Starting YouTube metadata generation...')
    
    const { url, videoId } = await request.json()

    if (!url || !videoId) {
      return NextResponse.json({ error: 'YouTube URL and video ID are required' }, { status: 400 })
    }

    console.log('📹 Processing YouTube URL:', url)
    console.log('🆔 Video ID:', videoId)

    // Check for duplicates
    const { isDuplicate, existingRecord } = await isDuplicateUrl(url, videoId)
    if (isDuplicate) {
      return NextResponse.json({ 
        error: 'Duplicate video detected',
        existingRecord 
      }, { status: 409 })
    }

    // Get actual video metadata (title, channel)
    console.log('📊 Fetching video metadata...')
    const videoMetadata = await getYouTubeMetadata(videoId)
    console.log('📊 Video metadata:', videoMetadata)

    // Get transcript using SUPADATA API
    console.log('📝 Fetching transcript using SUPADATA API...')
    const rawTranscript = await getYouTubeTranscript(videoId)
    if (!rawTranscript) {
      return NextResponse.json({ 
        error: 'Could not retrieve transcript for this video. It may not have captions available or the video may be private.' 
      }, { status: 400 })
    }

    console.log('📝 Raw transcript length:', rawTranscript.length)

    // Clean and format transcript
    console.log('🧹 Cleaning transcript with GPT-4o-mini...')
    const cleanedTranscript = await cleanYouTubeTranscript(rawTranscript)
    console.log('🧹 Cleaned transcript length:', cleanedTranscript.length)

    // Generate comprehensive metadata from cleaned transcript and title
    console.log('🤖 Generating metadata from cleaned transcript...')
    const generatedMetadata = await generateMetadataFromTranscript(
      videoMetadata.title || `YouTube Video ${videoId}`, 
      cleanedTranscript,
      videoMetadata.youtube_channel || 'Unknown Channel',
      videoId,
      url
    )

    console.log('🤖 Generated metadata:', generatedMetadata)

    console.log('✅ YouTube metadata generation completed successfully!')

    return NextResponse.json({
      success: true,
      metadata: generatedMetadata,
      cleanedTranscript: cleanedTranscript,
      videoMetadata: videoMetadata
    })

  } catch (error) {
    console.error('❌ Error generating YouTube metadata:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Generate comprehensive metadata from video title, transcript, and channel
 * Following the exact Streamlit format
 */
async function generateMetadataFromTranscript(
  title: string, 
  transcript: string, 
  channel: string,
  videoId: string,
  url: string
): Promise<{
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
}> {
  try {
    const systemMessage = `You are a metadata expert who creates high-quality content summaries and tags for YouTube videos.
Follow these instructions carefully:
1. Create a concise summary using clear, concise language with active voice
2. Identify the genre/topic and content type
3. Extract the ACTUAL AUTHOR/SPEAKER NAME from the video title (look for names in the title like "Jordan Peterson", "Sam Harris", etc.) - if no clear author name is in the title, use the YouTube channel name
4. Assign a difficulty rating (Beginner, Intermediate, Advanced, Expert) based on complexity and target audience
5. Generate relevant tags that would be useful in a chatbot context

Format your response exactly as follows:
Summary: [Your summary here]
Genre: [Genre]
Topic: [Topic]
Type: [Content type - should be "Video"]
Author: [Extract author name from title if possible, otherwise use "${channel}"]
Tags: [tag1, tag2, tag3, etc.]
Difficulty: [Beginner/Intermediate/Advanced/Expert]`

    const userPrompt = `Generate metadata for YouTube video:
TITLE: "${title}"
CHANNEL: "${channel}"
TRANSCRIPT: ${transcript}

Instructions:
- Use the FULL transcript provided for analysis (not just a sample)
- Extract the actual speaker/author name from the title if clearly identifiable
- Generate comprehensive metadata based on the complete content`

    const response = await generateChatCompletion([
      { role: 'system', content: systemMessage },
      { role: 'user', content: userPrompt }
    ], 'gpt-4o-mini')

    console.log('🤖 Raw metadata response:', response)

    // Parse the response
    const metadata = {
      title: title,
      author: channel,
      summary: 'Summary not available',
      genre: 'Educational',
      topic: 'Unknown',
      tags: 'youtube, video',
      difficulty: 'Intermediate',
      youtube_channel: channel,
      video_id: videoId,
      source_url: url,
      source_type: 'youtube_video'
    }

    const lines = response.split('\n')
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':')
        const value = valueParts.join(':').trim()
        const cleanKey = key.toLowerCase().trim()
        
        switch (cleanKey) {
          case 'title':
            if (value) metadata.title = value
            break
          case 'author':
            if (value) metadata.author = value
            break
          case 'summary':
            if (value) metadata.summary = value
            break
          case 'genre':
            if (value) metadata.genre = value
            break
          case 'topic':
            if (value) metadata.topic = value
            break
          case 'tags':
            if (value) metadata.tags = value
            break
          case 'difficulty':
            if (value) metadata.difficulty = value
            break
        }
      }
    }

    console.log('🤖 Parsed metadata:', metadata)
    return metadata

  } catch (error) {
    console.error('Error generating metadata from transcript:', error)
    
    // Return fallback metadata
    return {
      title: title,
      author: channel,
      summary: 'Summary not available',
      genre: 'Educational',
      topic: 'Unknown',
      tags: 'youtube, video',
      difficulty: 'Intermediate',
      youtube_channel: channel,
      video_id: videoId,
      source_url: url,
      source_type: 'youtube_video'
    }
  }
} 