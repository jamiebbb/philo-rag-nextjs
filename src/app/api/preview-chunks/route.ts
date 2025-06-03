import { NextRequest, NextResponse } from 'next/server'
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

    let allChunks: string[] = []

    // Process all files and combine chunks
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
        allChunks = allChunks.concat(chunks)
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError)
      }
    }

    if (allChunks.length === 0) {
      return NextResponse.json({ error: 'No chunks could be generated from the files' }, { status: 400 })
    }

    // Calculate statistics
    const chunkLengths = allChunks.map(chunk => chunk.length)
    const totalChunks = allChunks.length
    const avgLength = Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / totalChunks)
    const minLength = Math.min(...chunkLengths)
    const maxLength = Math.max(...chunkLengths)

    // Prepare chunk previews
    const chunkPreviews = allChunks.map((chunk, index) => ({
      index,
      content: chunk,
      length: chunk.length
    }))

    const chunkStats = {
      total_chunks: totalChunks,
      avg_length: avgLength,
      min_length: minLength,
      max_length: maxLength,
      first_chunk: chunkPreviews[0],
      last_chunk: chunkPreviews[chunkPreviews.length - 1],
      all_chunks: chunkPreviews
    }

    return NextResponse.json({
      success: true,
      chunkStats
    })

  } catch (error) {
    console.error('Error in preview chunks API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 