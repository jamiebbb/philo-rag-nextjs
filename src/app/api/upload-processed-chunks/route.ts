import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Upload processed chunks API called')
    
    // Get server-side Supabase client
    const supabase = createServerSupabaseClient()
    
    const { 
      chunks, 
      metadata, 
      processingInfo 
    } = await request.json()

    console.log('📊 Received data:', {
      chunksCount: chunks?.length,
      metadata: metadata?.title,
      processingTime: processingInfo?.processingTime,
      firstChunkSample: chunks?.[0]?.content?.substring(0, 100)
    })

    console.log('🔍 Validating chunks...')
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      console.error('❌ No chunks provided')
      return NextResponse.json({ error: 'No chunks provided' }, { status: 400 })
    }

    console.log('🔍 Validating metadata...')
    if (!metadata || !metadata.title) {
      console.error('❌ Invalid metadata provided')
      return NextResponse.json({ error: 'Valid metadata with title is required' }, { status: 400 })
    }

    // Validate chunk size (should be reasonable)
    const totalChunkSize = chunks.reduce((sum: number, chunk: any) => sum + (chunk.content?.length || 0), 0)
    const MAX_TOTAL_CHUNK_SIZE = 10 * 1024 * 1024 // 10MB of text chunks
    
    if (totalChunkSize > MAX_TOTAL_CHUNK_SIZE) {
      console.error(`❌ Total chunk size too large: ${(totalChunkSize / 1024 / 1024).toFixed(1)}MB`)
      return NextResponse.json({ 
        error: `Total chunk size is too large (${(totalChunkSize / 1024 / 1024).toFixed(1)}MB). Maximum allowed is 10MB.` 
      }, { status: 413 })
    }

    let totalChunksStored = 0
    let documentsCount = 0

    // Generate document ID
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`

    // Store document metadata
    console.log(`💾 Storing document metadata for ${metadata.title}...`)
    const { error: docError } = await supabase
      .from('documents_enhanced')
      .insert({
        id: documentId,
        title: metadata.title,
        author: metadata.author || null,
        doc_type: metadata.doc_type || null,
        genre: metadata.genre || null,
        content: processingInfo?.extractedText?.substring(0, 1000) || 'Preview not available', // First 1000 chars as preview
        metadata: {
          ...metadata,
          chunk_count: chunks.length,
          processing_time: processingInfo?.processingTime,
          text_length: processingInfo?.textLength,
          client_side_processed: true
        }
      })

    if (docError) {
      console.error('❌ Error storing document metadata:', docError)
      return NextResponse.json({ error: 'Failed to store document metadata' }, { status: 500 })
    }

    documentsCount = 1

    // Process and store chunks with embeddings
    console.log(`🔮 Generating embeddings for ${chunks.length} chunks...`)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      console.log(`📊 Processing chunk ${i + 1}/${chunks.length} - Content length: ${chunk?.content?.length || 'N/A'}`)
      console.log(`📊 Chunk structure:`, Object.keys(chunk || {}))
      
      if (!chunk.content || typeof chunk.content !== 'string') {
        console.warn(`⚠️ Skipping invalid chunk ${i}: content type = ${typeof chunk.content}, content = ${JSON.stringify(chunk).substring(0, 200)}`)
        continue
      }

      if (chunk.content.trim().length === 0) {
        console.warn(`⚠️ Skipping empty chunk ${i}`)
        continue
      }

      try {
        console.log(`🔮 Generating embedding for chunk ${i}...`)
        // Generate embedding for the chunk
        const embedding = await generateEmbedding(chunk.content)
        console.log(`✅ Embedding generated for chunk ${i} - Vector length: ${embedding?.length}`)

        console.log(`💾 Storing chunk ${i} in Supabase...`)
        // Store chunk with embedding
        const { data: insertData, error: chunkError } = await supabase
          .from('documents_enhanced')
          .insert({
            id: `${documentId}_chunk_${i}`,
            title: metadata.title,
            author: metadata.author || null,
            doc_type: metadata.doc_type || null,
            genre: metadata.genre || null,
            content: chunk.content,
            metadata: {
              ...metadata,
              chunk_index: i,
              chunk_length: chunk.content.length, // Use content.length instead of chunk.length
              parent_document: documentId,
              client_side_processed: true
            },
            embedding: embedding
          })
          .select('id')

        if (chunkError) {
          console.error(`❌ Error storing chunk ${i}:`, chunkError)
          console.error(`❌ Chunk data:`, {
            id: `${documentId}_chunk_${i}`,
            title: metadata.title,
            contentLength: chunk.content.length,
            embeddingLength: embedding?.length
          })
        } else {
          console.log(`✅ Successfully stored chunk ${i} with ID: ${insertData?.[0]?.id}`)
          totalChunksStored++
        }

        // Show progress for large uploads
        if (chunks.length > 50 && (i + 1) % 25 === 0) {
          console.log(`📊 Processed ${i + 1}/${chunks.length} chunks`)
        }

      } catch (embeddingError) {
        console.error(`❌ Error processing chunk ${i}:`, embeddingError)
        console.error(`❌ Chunk content preview:`, chunk.content?.substring(0, 200))
        // Continue with next chunk instead of stopping
      }
    }

    console.log(`🎉 Upload completed: ${documentsCount} documents, ${totalChunksStored} chunks`)

    return NextResponse.json({
      success: true,
      documentsCount,
      chunksCount: totalChunksStored,
      documentId,
      message: `Successfully processed ${documentsCount} documents with ${totalChunksStored} chunks`,
      processingInfo: {
        totalChunks: chunks.length,
        chunksStored: totalChunksStored,
        skippedChunks: chunks.length - totalChunksStored
      }
    })

  } catch (error) {
    console.error('❌ Error in upload processed chunks API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}