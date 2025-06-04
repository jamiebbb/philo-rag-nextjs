import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import { Document } from 'langchain/document'
import { v4 as uuidv4 } from 'uuid'

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

    // Convert chunks to LangChain Document objects (like Streamlit does)
    console.log('🔄 Converting chunks to LangChain Documents...')
    const documents: Document[] = chunks.map((chunk: any, index: number) => {
      if (!chunk.content || typeof chunk.content !== 'string') {
        throw new Error(`Invalid chunk at index ${index}: content must be a string`)
      }
      
      return new Document({
        pageContent: chunk.content,
        metadata: {
          ...metadata,
          chunk_index: index,
          chunk_length: chunk.content.length,
          source_type: 'pdf',
          type: metadata.doc_type || 'Book',
          source: `${metadata.title} (PDF)`
        }
      })
    })

    console.log(`✅ Created ${documents.length} LangChain Document objects`)

    // Generate embeddings for all documents in batch (like Streamlit)
    console.log('🔮 Generating embeddings in batch...')
    const texts = documents.map(doc => doc.pageContent)
    const embeddings: number[][] = []
    
    // Process in smaller batches to avoid API limits
    const BATCH_SIZE = 10
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      console.log(`🔮 Processing embedding batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(texts.length/BATCH_SIZE)}`)
      
      for (const text of batch) {
        const embedding = await generateEmbedding(text)
        embeddings.push(embedding)
      }
    }

    console.log(`✅ Generated ${embeddings.length} embeddings`)

    // Generate document ID for this upload batch
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`
    let totalChunksStored = 0

    // Insert documents following Streamlit pattern
    console.log('💾 Inserting documents into Supabase...')
    
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const embedding = embeddings[i]
      
      // Generate unique chunk ID
      const chunkId = `${documentId}_chunk_${i}`
      
      // Prepare data exactly like Streamlit does
      const insertData = {
        id: chunkId,
        content: doc.pageContent,
        metadata: doc.metadata,
        embedding: embedding,
        // Dedicated columns (following Streamlit schema)
        title: metadata.title,
        author: metadata.author || null,
        doc_type: metadata.doc_type || 'Book',
        genre: metadata.genre || 'Educational',
        topic: metadata.topic || null,
        difficulty: metadata.difficulty || 'Intermediate',
        tags: metadata.tags || '',
        source_type: 'pdf',
        summary: metadata.summary || '',
        chunk_id: i + 1,
        total_chunks: documents.length,
        source: `${metadata.title} (PDF)`
      }

      try {
        console.log(`💾 Inserting chunk ${i + 1}/${documents.length}...`)
        
        const { data: insertResult, error: insertError } = await supabase
          .from('documents_enhanced')
          .insert(insertData)
          .select('id')

        if (insertError) {
          console.error(`❌ Error inserting chunk ${i}:`, insertError)
          console.error('Insert data keys:', Object.keys(insertData))
          throw insertError
        }

        if (insertResult && insertResult.length > 0) {
          console.log(`✅ Successfully inserted chunk ${i + 1} with ID: ${insertResult[0].id}`)
          totalChunksStored++
        } else {
          console.warn(`⚠️ No data returned for chunk ${i}`)
        }

        // Show progress for large uploads
        if (documents.length > 20 && (i + 1) % 10 === 0) {
          console.log(`📊 Progress: ${i + 1}/${documents.length} chunks processed`)
        }

      } catch (error) {
        console.error(`❌ Failed to insert chunk ${i}:`, error)
        console.error(`❌ Chunk content preview:`, doc.pageContent.substring(0, 200))
        // Continue with next chunk instead of failing completely
      }
    }

    // Also insert a main document record (like Streamlit)
    console.log('💾 Inserting main document record...')
    try {
      const { error: docError } = await supabase
        .from('documents_enhanced')
        .insert({
          id: documentId,
          title: metadata.title,
          author: metadata.author || null,
          doc_type: metadata.doc_type || 'Book',
          genre: metadata.genre || 'Educational',
          content: `Document: ${metadata.title} - ${documents.length} chunks`,
          metadata: {
            ...metadata,
            is_parent_document: true,
            chunk_count: documents.length,
            processing_time: processingInfo?.processingTime,
            text_length: processingInfo?.textLength,
            client_side_processed: true
          },
          source_type: 'pdf',
          summary: metadata.summary || '',
          chunk_id: 0, // Parent document
          total_chunks: documents.length,
          source: `${metadata.title} (PDF)`
        })

      if (docError) {
        console.error('❌ Error storing main document record:', docError)
      } else {
        console.log('✅ Successfully stored main document record')
      }
    } catch (error) {
      console.error('❌ Failed to store main document record:', error)
    }

    console.log(`🎉 Upload completed: ${totalChunksStored} chunks stored successfully`)

    return NextResponse.json({
      success: true,
      documentsCount: 1,
      chunksCount: totalChunksStored,
      documentId,
      message: `Successfully processed ${totalChunksStored} chunks`,
      processingInfo: {
        totalChunks: documents.length,
        chunksStored: totalChunksStored,
        skippedChunks: documents.length - totalChunksStored,
        embeddings: embeddings.length
      }
    })

  } catch (error) {
    console.error('❌ Error in upload processed chunks API:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      },
      { status: 500 }
    )
  }
}