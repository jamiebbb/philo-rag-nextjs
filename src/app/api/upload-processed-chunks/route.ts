import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'

// This route handles pre-processed chunks from client-side PDF processing
// Perfect for large files that exceed Vercel's 4MB FormData limit
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Upload processed chunks API called')
    
    const supabase = createServerSupabaseClient()
    const body = await request.json()
    
    const { 
      chunks, 
      metadata, 
      processingStats 
    } = body

    console.log('📊 Processed chunks upload request:', {
      chunkCount: chunks?.length,
      totalTextLength: processingStats?.totalTextLength,
      processingTime: processingStats?.processingTime,
      fileNames: processingStats?.fileNames
    })

    // Validate required data
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json({ error: 'No chunks provided' }, { status: 400 })
    }

    if (!metadata || !metadata.title) {
      return NextResponse.json({ error: 'Metadata with title is required' }, { status: 400 })
    }

    // Generate unique document ID
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`
    const timestamp = new Date().toISOString()

    console.log(`📝 Processing ${chunks.length} chunks for upload...`)

    // Process chunks in batches to avoid overwhelming the system
    const BATCH_SIZE = 10
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE)
      
      const batchPromises = batchChunks.map(async (chunk: any, batchIndex: number) => {
        const chunkIndex = i + batchIndex
        
        try {
          // Create context-enhanced text for better embeddings
          const contextEnhancedText = `
Company/Source: ${metadata.title || 'Unknown'}
Author/Speaker: ${metadata.author || 'Unknown'}
Topic: ${metadata.topic || 'General'}
Document Type: ${metadata.doc_type || 'Book'}
Content: ${chunk.content}
          `.trim()
          
          console.log(`🔄 Generating embedding for chunk ${chunkIndex + 1}/${chunks.length}`)
          const embedding = await generateEmbedding(contextEnhancedText)

          const chunkData = {
            content: chunk.content,
            metadata: {
              ...metadata,
              chunk_index: chunkIndex,
              total_chunks: chunks.length,
              filename: chunk.fileName || processingStats?.fileNames?.[0],
              client_side_processed: true,
              processing_stats: processingStats,
              upload_timestamp: timestamp,
              document_id: documentId
            },
            embedding: embedding,
            title: metadata.title,
            author: metadata.author || null,
            doc_type: metadata.doc_type || 'Book',
            genre: metadata.genre || null,
            topic: metadata.topic || null,
            difficulty: metadata.difficulty || null,
            tags: metadata.tags || null,
            source_type: 'client_processed_pdf',
            summary: metadata.description || metadata.summary || null,
            chunk_id: chunkIndex + 1,
            total_chunks: chunks.length,
            source: chunk.fileName || processingStats?.fileNames?.[0] || 'Client Upload'
          }

          const { error: insertError } = await supabase
            .from('documents_enhanced')
            .insert(chunkData)

          if (insertError) {
            console.error(`❌ Error storing chunk ${chunkIndex}:`, insertError)
            return { success: false, error: insertError }
          }

          console.log(`✅ Successfully stored chunk ${chunkIndex + 1}/${chunks.length}`)
          return { success: true }
          
        } catch (error) {
          console.error(`❌ Error processing chunk ${chunkIndex}:`, error)
          return { success: false, error }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      
      // Count results
      batchResults.forEach(result => {
        if (result.success) {
          successCount++
        } else {
          errorCount++
        }
      })

      console.log(`📊 Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${batchResults.filter(r => r.success).length}/${batchResults.length} chunks stored`)
    }

    // Store document metadata record
    try {
      const documentMetadata = {
        id: documentId,
        title: metadata.title,
        author: metadata.author || null,
        doc_type: metadata.doc_type || 'Book',
        genre: metadata.genre || 'Educational',
        content: `Client-processed document: ${metadata.title} - ${chunks.length} chunks`,
        metadata: {
          ...metadata,
          is_parent_document: true,
          chunk_count: chunks.length,
          processing_stats: processingStats,
          upload_method: 'client_side_chunks',
          upload_timestamp: timestamp,
          document_id: documentId,
          success_count: successCount,
          error_count: errorCount
        },
        source_type: 'client_processed_pdf',
        summary: metadata.description || metadata.summary || `Document processed client-side with ${chunks.length} chunks`,
        chunk_id: 0, // Parent document marker
        total_chunks: chunks.length,
        source: processingStats?.fileNames?.join(', ') || 'Client Upload'
      }

      const { error: docError } = await supabase
        .from('documents_enhanced')
        .insert(documentMetadata)

      if (docError) {
        console.error('❌ Error storing document metadata:', docError)
      } else {
        console.log('✅ Document metadata stored successfully')
      }
    } catch (metadataError) {
      console.error('❌ Error creating document metadata:', metadataError)
    }

    console.log(`🎉 Upload completed: ${successCount} chunks successful, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${successCount} chunks`,
      documentsCount: 1,
      chunksCount: successCount,
      errorCount,
      documentId,
      processingStats: {
        ...processingStats,
        uploadTime: Date.now(),
        successRate: (successCount / chunks.length) * 100
      }
    })

  } catch (error) {
    console.error('❌ Error in upload processed chunks API:', error)
    return NextResponse.json(
      { 
        error: 'Failed to upload processed chunks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}