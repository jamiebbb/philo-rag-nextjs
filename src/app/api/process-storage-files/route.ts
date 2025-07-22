import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'
import { parsePDF, ParserType } from '@/lib/pdf-parsers'

// Configure timeout for this route (120 seconds for large file processing)
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Process storage files API called')
    
    const supabase = createServerSupabaseClient()
    const body = await request.json()
    
    const { 
      files,        // Array of { path: string, originalName: string }
      metadata, 
      splitterType = 'recursive',
      chunkSize = 5000,
      chunkOverlap = 500
    } = body

    console.log('📊 Process storage files request:', {
      fileCount: files?.length,
      files: files?.map((f: any) => ({ path: f.path, name: f.originalName })),
      splitterType,
      chunkSize,
      chunkOverlap
    })

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (!metadata || !metadata.title) {
      return NextResponse.json({ error: 'Metadata with title is required' }, { status: 400 })
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

    let allChunks: string[] = []
    let allMetadata: any[] = []
    let documentsCount = 0

    // Process each file from storage
    for (const fileInfo of files) {
      try {
        console.log(`📄 Processing storage file: ${fileInfo.originalName} from ${fileInfo.path}`)
        
        // Download file from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(fileInfo.path)
        
        if (downloadError) {
          throw new Error(`Failed to download ${fileInfo.path}: ${downloadError.message}`)
        }
        
        if (!fileData) {
          throw new Error(`No data received for ${fileInfo.path}`)
        }
        
        // Convert Blob to Buffer for pdf-parse
        const arrayBuffer = await fileData.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        
        console.log(`🔍 Parsing PDF from storage: ${fileInfo.originalName}`)
        
        // Parse PDF using existing modular parser system
        const pdfResult = await parsePDF(buffer, {
          parser: 'pdf-parse' as ParserType,
          fallbackToMock: process.env.NODE_ENV === 'development'
        })

        const text = pdfResult.text
        console.log(`📝 Extracted ${text.length} characters from ${fileInfo.originalName}`)

        if (!text || text.trim().length === 0) {
          console.warn(`⚠️ No text extracted from ${fileInfo.originalName}`)
          continue
        }

        // Split text into chunks using same logic as existing upload
        console.log('✂️ Splitting text into chunks...')
        const chunks = await textSplitter.splitText(text)
        console.log(`✅ Created ${chunks.length} chunks from ${fileInfo.originalName}`)

        if (chunks.length === 0) {
          console.warn(`⚠️ No chunks created from ${fileInfo.originalName}`)
          continue
        }

        allChunks = allChunks.concat(chunks)
        allMetadata.push({
          filename: fileInfo.originalName,
          storagePath: fileInfo.path,
          ...pdfResult.metadata,
          parserUsed: pdfResult.parserUsed,
          parseTime: pdfResult.parseTime
        })

        documentsCount++
        console.log(`✅ Successfully processed ${fileInfo.originalName}`)
        
      } catch (fileError) {
        console.error(`❌ Error processing file ${fileInfo.originalName}:`, fileError)
        return NextResponse.json({ 
          error: `Failed to process file ${fileInfo.originalName}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}` 
        }, { status: 400 })
      }
    }

    if (allChunks.length === 0) {
      return NextResponse.json({ error: 'No content was extracted from any files' }, { status: 400 })
    }

    // Generate document ID prefix for all chunks
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`
    
    // Process chunks in optimized batches for better performance
    const BATCH_SIZE = 20
    let totalChunks = 0

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batchChunks = allChunks.slice(i, i + BATCH_SIZE)
      const batchPromises = batchChunks.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex
        try {
          // Create context-enhanced text for better embeddings (same as existing)
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
                storage_path: allMetadata[0]?.storagePath,
                parser_used: allMetadata[0]?.parserUsed,
                parse_time: allMetadata[0]?.parseTime,
                pdf_metadata: allMetadata[0]?.metadata,
                processing_method: 'storage_upload'
              },
              embedding: embedding,
              title: metadata.title,
              author: metadata.author || null,
              doc_type: metadata.doc_type || 'Book',
              genre: metadata.genre || null,
              topic: metadata.topic || null,
              difficulty: metadata.difficulty || null,
              tags: metadata.tags || null,
              source_type: 'storage_pdf_upload',
              summary: metadata.description || null,
              chunk_id: chunkIndex + 1,
              total_chunks: allChunks.length,
              source: allMetadata[0]?.filename || 'Storage Upload'
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

    // Store main document record (same as existing)
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
            processing_method: 'storage_upload',
            storage_files: allMetadata.map(m => ({ filename: m.filename, path: m.storagePath }))
          },
          source_type: 'storage_pdf',
          summary: metadata.summary || metadata.description || '',
          chunk_id: 0,
          total_chunks: allChunks.length,
          source: allMetadata.map(m => m.filename).join(', ') || 'Storage Upload'
        })

      if (docError) {
        console.error('❌ Error storing main document record:', docError)
      }
    } catch (error) {
      console.error('❌ Failed to store main document record:', error)
    }

    console.log(`🎉 Storage file processing completed: ${totalChunks} chunks stored`)

    return NextResponse.json({
      success: true,
      documentsCount: 1,
      chunksCount: totalChunks,
      documentId,
      message: `Successfully processed ${totalChunks} chunks from ${files.length} files`,
      processingStats: {
        totalChunks: allChunks.length,
        chunksStored: totalChunks,
        skippedChunks: allChunks.length - totalChunks,
        filesProcessed: documentsCount,
        totalFiles: files.length,
        processingMethod: 'storage_upload'
      }
    })

  } catch (error) {
    console.error('❌ Error in process storage files API:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 