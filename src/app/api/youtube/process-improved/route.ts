import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'
import { 
  extractVideoId, 
  getYouTubeMetadata, 
  getYouTubeTranscript, 
  cleanYouTubeTranscript
} from '@/lib/youtube'
import { addDocumentRecord, isDuplicateUrl } from '@/lib/document-tracker'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { Document } from 'langchain/document'

/**
 * Improved YouTube processing workflow:
 * 1. Extract video ID from URL
 * 2. Get actual video title and channel from YouTube
 * 3. Get transcript using SUPADATA API
 * 4. Generate comprehensive metadata from transcript + title
 * 5. Process and store in vector database
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🎬 Starting improved YouTube processing...')
    
    // Get server-side Supabase client
    const supabase = createServerSupabaseClient()
    
    const { 
      url,
      chunkSize = 400,
      chunkOverlap = 200
    } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 })
    }

    console.log('📹 Processing YouTube URL:', url)

    // Step 1: Extract video ID
    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
    }

    console.log('🆔 Extracted video ID:', videoId)

    // Step 2: Check for duplicates
    const { isDuplicate, existingRecord } = await isDuplicateUrl(url, videoId)
    if (isDuplicate) {
      return NextResponse.json({ 
        error: 'Duplicate video detected',
        existingRecord 
      }, { status: 409 })
    }

    // Step 3: Get actual video metadata (title, channel)
    console.log('📊 Fetching video metadata...')
    const videoMetadata = await getYouTubeMetadata(videoId)
    console.log('📊 Video metadata:', videoMetadata)

    // Step 4: Get transcript using SUPADATA API
    console.log('📝 Fetching transcript using SUPADATA API...')
    const rawTranscript = await getYouTubeTranscript(videoId)
    if (!rawTranscript) {
      return NextResponse.json({ 
        error: 'Could not retrieve transcript for this video. It may not have captions available or the video may be private.' 
      }, { status: 400 })
    }

    console.log('📝 Raw transcript length:', rawTranscript.length)

    // Step 5: Clean and format transcript
    console.log('🧹 Cleaning transcript...')
    const cleanedTranscript = await cleanYouTubeTranscript(rawTranscript)
    console.log('🧹 Cleaned transcript length:', cleanedTranscript.length)

    // Step 6: Correct grammar and structure transcript with GPT-4o-mini
    console.log('📝 Correcting grammar and structuring transcript with GPT-4o-mini...')
    const correctedTranscript = await correctTranscriptGrammar(cleanedTranscript)
    console.log('📝 Corrected transcript length:', correctedTranscript.length)

    // Step 7: Generate comprehensive metadata from corrected transcript and title
    console.log('🤖 Generating metadata from corrected transcript...')
    const generatedMetadata = await generateMetadataFromTranscript(
      videoMetadata.title || `YouTube Video ${videoId}`, 
      correctedTranscript,
      videoMetadata.youtube_channel || 'Unknown Channel'
    )

    console.log('🤖 Generated metadata:', generatedMetadata)

    // Step 8: Create text splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      lengthFunction: (text: string) => text.length,
    })

    // Step 9: Split corrected transcript into chunks
    console.log('✂️ Splitting corrected transcript into chunks...')
    const chunks = await textSplitter.splitText(correctedTranscript)
    console.log('✂️ Created', chunks.length, 'chunks')

    // Step 10: Create Document objects with enhanced metadata
    const documents = chunks.map((chunk, index) => {
      const chunkMetadata = {
        ...generatedMetadata,
        source_type: 'youtube_video',
        video_id: videoId,
        youtube_url: url,
        youtube_channel: videoMetadata.youtube_channel || 'Unknown Channel',
        chunk_id: index + 1,
        total_chunks: chunks.length,
        source: url
      }

      return new Document({
        pageContent: chunk,
        metadata: chunkMetadata
      })
    })

    // Step 11: Generate embeddings and add to vector store
    console.log('🔮 Generating embeddings and storing in Supabase vector database...')
    const docIds: string[] = []
    
    for (const doc of documents) {
      try {
        // Generate embedding
        const embedding = await generateEmbedding(doc.pageContent)
        
        // Insert into enhanced documents table
        const { data, error } = await supabase
          .from('documents_enhanced')
          .insert({
            content: doc.pageContent,
            metadata: doc.metadata,
            embedding,
            title: doc.metadata.title,
            author: doc.metadata.author,
            doc_type: 'Video',
            genre: doc.metadata.genre,
            topic: doc.metadata.topic,
            difficulty: doc.metadata.difficulty,
            tags: doc.metadata.tags,
            source_type: doc.metadata.source_type,
            summary: doc.metadata.summary
          })
          .select('id')
          .single()

        if (error) {
          console.error('Error inserting document chunk:', error)
          continue
        }

        if (data?.id) {
          docIds.push(data.id)
        }
      } catch (error) {
        console.error('Error processing chunk:', error)
        continue
      }
    }

    if (docIds.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to add any chunks to vector store' 
      }, { status: 500 })
    }

    console.log('✅ Successfully stored', docIds.length, 'chunks')

    // Step 12: Add to document tracker
    const trackerId = await addDocumentRecord({
      title: generatedMetadata.title,
      author: generatedMetadata.author,
      summary: generatedMetadata.summary,
      type: 'Video',
      genre: generatedMetadata.genre,
      topic: generatedMetadata.topic,
      difficulty: generatedMetadata.difficulty,
      source_type: 'youtube_video',
      tags: generatedMetadata.tags,
      chunks: docIds.length,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      video_id: videoId,
      source_url: url
    })

    console.log('🎉 YouTube processing completed successfully!')

    return NextResponse.json({
      success: true,
      videoId,
      title: generatedMetadata.title,
      author: generatedMetadata.author,
      chunksAdded: docIds.length,
      trackerId,
      metadata: generatedMetadata,
      transcriptLength: correctedTranscript.length,
      supabaseUpload: {
        documentsStored: docIds.length,
        vectorDatabase: 'documents_enhanced',
        status: 'completed'
      }
    })

  } catch (error) {
    console.error('❌ Error processing YouTube video:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Generate comprehensive metadata from video title, transcript, and channel
 */
async function generateMetadataFromTranscript(
  title: string, 
  transcript: string, 
  channel: string
): Promise<{
  title: string
  author: string
  summary: string
  genre: string
  topic: string
  tags: string
  difficulty: string
}> {
  try {
    const systemPrompt = `You are an expert content analyst who creates comprehensive metadata for YouTube videos based on their title, transcript, and channel information.

Your task is to analyze the provided content and generate accurate, descriptive metadata.

Guidelines:
- Extract the speaker/author from the title or transcript content (look for "I am", "My name is", speakers mentioned, etc.)
- If no specific speaker is found, use the channel name as the author
- Create a concise but informative summary (2-3 sentences)
- Determine appropriate genre (Educational, Entertainment, Technology, Philosophy, Science, etc.)
- Identify the main topic/subject matter
- Generate relevant tags (comma-separated)
- Assess difficulty level based on content complexity

Format your response EXACTLY as follows:
Title: [Video title - cleaned and properly formatted]
Author: [Speaker name or channel name]
Summary: [2-3 sentence summary of the video content]
Genre: [Primary genre]
Topic: [Main topic/subject]
Tags: [comma-separated relevant tags]
Difficulty: [Beginner, Intermediate, Advanced, or Expert]`

    const userPrompt = `Analyze this YouTube video:

TITLE: ${title}
CHANNEL: ${channel}

TRANSCRIPT SAMPLE (first 2000 characters):
${transcript.substring(0, 2000)}

Generate comprehensive metadata for this video.`

    const response = await generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    console.log('🤖 Raw metadata response:', response)

    // Parse the response
    const metadata = {
      title: title,
      author: channel,
      summary: 'Summary not available',
      genre: 'Educational',
      topic: 'Unknown',
      tags: 'youtube, video',
      difficulty: 'Intermediate'
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
      difficulty: 'Intermediate'
    }
  }
}

/**
 * Correct transcript grammar and structure using GPT-4o-mini
 */
async function correctTranscriptGrammar(transcript: string): Promise<string> {
  try {
    console.log('📝 Starting grammar correction with GPT-4o-mini...')
    
    // If transcript is very long, process in chunks
    const MAX_CHUNK_SIZE = 8000 // Safe size for GPT-4o-mini input
    
    if (transcript.length <= MAX_CHUNK_SIZE) {
      // Process the entire transcript at once
      return await correctTranscriptChunk(transcript)
    } else {
      // Split into chunks and process each
      const chunks = []
      for (let i = 0; i < transcript.length; i += MAX_CHUNK_SIZE) {
        chunks.push(transcript.slice(i, i + MAX_CHUNK_SIZE))
      }
      
      console.log(`📝 Processing ${chunks.length} chunks for grammar correction...`)
      
      const correctedChunks = []
      for (let i = 0; i < chunks.length; i++) {
        console.log(`📝 Correcting chunk ${i + 1}/${chunks.length}...`)
        const correctedChunk = await correctTranscriptChunk(chunks[i])
        correctedChunks.push(correctedChunk)
      }
      
      return correctedChunks.join('\n\n')
    }

  } catch (error) {
    console.error('❌ Error correcting transcript grammar:', error)
    // Return original transcript if correction fails
    return transcript
  }
}

/**
 * Correct a single chunk of transcript
 */
async function correctTranscriptChunk(transcriptChunk: string): Promise<string> {
  const systemPrompt = `You are an expert in grammar corrections and textual structuring.

Correct the classification of the provided text, adding commas, periods, question marks and other symbols necessary for natural and consistent reading. Do not change any words, just adjust the punctuation according to the grammatical rules and context.

Organize your content using markdown, structuring it with titles, subtitles, lists or other protected elements to clearly highlight the topics and information captured. Leave it in English and remember to always maintain the original formatting.

Textual organization should always be a priority according to the content of the text, as well as the appropriate title, which must make sense.`

  const userPrompt = `Please correct the grammar and structure the following transcript:

${transcriptChunk}`

  // Use the existing generateChatCompletion function with GPT-4o-mini
  const correctedText = await generateChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 'gpt-4o-mini', 4000) // Increased max_tokens for longer responses

  return correctedText || transcriptChunk
} 