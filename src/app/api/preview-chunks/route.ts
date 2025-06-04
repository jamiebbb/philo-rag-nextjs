import { NextRequest, NextResponse } from 'next/server'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'
import { parsePDF, ParserType, PDFParserFactory } from '@/lib/pdf-parsers'

export async function POST(request: NextRequest) {
  try {
    console.log('📝 Preview chunks API called')
    
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const metadataStr = formData.get('metadata') as string
    const splitterType = formData.get('splitterType') as string || 'recursive'
    const chunkSize = parseInt(formData.get('chunkSize') as string) || 1000
    const chunkOverlap = parseInt(formData.get('chunkOverlap') as string) || 200
    const pdfParser = formData.get('pdfParser') as ParserType || 'pdf-parse'

    console.log('📊 Received data:', {
      filesCount: files.length,
      metadataLength: metadataStr?.length,
      splitterType,
      chunkSize,
      chunkOverlap,
      pdfParser
    })

    if (!files || files.length === 0) {
      console.error('❌ No files provided')
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (!metadataStr) {
      console.error('❌ No metadata provided')
      return NextResponse.json({ error: 'Metadata is required' }, { status: 400 })
    }

    // Log file details
    files.forEach((file, index) => {
      console.log(`📄 File ${index + 1}: ${file.name}, size: ${file.size} bytes, type: ${file.type}`)
    })

    // Log available parsers for debugging
    const availableParsers = PDFParserFactory.getAvailableParsers()
    console.log('🔧 Available PDF parsers:', availableParsers.map(p => `${p.name} (${p.description})`))

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

    console.log('🔧 Text splitter initialized:', splitterType)

    let allChunks: string[] = []
    let totalParseTime = 0
    let extractedMetadata: any[] = []

    // Process all files and combine chunks
    for (const file of files) {
      try {
        console.log(`🔍 Processing file: ${file.name}`)
        
        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer()
        console.log(`📖 File array buffer size: ${arrayBuffer.byteLength}`)
        
        const buffer = Buffer.from(arrayBuffer)
        console.log(`📄 Converting to buffer, size: ${buffer.length}`)
        
        // Parse PDF using modular parser system
        console.log(`🔍 Starting PDF parsing with ${pdfParser}...`)
        const pdfResult = await parsePDF(buffer, {
          parser: pdfParser,
          fallbackToMock: process.env.NODE_ENV === 'development' // Allow fallback in dev mode
        })
        
        console.log(`✅ PDF parsing completed with ${pdfResult.parserUsed}`)
        
        const text = pdfResult.text
        console.log(`📝 Extracted text length: ${text?.length || 0} characters`)
        console.log(`📄 PDF metadata:`, pdfResult.metadata)

        // Track parsing performance
        totalParseTime += pdfResult.parseTime || 0
        extractedMetadata.push({
          filename: file.name,
          ...pdfResult.metadata,
          parserUsed: pdfResult.parserUsed,
          parseTime: pdfResult.parseTime
        })

        if (!text || text.trim().length === 0) {
          console.warn(`⚠️ No text extracted from ${file.name}`)
          continue
        }

        // Show first 200 characters of extracted text for debugging
        console.log(`📝 Text preview: "${text.substring(0, 200)}..."`)

        // Split text into chunks
        console.log('✂️ Starting text splitting...')
        const chunks = await textSplitter.splitText(text)
        console.log(`✅ Created ${chunks.length} chunks from ${file.name}`)
        
        allChunks = allChunks.concat(chunks)
        console.log(`📊 Total chunks so far: ${allChunks.length}`)
        
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

    console.log(`📊 Final chunk count: ${allChunks.length}`)

    // Calculate statistics
    const chunkLengths = allChunks.map(chunk => chunk.length)
    const totalChunks = allChunks.length
    const avgLength = Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / totalChunks)
    const minLength = Math.min(...chunkLengths)
    const maxLength = Math.max(...chunkLengths)

    console.log('📈 Chunk statistics:', { totalChunks, avgLength, minLength, maxLength })

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
      all_chunks: chunkPreviews,
      // Additional metadata from parsing
      parsing_info: {
        total_parse_time: totalParseTime,
        parser_used: pdfParser,
        files_metadata: extractedMetadata
      }
    }

    console.log('✅ Chunk preview generated successfully')

    return NextResponse.json({
      success: true,
      chunkStats
    })

  } catch (error) {
    console.error('❌ Error in preview chunks API:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Error details:', errorMessage)
    
    return NextResponse.json(
      { error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    )
  }
} 