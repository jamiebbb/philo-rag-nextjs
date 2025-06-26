import { NextRequest, NextResponse } from 'next/server'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'
import { parsePDF, ParserType, PDFParserFactory } from '@/lib/pdf-parsers'

export async function POST(request: NextRequest) {
  console.log('🚀 Preview chunks API called')
  
  try {
    // Log the raw request
    console.log('📥 Raw request:', {
      headers: Object.fromEntries(request.headers.entries()),
      method: request.method,
      url: request.url
    })
    
    const formData = await request.formData()
    console.log('📦 FormData received:', {
      keys: Array.from(formData.keys()),
      fileCount: formData.getAll('files').length
    })
    
    const files = formData.getAll('files') as File[]
    const metadataStr = formData.get('metadata') as string
    const splitterType = formData.get('splitterType') as string || 'recursive'
    const chunkSize = parseInt(formData.get('chunkSize') as string) || 5000
    const chunkOverlap = parseInt(formData.get('chunkOverlap') as string) || 500
    const pdfParser = formData.get('pdfParser') as ParserType || 'pdf-parse'

    console.log('📋 Preview request details:', {
      fileCount: files.length,
      splitterType,
      chunkSize,
      chunkOverlap,
      fileSizes: files.map(f => `${f.name}: ${(f.size / 1024 / 1024).toFixed(1)}MB`)
    })

    if (!files || files.length === 0) {
      console.error('❌ No files provided')
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Parse metadata safely
    let metadata = {}
    try {
      metadata = metadataStr ? JSON.parse(metadataStr) : {}
      console.log('✅ Metadata parsed successfully:', metadata)
    } catch (error) {
      console.error('❌ Error parsing metadata:', error)
      return NextResponse.json({ error: 'Invalid metadata format' }, { status: 400 })
    }

    // Initialize text splitter based on type
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
    console.log('✅ Text splitter initialized:', { type: splitterType })

    let allChunks: string[] = []
    let totalParseTime = 0
    let extractedMetadata: any[] = []

    // Process all files and combine chunks
    for (const file of files) {
      try {
        console.log(`🔍 Processing file: ${file.name}`)
        
        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        console.log(`✅ File converted to buffer: ${buffer.length} bytes`)
        
        // Parse PDF using modular parser system
        console.log(`🔍 Starting PDF parsing with ${pdfParser}...`)
        const pdfResult = await parsePDF(buffer, {
          parser: pdfParser,
          fallbackToMock: process.env.NODE_ENV === 'development'
        })
        
        console.log(`✅ PDF parsing completed with ${pdfResult.parserUsed}`)
        
        const text = pdfResult.text
        if (!text || text.trim().length === 0) {
          console.warn(`⚠️ No text extracted from ${file.name}`)
          continue
        }
        console.log(`✅ Extracted ${text.length} characters from ${file.name}`)

        // Split text into chunks
        console.log('✂️ Starting text splitting...')
        const chunks = await textSplitter.splitText(text)
        console.log(`✅ Created ${chunks.length} chunks from ${file.name}`)
        
        allChunks = allChunks.concat(chunks)
        
        // Track parsing performance
        totalParseTime += pdfResult.parseTime || 0
        extractedMetadata.push({
          filename: file.name,
          ...pdfResult.metadata,
          parserUsed: pdfResult.parserUsed,
          parseTime: pdfResult.parseTime
        })
        
      } catch (fileError) {
        console.error(`❌ Error processing file ${file.name}:`, fileError)
        return NextResponse.json({ 
          error: `Failed to process file ${file.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}` 
        }, { status: 400 })
      }
    }

    if (allChunks.length === 0) {
      console.error('❌ No chunks could be generated from any files')
      return NextResponse.json({ error: 'No chunks could be generated from the files' }, { status: 400 })
    }

    // Calculate statistics
    const chunkLengths = allChunks.map(chunk => chunk.length)
    const totalChunks = allChunks.length
    const avgLength = Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / totalChunks)
    const minLength = Math.min(...chunkLengths)
    const maxLength = Math.max(...chunkLengths)

    console.log('📊 Chunk statistics:', {
      totalChunks,
      avgLength,
      minLength,
      maxLength
    })

    // Prepare chunk previews with safe content
    const chunkPreviews = allChunks.map((chunk, index) => ({
      index,
      content: chunk,
      length: chunk.length
    }))

    // Only include a subset of chunks for preview
    const previewChunks = chunkPreviews.slice(0, 10) // Only first 10 chunks
    console.log(`✅ Prepared ${previewChunks.length} preview chunks`)

    const chunkStats = {
      total_chunks: totalChunks,
      avg_length: avgLength,
      min_length: minLength,
      max_length: maxLength,
      first_chunk: chunkPreviews[0],
      last_chunk: chunkPreviews[chunkPreviews.length - 1],
      preview_chunks: previewChunks,
      parsing_info: {
        total_parse_time: totalParseTime,
        parser_used: pdfParser,
        files_metadata: extractedMetadata
      }
    }

    // Ensure the response is properly formatted as JSON
    const response = {
      success: true,
      chunkStats
    }

    // Log the response for debugging
    console.log('📤 Preparing response:', {
      success: response.success,
      totalChunks: chunkStats.total_chunks,
      previewChunksCount: chunkStats.preview_chunks.length
    })

    // Set response headers to ensure proper JSON handling
    const jsonResponse = new NextResponse(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    })

    console.log('✅ Response prepared successfully')
    return jsonResponse

  } catch (error) {
    console.error('❌ Error in preview chunks API:', error)
    // Ensure error response is also properly formatted as JSON
    const errorResponse = {
      success: false,
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }
    console.error('📤 Sending error response:', errorResponse)
    
    return new NextResponse(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    })
  }
} 