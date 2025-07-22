import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'
import { parsePDF, ParserType } from '@/lib/pdf-parsers'

// Configure timeout for this route (120 seconds for large file processing)
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Upload documents API called')
    
    // Get server-side Supabase client
    const supabase = createServerSupabaseClient()
    
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const metadataStr = formData.get('metadata') as string
    const splitterType = formData.get('splitterType') as string || 'recursive'
    const chunkSize = parseInt(formData.get('chunkSize') as string) || 5000
    const chunkOverlap = parseInt(formData.get('chunkOverlap') as string) || 500
    const pdfParser = formData.get('pdfParser') as ParserType || 'pdf-parse'

    console.log('📤 Upload request:', {
      fileCount: files.length,
      splitterType,
      chunkSize,
      chunkOverlap,
      fileSizes: files.map(f => `${f.name}: ${(f.size / 1024 / 1024).toFixed(1)}MB`)
    })

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (!metadataStr) {
      return NextResponse.json({ error: 'Metadata is required' }, { status: 400 })
    }

    // No file size validation - server can handle large files
    console.log('📤 Processing files for upload (no size limits)...')

    const metadata = JSON.parse(metadataStr)
    let totalChunks = 0
    let documentsCount = 0

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

    // Process files in optimized batches for better performance
    const BATCH_SIZE = 20 // Increased batch size for faster processing
    let allChunks: string[] = []
    let allMetadata: any[] = []

    for (const file of files) {
      try {
        console.log(`📄 Processing file for upload: ${file.name}`)
        
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Parse PDF using modular parser system
        console.log(`🔍 Parsing PDF for upload with ${pdfParser}...`)
        const pdfResult = await parsePDF(buffer, {
          parser: pdfParser,
          fallbackToMock: process.env.NODE_ENV === 'development'
        })

        const text = pdfResult.text
        console.log(`📝 Extracted ${text.length} characters for upload from ${file.name}`)

        if (!text || text.trim().length === 0) {
          console.warn(`⚠️ No text extracted from ${file.name} for upload`)
          continue
        }

        // Split text into chunks
        console.log('✂️ Splitting text for upload...')
        const chunks = await textSplitter.splitText(text)
        console.log(`✅ Created ${chunks.length} chunks for upload from ${file.name}`)

        if (chunks.length === 0) {
          console.warn(`⚠️ No chunks created from ${file.name}`)
          continue
        }

        allChunks = allChunks.concat(chunks)
        allMetadata.push({
          filename: file.name,
          ...pdfResult.metadata,
          parserUsed: pdfResult.parserUsed,
          parseTime: pdfResult.parseTime
        })

        documentsCount++
        console.log(`✅ Successfully processed ${file.name}`)
        
      } catch (fileError) {
        console.error(`❌ Error processing file ${file.name}:`, fileError)
        return NextResponse.json({ 
          error: `Failed to process file ${file.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}` 
        }, { status: 400 })
      }
    }

    // Generate document ID prefix for all chunks
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`

    // Process chunks in smaller batches with timeout handling
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batchChunks = allChunks.slice(i, i + BATCH_SIZE)
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
                total_chunks: allChunks.length,
                filename: allMetadata[0]?.filename,
                parser_used: allMetadata[0]?.parserUsed,
                parse_time: allMetadata[0]?.parseTime,
                pdf_metadata: allMetadata[0]?.metadata
              },
              embedding: embedding,
              title: metadata.title,
              author: metadata.author || null,
              doc_type: metadata.doc_type || 'Book',
              genre: metadata.genre || null,
              topic: metadata.topic || null,
              difficulty: metadata.difficulty || null,
              tags: metadata.tags || null,
              source_type: 'pdf_upload',
              summary: metadata.description || null,
              chunk_id: chunkIndex + 1,
              total_chunks: allChunks.length,
              source: allMetadata[0]?.filename || 'Unknown'
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
      totalChunks += batchResults.filter(Boolean).length
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
          content: `Document: ${metadata.title} - ${allChunks.length} chunks`,
          metadata: {
            ...metadata,
            is_parent_document: true,
            chunk_count: allChunks.length,
            processing_time: allMetadata[0]?.parseTime,
            text_length: allChunks.reduce((sum, chunk) => sum + chunk.length, 0),
            client_side_processed: true
          },
          source_type: 'pdf',
          summary: metadata.summary || '',
          chunk_id: 0,
          total_chunks: allChunks.length,
          source: `${metadata.title} (PDF)`
        })

      if (docError) {
        console.error('❌ Error storing main document record:', docError)
      }
    } catch (error) {
      console.error('❌ Failed to store main document record:', error)
    }

    return NextResponse.json({
      success: true,
      documentsCount: 1,
      chunksCount: totalChunks,
      documentId,
      message: `Successfully processed ${totalChunks} chunks`,
      processingInfo: {
        totalChunks: allChunks.length,
        chunksStored: totalChunks,
        skippedChunks: allChunks.length - totalChunks
      }
    })

  } catch (error) {
    console.error('❌ Error in upload documents API:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 