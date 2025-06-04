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
    const chunkSize = parseInt(formData.get('chunkSize') as string) || 1000
    const chunkOverlap = parseInt(formData.get('chunkOverlap') as string) || 200
    const pdfParser = formData.get('pdfParser') as ParserType || 'pdf-parse'

    console.log('📊 Upload data:', {
      filesCount: files.length,
      metadataLength: metadataStr?.length,
      splitterType,
      chunkSize,
      chunkOverlap,
      pdfParser
    })

    if (!files || files.length === 0) {
      console.error('❌ No files provided for upload')
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (!metadataStr) {
      console.error('❌ No metadata provided for upload')
      return NextResponse.json({ error: 'Metadata is required' }, { status: 400 })
    }

    // File size validation - Vercel has 4.5MB request body limit
    const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB per file
    const MAX_TOTAL_SIZE = 3 * 1024 * 1024 // 3MB total
    
    // Check individual file sizes
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        console.error(`❌ File too large for upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
        return NextResponse.json({ 
          error: `File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed is 2MB per file.` 
        }, { status: 413 })
      }
    }

    // Check total payload size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      console.error(`❌ Total payload too large for upload: ${(totalSize / 1024 / 1024).toFixed(1)}MB`)
      return NextResponse.json({ 
        error: `Total file size is too large (${(totalSize / 1024 / 1024).toFixed(1)}MB). Maximum allowed is 3MB total.` 
      }, { status: 413 })
    }

    // Validate chunk size
    if (chunkSize < 100 || chunkSize > 5000) {
      return NextResponse.json({ 
        error: 'Chunk size must be between 100 and 5000 characters' 
      }, { status: 400 })
    }

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

        // Generate document ID
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`

        // Store document metadata
        console.log(`💾 Storing document metadata for ${file.name}...`)
        const { error: docError } = await supabase
          .from('documents_enhanced')
          .insert({
            id: documentId,
            title: metadata.title,
            author: metadata.author || null,
            doc_type: metadata.doc_type || null,
            genre: metadata.genre || null,
            content: text.substring(0, 1000), // Store first 1000 chars as preview
            metadata: {
              ...metadata,
              filename: file.name,
              file_size: file.size,
              chunk_count: chunks.length,
              parser_used: pdfResult.parserUsed,
              parse_time: pdfResult.parseTime,
              pdf_metadata: pdfResult.metadata
            }
          })

        if (docError) {
          console.error('❌ Error storing document:', docError)
          continue
        }

        // Process and store chunks with embeddings
        console.log(`🔮 Generating embeddings for ${chunks.length} chunks...`)
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          
          try {
            // Generate embedding for the chunk
            const embedding = await generateEmbedding(chunk)

            // Store chunk with embedding
            const { error: chunkError } = await supabase
              .from('documents_enhanced')
              .insert({
                id: `${documentId}_chunk_${i}`,
                title: metadata.title,
                author: metadata.author || null,
                doc_type: metadata.doc_type || null,
                genre: metadata.genre || null,
                content: chunk,
                metadata: {
                  ...metadata,
                  chunk_index: i,
                  parent_document: documentId,
                  filename: file.name,
                  parser_used: pdfResult.parserUsed
                },
                embedding: embedding
              })

            if (chunkError) {
              console.error('❌ Error storing chunk:', chunkError)
            } else {
              totalChunks++
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