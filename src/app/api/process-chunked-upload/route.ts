import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'
import { parsePDF, ParserType } from '@/lib/pdf-parsers'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Process chunked upload API called')
    
    const supabase = createServerSupabaseClient()
    const { 
      sessionId, 
      metadata,
      chunkSize = 5000,
      chunkOverlap = 500,
      splitterType = 'recursive'
    } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    // Get upload session details
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Upload session not found' }, { status: 404 })
    }

    if (session.status !== 'complete') {
      return NextResponse.json({ error: 'Upload session not complete' }, { status: 400 })
    }

    console.log(`📄 Processing chunked upload: ${session.filename} (${session.total_chunks} chunks)`)

    // Download and reassemble chunks
    const chunks: ArrayBuffer[] = []
    
    // Download chunks in order
    for (let i = 0; i < session.total_chunks; i++) {
      const chunkPath = `chunks/${sessionId}/chunk_${i.toString().padStart(4, '0')}`
      
      console.log(`📥 Downloading chunk ${i}: ${chunkPath}`)
      
      const { data: chunkData, error: downloadError } = await supabase.storage
        .from('document_chunks')
        .download(chunkPath)
      
      if (downloadError || !chunkData) {
        throw new Error(`Failed to download chunk ${i}: ${downloadError?.message}`)
      }
      
      chunks.push(await chunkData.arrayBuffer())
    }

    // Reassemble file
    console.log('🔧 Reassembling file from chunks...')
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const reassembledFile = new Uint8Array(totalSize)
    
    let offset = 0
    for (const chunk of chunks) {
      reassembledFile.set(new Uint8Array(chunk), offset)
      offset += chunk.byteLength
    }

    // Convert to Buffer for PDF processing
    const buffer = Buffer.from(reassembledFile)
    console.log(`✅ File reassembled: ${buffer.length} bytes`)

    // Verify file size matches original
    if (buffer.length !== session.file_size) {
      throw new Error(`File size mismatch: expected ${session.file_size}, got ${buffer.length}`)
    }

    // Process PDF using existing pipeline
    console.log('🔍 Parsing reassembled PDF...')
    const pdfResult = await parsePDF(buffer, {
      parser: 'pdf-parse' as ParserType,
      fallbackToMock: process.env.NODE_ENV === 'development'
    })

    const text = pdfResult.text
    console.log(`📝 Extracted ${text.length} characters`)

    if (!text || text.trim().length === 0) {
      throw new Error('No text extracted from reassembled PDF')
    }

    // Initialize text splitter
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

    // Split text into chunks
    console.log('✂️ Splitting text into chunks...')
    const textChunks = await textSplitter.splitText(text)
    console.log(`✅ Created ${textChunks.length} text chunks`)

    // Generate document ID
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`
    
    // Process chunks in optimized batches for better performance
    const BATCH_SIZE = 20
    let totalStoredChunks = 0

    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batchChunks = textChunks.slice(i, i + BATCH_SIZE)
      const batchPromises = batchChunks.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex
        try {
          // Create context-enhanced text for better embeddings
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
                processing_method: 'chunked_upload',
                upload_session_id: sessionId,
                file_size: session.file_size,
                parser_used: pdfResult.parserUsed,
                parse_time: pdfResult.parseTime
              },
              embedding: embedding,
              title: metadata.title,
              author: metadata.author || null,
              doc_type: metadata.doc_type || 'Book',
              genre: metadata.genre || null,
              topic: metadata.topic || null,
              difficulty: metadata.difficulty || null,
              tags: metadata.tags || null,
              source_type: 'chunked_pdf_upload',
              summary: metadata.description || null,
              chunk_id: chunkIndex + 1,
              total_chunks: textChunks.length,
              source: session.filename
            })

          if (chunkError) {
            console.error(`❌ Error storing chunk ${chunkIndex}:`, chunkError)
            return false
          }
          return true
        } catch (error) {
          console.error(`❌ Error processing chunk ${chunkIndex}:`, error)
          return false
        }
      })

      const batchResults = await Promise.all(batchPromises)
      totalStoredChunks += batchResults.filter(Boolean).length
    }

    // Store main document record
    try {
      const { error: docError } = await supabase
        .from('documents_enhanced')
        .insert({
          id: documentId,
          title: metadata.title,
          author: metadata.author || null,
          doc_type: metadata.doc_type || 'Book',
          genre: metadata.genre || 'Educational',
          content: `Document: ${metadata.title} - ${textChunks.length} chunks`,
          metadata: {
            ...metadata,
            is_parent_document: true,
            chunk_count: textChunks.length,
            processing_method: 'chunked_upload',
            upload_session_id: sessionId,
            file_size: session.file_size,
            original_filename: session.filename
          },
          source_type: 'chunked_pdf',
          summary: metadata.description || '',
          chunk_id: 0,
          total_chunks: textChunks.length,
          source: `${metadata.title} (Chunked Upload)`
        })

      if (docError) {
        console.error('❌ Error storing main document record:', docError)
      }
    } catch (error) {
      console.error('❌ Failed to store main document record:', error)
    }

    // Clean up chunks from storage
    console.log('🧹 Cleaning up temporary chunks...')
    try {
      const chunkPaths = Array.from({ length: session.total_chunks }, (_, i) => 
        `chunks/${sessionId}/chunk_${i.toString().padStart(4, '0')}`
      )
      await supabase.storage.from('document_chunks').remove(chunkPaths)
      console.log('✅ Cleaned up temporary chunks')
    } catch (cleanupError) {
      console.warn('⚠️ Failed to clean up chunks:', cleanupError)
    }

    // Update session status
    await supabase
      .from('upload_sessions')
      .update({ 
        status: 'processed',
        processed_at: new Date().toISOString(),
        document_id: documentId
      })
      .eq('id', sessionId)

    console.log(`🎉 Chunked upload processing completed: ${totalStoredChunks} chunks stored`)

    return NextResponse.json({
      success: true,
      documentsCount: 1,
      chunksCount: totalStoredChunks,
      documentId,
      message: `Successfully processed chunked upload: ${totalStoredChunks} chunks from ${session.filename}`,
      processingStats: {
        totalChunks: textChunks.length,
        chunksStored: totalStoredChunks,
        sessionId,
        originalFileSize: session.file_size,
        processingMethod: 'chunked_upload'
      }
    })

  } catch (error) {
    console.error('❌ Error in process chunked upload API:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 