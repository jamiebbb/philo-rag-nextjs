import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'
import { parsePDF, ParserType } from '@/lib/pdf-parsers'

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

    // Initialize text splitter based on type
    let textSplitter
    
    switch (splitterType) {
      case 'character':
        textSplitter = new CharacterTextSplitter({
          chunkSize,
          chunkOverlap,
        })
        break
      case 'markdown':
        textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
          separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', ' ', '']
        })
        break
      case 'html':
        textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
          separators: ['</div>', '</p>', '</h1>', '</h2>', '</h3>', '\n\n', '\n', ' ', '']
        })
        break
      default: // recursive
        textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
        })
    }

    console.log('🔧 Text splitter initialized for upload:', splitterType)

    for (const file of files) {
      try {
        console.log(`📄 Processing file for upload: ${file.name}`)
        
        // Convert file to buffer
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

        // Generate document ID prefix for all chunks
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`

        // Process and store chunks with embeddings directly (no separate document entry needed)
        console.log(`🔮 Generating embeddings and storing ${chunks.length} chunks...`)
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          
          try {
            // Generate CONTEXT-ENHANCED embedding that includes both content AND key metadata
            const contextEnhancedText = `
Company/Source: ${metadata.title || file.name}
Author/Speaker: ${metadata.author || 'Unknown'}
Topic: ${metadata.topic || 'General'}
Content: ${chunk}
            `.trim()
            
            console.log(`🔮 Generating context-enhanced embedding for chunk ${i + 1}/${chunks.length}...`)
            
            const embedding = await generateEmbedding(contextEnhancedText)

            // Store chunk with all required fields matching the documents_enhanced schema
            const { error: chunkError } = await supabase
              .from('documents_enhanced')
              .insert({
                content: chunk,
                metadata: {
                  ...metadata,
                  chunk_index: i,
                  total_chunks: chunks.length,
                  filename: file.name,
                  file_size: file.size,
                  parser_used: pdfResult.parserUsed,
                  parse_time: pdfResult.parseTime,
                  pdf_metadata: pdfResult.metadata
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
                chunk_id: i + 1,
                total_chunks: chunks.length,
                source: file.name
              })

            if (chunkError) {
              console.error('❌ Error storing chunk:', chunkError)
              console.error('❌ Chunk error details:', {
                message: chunkError.message,
                code: chunkError.code,
                details: chunkError.details
              })
            } else {
              totalChunks++
              console.log(`✅ Stored chunk ${i + 1}/${chunks.length} for ${file.name}`)
            }
          } catch (embeddingError) {
            console.error('❌ Error generating embedding for chunk:', embeddingError)
          }
        }

        documentsCount++
        console.log(`✅ Successfully processed ${file.name}`)
        
      } catch (fileError) {
        console.error(`❌ Error processing file ${file.name}:`, fileError)
      }
    }

    console.log(`🎉 Upload completed: ${documentsCount} documents, ${totalChunks} chunks`)

    return NextResponse.json({
      success: true,
      documentsCount,
      chunksCount: totalChunks,
      message: `Successfully processed ${documentsCount} documents with ${totalChunks} chunks`
    })

  } catch (error) {
    console.error('❌ Error in upload API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 