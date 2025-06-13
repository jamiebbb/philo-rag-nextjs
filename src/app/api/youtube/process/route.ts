import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding, generateChatCompletion } from '@/lib/openai'
import { 
  extractVideoId, 
  getYouTubeMetadata, 
  getYouTubeTranscript, 
  cleanYouTubeTranscript,
  generateYouTubeMetadata 
} from '@/lib/youtube'
import { addDocumentRecord, isDuplicateUrl } from '@/lib/document-tracker'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { Document } from 'langchain/document'

export async function POST(request: NextRequest) {
  try {
    // Get server-side Supabase client
    const supabase = createServerSupabaseClient()
    
    const { 
      url, 
      title, 
      author, 
      summary, 
      genre, 
      topic, 
      tags, 
      difficulty,
      chunkSize = 400,
      chunkOverlap = 200
    } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 })
    }

    // Extract video ID
    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
    }

    // Check for duplicates
    const { isDuplicate, existingRecord } = await isDuplicateUrl(url, videoId)
    if (isDuplicate) {
      return NextResponse.json({ 
        error: 'Duplicate video detected',
        existingRecord 
      }, { status: 409 })
    }

    // Get video metadata
    const videoMetadata = await getYouTubeMetadata(videoId)

    // Get transcript
    const transcript = await getYouTubeTranscript(videoId)
    if (!transcript) {
      return NextResponse.json({ 
        error: 'Could not retrieve transcript for this video. It may not have captions available.' 
      }, { status: 400 })
    }

    // Clean transcript
    const cleanedTranscript = await cleanYouTubeTranscript(transcript)

    // Create text splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      lengthFunction: (text: string) => text.length,
    })

    // Create metadata for the video
    const documentMetadata = {
      title,
      author,
      type: 'Video',
      genre,
      topic,
      tags,
      difficulty,
      summary,
      source_type: 'youtube_video',
      video_id: videoId,
      youtube_url: url,
      youtube_channel: videoMetadata.youtube_channel || 'Unknown Channel'
    }

    // Split transcript into chunks
    const chunks = await textSplitter.splitText(cleanedTranscript)

    // Create Document objects with enhanced metadata
    const documents = chunks.map((chunk, index) => {
      const chunkMetadata = {
        ...documentMetadata,
        chunk_id: index + 1,
        total_chunks: chunks.length,
        source: url
      }

      return new Document({
        pageContent: chunk,
        metadata: chunkMetadata
      })
    })

    // Generate embeddings and add to vector store
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
            doc_type: doc.metadata.type,
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

    // Add to document tracker
    const trackerId = await addDocumentRecord({
      title,
      author,
      summary,
      type: 'Video',
      genre,
      topic,
      difficulty,
      source_type: 'youtube_video',
      tags,
      chunks: docIds.length,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      video_id: videoId,
      source_url: url
    })

    return NextResponse.json({
      success: true,
      videoId,
      title,
      chunksAdded: docIds.length,
      trackerId,
      metadata: documentMetadata
    })

  } catch (error) {
    console.error('Error processing YouTube video:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 