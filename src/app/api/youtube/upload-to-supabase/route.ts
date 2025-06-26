import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import { addDocumentRecord } from '@/lib/document-tracker'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { Document } from 'langchain/document'

/**
 * Step 2 of YouTube processing workflow:
 * 1. Take reviewed metadata and cleaned transcript
 * 2. Split transcript into chunks using SEMANTIC-AWARE splitter
 * 3. Generate embeddings for each chunk
 * 4. Store in Supabase vector database
 * 5. Add to document tracker
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting YouTube upload to Supabase...')
    
    // Get server-side Supabase client
    const supabase = createServerSupabaseClient()
    
    const { 
      videoMetadata,
      cleanedTranscript,
      chunkSize = 2000,  // SMALLER chunks for better precision
      chunkOverlap = 400  // Higher overlap to preserve context
    } = await request.json()

    if (!videoMetadata || !cleanedTranscript) {
      return NextResponse.json({ error: 'Video metadata and cleaned transcript are required' }, { status: 400 })
    }

    console.log('📊 Processing video:', videoMetadata.title)
    console.log('📝 Transcript length:', cleanedTranscript.length)
    console.log('✂️ Chunk settings:', { chunkSize, chunkOverlap })

    // Create SEMANTIC-AWARE text splitter for better factual preservation
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      // Semantic separators - prioritize keeping related info together
      separators: [
        '\n\n',           // Paragraph breaks (highest priority)
        '\n',             // Line breaks
        '. ',             // Sentence endings
        ', ',             // Clause separators
        ' ',              // Word boundaries
        ''                // Character level (last resort)
      ]
    })

    // Split transcript into semantically-aware chunks
    console.log('✂️ Splitting transcript with SEMANTIC-AWARE splitter...')
    const chunks = await textSplitter.splitText(cleanedTranscript)
    console.log('✂️ Created', chunks.length, 'chunks (semantic preservation)')

    // Log chunk analysis for debugging
    console.log('📊 Chunk size analysis:')
    console.log('  Average length:', Math.round(chunks.reduce((a, b) => a + b.length, 0) / chunks.length))
    console.log('  Min length:', Math.min(...chunks.map(c => c.length)))
    console.log('  Max length:', Math.max(...chunks.map(c => c.length)))

    // Create Document objects with enhanced metadata
    const documents = chunks.map((chunk, index) => {
      const chunkMetadata = {
        ...videoMetadata,
        source_type: 'youtube_video',
        chunk_id: index + 1,
        total_chunks: chunks.length,
        source: videoMetadata.source_url,
        // Add semantic context hints
        chunk_length: chunk.length,
        contains_numbers: /\d+/.test(chunk),
        contains_names: /[A-Z][a-z]+ [A-Z][a-z]+/.test(chunk),
        contains_leadership_terms: /(ceo|cto|cfo|president|director|leader|executive|team|board)/i.test(chunk)
      }

      return new Document({
        pageContent: chunk,
        metadata: chunkMetadata
      })
    })

    // Generate embeddings and add to vector store
    console.log('🔮 Generating embeddings and storing in Supabase vector database...')
    const docIds: string[] = []
    
    for (const doc of documents) {
      try {
        // Generate CONTEXT-ENHANCED embedding that includes both content AND key metadata
        // This allows queries like "General Motors senior leadership" to find chunks where:
        // - "General Motors" is in metadata (title/company)
        // - "senior leadership" is in content
        const contextEnhancedText = `
Company/Source: ${doc.metadata.title || 'Unknown'}
Author/Speaker: ${doc.metadata.author || 'Unknown'}
Topic: ${doc.metadata.topic || 'General'}
Content: ${doc.pageContent}
        `.trim()
        
        console.log(`🔮 Generating context-enhanced embedding for chunk ${doc.metadata.chunk_id}...`)
        console.log(`📊 Context preview: ${contextEnhancedText.substring(0, 150)}...`)
        
        const embedding = await generateEmbedding(contextEnhancedText)
        
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
            summary: doc.metadata.summary,
            chunk_id: doc.metadata.chunk_id,
            total_chunks: doc.metadata.total_chunks,
            source: doc.metadata.source
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

    // Add to document tracker
    const trackerId = await addDocumentRecord({
      title: videoMetadata.title,
      author: videoMetadata.author,
      summary: videoMetadata.summary,
      type: 'Video',
      genre: videoMetadata.genre,
      topic: videoMetadata.topic,
      difficulty: videoMetadata.difficulty,
      source_type: 'youtube_video',
      tags: videoMetadata.tags,
      chunks: docIds.length,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      video_id: videoMetadata.video_id,
      source_url: videoMetadata.source_url
    })

    console.log('🎉 YouTube upload to Supabase completed successfully!')

    return NextResponse.json({
      success: true,
      videoId: videoMetadata.video_id,
      title: videoMetadata.title,
      author: videoMetadata.author,
      chunksAdded: docIds.length,
      trackerId,
      chunkAnalysis: {
        avgLength: Math.round(chunks.reduce((a, b) => a + b.length, 0) / chunks.length),
        minLength: Math.min(...chunks.map(c => c.length)),
        maxLength: Math.max(...chunks.map(c => c.length)),
        totalChunks: chunks.length,
        improvementsApplied: ['semantic-aware splitting', 'smaller chunks', 'higher overlap', 'context preservation']
      },
      supabaseUpload: {
        documentsStored: docIds.length,
        vectorDatabase: 'documents_enhanced',
        status: 'completed'
      }
    })

  } catch (error) {
    console.error('❌ Error uploading YouTube video to Supabase:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 