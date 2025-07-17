import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import { parsePDF, ParserType } from '@/lib/pdf-parsers'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'

// Configure timeout for this route
export const maxDuration = 300 // 5 minutes for large file processing

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Processing chunked upload...')
    
    const supabase = createServerSupabaseClient()
    
    const { sessionId, metadata, processingOptions } = await request.json()

    console.log('📋 Process request:', {
      sessionId,
      metadata: metadata?.title,
      processingOptions
    })

    // Validate inputs
    if (!sessionId || !metadata) {
      return NextResponse.json({ error: 'Session ID and metadata are required' }, { status: 400 })
    }

    // Get upload session
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      console.error('❌ Upload session not found:', sessionError)
      return NextResponse.json({ error: 'Upload session not found' }, { status: 404 })
    }

    // Check if all chunks are uploaded
    if (session.uploaded_chunks.length !== session.total_chunks) {
      return NextResponse.json({ 
        error: 'Upload incomplete', 
        uploaded: session.uploaded_chunks.length,
        total: session.total_chunks
      }, { status: 400 })
    }

    // Update session status to processing
    await supabase
      .from('upload_sessions')
      .update({ status: 'processing' })
      .eq('id', sessionId)

    console.log('📥 Downloading and reassembling chunks...')
    
    // Download and reassemble chunks
    const chunks: Buffer[] = []
    for (let i = 0; i < session.total_chunks; i++) {
      const chunkPath = `chunked-uploads/${sessionId}/chunk-${i}`
      
      const { data: chunkData, error: downloadError } = await supabase.storage
        .from('document-chunks')
        .download(chunkPath)

      if (downloadError || !chunkData) {
        console.error(`❌ Error downloading chunk ${i}:`, downloadError)
        throw new Error(`Failed to download chunk ${i}`)
      }

      const arrayBuffer = await chunkData.arrayBuffer()
      chunks.push(Buffer.from(arrayBuffer))
    }

    // Reassemble file
    const reassembledFile = Buffer.concat(chunks)
    console.log(`✅ File reassembled: ${(reassembledFile.length / 1024 / 1024).toFixed(1)}MB`)

    // Verify file size matches original
    if (reassembledFile.length !== session.total_size) {
      console.error('❌ File size mismatch after reassembly')
      throw new Error('File size mismatch after reassembly')
    }

    // Parse PDF using existing pipeline
    console.log('🔍 Parsing reassembled PDF...')
    const pdfResult = await parsePDF(reassembledFile, {
      parser: (processingOptions?.pdfParser as ParserType) || 'pdf-parse',
      fallbackToMock: process.env.NODE_ENV === 'development'
    })

    const text = pdfResult.text
    if (!text || text.trim().length === 0) {
      throw new Error('No text could be extracted from the reassembled PDF')
    }

    console.log(`📝 Extracted ${text.length} characters from reassembled PDF`)

    // Split text into chunks for vector storage
    console.log('✂️ Splitting text into chunks...')
    const splitterType = processingOptions?.splitterType || 'recursive'
    const chunkSize = processingOptions?.chunkSize || 5000
    const chunkOverlap = processingOptions?.chunkOverlap || 500

    let textSplitter
    if (splitterType === 'recursive') {
      textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
      })
    } else {
      textSplitter = new CharacterTextSplitter({
        chunkSize,
        chunkOverlap,
      })
    }

    const textChunks = await textSplitter.splitText(text)
    console.log(`✅ Created ${textChunks.length} text chunks`)

    // Generate document ID
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`

    // Process text chunks and store in database
    console.log('🔮 Generating embeddings and storing chunks...')
    const BATCH_SIZE = 5
    let totalChunksStored = 0

    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batchChunks = textChunks.slice(i, i + BATCH_SIZE)
      const batchPromises = batchChunks.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex
        try {
          const contextEnhancedText = `
Company/Source: ${metadata.title || 'Unknown'}
Author/Speaker: ${metadata.author || 'Unknown'}
Topic: ${metadata.topic || 'General'}
Content: ${chunk}
          `.trim()
          
          const embedding = await generateEmbedding(contextEnhancedText)

          const { error: chunkError } = await supabase
            .from('documents_enhanced')
            .insert({
              content: chunk,
              metadata: {
                ...metadata,
                chunk_index: chunkIndex,
                total_chunks: textChunks.length,
                filename: session.filename,
                parser_used: pdfResult.parserUsed,
                parse_time: pdfResult.parseTime,
                pdf_metadata: pdfResult.metadata,
                chunked_upload: true,
                upload_session_id: sessionId
              },
              embedding: embedding,
              title: metadata.title,
              author: metadata.author || null,
              doc_type: metadata.doc_type || 'Book',
              genre: metadata.genre || null,
              topic: metadata.topic || null,
              difficulty: metadata.difficulty || null,
              tags: metadata.tags || null,
              source_type: 'pdf_chunked_upload',
              summary: metadata.description || null,
              chunk_id: chunkIndex + 1,
              total_chunks: textChunks.length,
              source: session.filename || 'Unknown'
            })

          if (chunkError) {
            console.error(`❌ Error storing text chunk ${chunkIndex}:`, chunkError)
            return false
          }
          return true
        } catch (error) {
          console.error(`❌ Error processing text chunk ${chunkIndex}:`, error)
          return false
        }
      })

      const batchResults = await Promise.all(batchPromises)
      totalChunksStored += batchResults.filter(Boolean).length
    }

    // Store main document record
    await supabase
      .from('documents_enhanced')
      .insert({
        id: documentId,
        title: metadata.title,
        author: metadata.author || null,
        doc_type: metadata.doc_type || 'Book',
        genre: metadata.genre || 'Educational',
        content: `Document: ${metadata.title} - ${textChunks.length} chunks (chunked upload)`,
        metadata: {
          ...metadata,
          is_parent_document: true,
          chunk_count: textChunks.length,
          processing_time: pdfResult.parseTime,
          text_length: text.length,
          chunked_upload: true,
          upload_session_id: sessionId,
          original_file_size: session.total_size
        },
        source_type: 'pdf_chunked_upload',
        summary: metadata.summary || '',
        chunk_id: 0,
        total_chunks: textChunks.length,
        source: `${metadata.title} (Chunked Upload)`
      })

    // Clean up chunks from storage
    console.log('🧹 Cleaning up temporary chunks...')
    for (let i = 0; i < session.total_chunks; i++) {
      const chunkPath = `chunked-uploads/${sessionId}/chunk-${i}`
      await supabase.storage
        .from('document-chunks')
        .remove([chunkPath])
    }

    // Update session status to completed
    await supabase
      .from('upload_sessions')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    console.log('🎉 Chunked upload processing completed!')

    return NextResponse.json({
      success: true,
      documentId,
      chunksStored: totalChunksStored,
      totalTextChunks: textChunks.length,
      originalFileSize: session.total_size,
      textLength: text.length,
      message: `Successfully processed ${session.filename} with ${totalChunksStored} chunks stored`
    })

  } catch (error) {
    console.error('❌ Error processing chunked upload:', error)
    
    // Update session status to failed
    if (request.body) {
      try {
        const { sessionId } = await request.json()
        if (sessionId) {
          const supabase = createServerSupabaseClient()
          await supabase
            .from('upload_sessions')
            .update({ status: 'failed' })
            .eq('id', sessionId)
        }
      } catch (updateError) {
        console.error('❌ Error updating failed session:', updateError)
      }
    }

    return NextResponse.json(
      { error: 'Processing failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 