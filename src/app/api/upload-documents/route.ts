import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'
import pdf from 'pdf-parse'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const metadataStr = formData.get('metadata') as string
    const splitterType = formData.get('splitterType') as string || 'recursive'

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (!metadataStr) {
      return NextResponse.json({ error: 'Metadata is required' }, { status: 400 })
    }

    const metadata = JSON.parse(metadataStr)
    let totalChunks = 0
    let documentsCount = 0

    // Initialize text splitter
    const textSplitter = splitterType === 'character' 
      ? new CharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        })
      : new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        })

    for (const file of files) {
      try {
        // Extract text from PDF
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const pdfData = await pdf(buffer)
        const text = pdfData.text

        if (!text || text.trim().length === 0) {
          console.warn(`No text extracted from ${file.name}`)
          continue
        }

        // Split text into chunks
        const chunks = await textSplitter.splitText(text)

        if (chunks.length === 0) {
          console.warn(`No chunks created from ${file.name}`)
          continue
        }

        // Generate document ID
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`

        // Store document metadata
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
              chunk_count: chunks.length
            }
          })

        if (docError) {
          console.error('Error storing document:', docError)
          continue
        }

        // Process and store chunks with embeddings
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
                  filename: file.name
                },
                embedding: embedding
              })

            if (chunkError) {
              console.error('Error storing chunk:', chunkError)
            } else {
              totalChunks++
            }
          } catch (embeddingError) {
            console.error('Error generating embedding for chunk:', embeddingError)
          }
        }

        documentsCount++
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError)
      }
    }

    return NextResponse.json({
      success: true,
      documentsCount,
      chunksCount: totalChunks,
      message: `Successfully processed ${documentsCount} documents with ${totalChunks} chunks`
    })

  } catch (error) {
    console.error('Error in upload API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 