'use client'

import * as pdfjsLib from 'pdfjs-dist'
import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from 'langchain/text_splitter'

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

export interface ProcessedChunk {
  content: string
  index: number
  length: number
}

export interface PDFProcessingResult {
  success: boolean
  chunks: ProcessedChunk[]
  totalPages: number
  extractedText: string
  textLength: number
  processingTime: number
  error?: string
}

export interface PDFProcessingOptions {
  chunkSize?: number
  chunkOverlap?: number
  splitterType?: 'recursive' | 'character' | 'markdown' | 'html'
}

/**
 * Extract text from PDF file in the browser
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    console.log('📄 Starting client-side PDF text extraction...')
    
    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer()
    
    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    console.log(`📄 PDF loaded: ${pdf.numPages} pages`)
    
    let fullText = ''
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      
      // Combine text items with spaces
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
      
      if (pageText) {
        fullText += pageText + '\n\n'
      }
      
      // Show progress for large documents
      if (pdf.numPages > 10 && pageNum % 10 === 0) {
        console.log(`📄 Processed ${pageNum}/${pdf.numPages} pages`)
      }
    }
    
    console.log(`✅ Text extraction completed: ${fullText.length} characters`)
    return fullText.trim()
    
  } catch (error) {
    console.error('❌ Error extracting text from PDF:', error)
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Process PDF file completely on the client side
 */
export async function processPDFFile(
  file: File, 
  options: PDFProcessingOptions = {}
): Promise<PDFProcessingResult> {
  const startTime = Date.now()
  
  try {
    console.log('🔄 Starting complete client-side PDF processing...')
    
    const {
      chunkSize = 1000,
      chunkOverlap = 200,
      splitterType = 'recursive'
    } = options
    
    // Step 1: Extract text from PDF
    console.log('📄 Step 1: Extracting text...')
    const extractedText = await extractTextFromPDF(file)
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the PDF')
    }
    
    // Step 2: Initialize text splitter
    console.log('✂️ Step 2: Initializing text splitter...')
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
    
    // Step 3: Split text into chunks
    console.log('✂️ Step 3: Splitting text into chunks...')
    const textChunks = await textSplitter.splitText(extractedText)
    
    // Step 4: Format chunks
    const chunks: ProcessedChunk[] = textChunks.map((content: string, index: number) => ({
      content,
      index,
      length: content.length
    }))
    
    const processingTime = Date.now() - startTime
    
    console.log(`✅ Client-side PDF processing completed:`)
    console.log(`   📄 Text length: ${extractedText.length.toLocaleString()} characters`)
    console.log(`   ✂️ Chunks created: ${chunks.length}`)
    console.log(`   ⏱️ Processing time: ${processingTime}ms`)
    
    return {
      success: true,
      chunks,
      totalPages: 0, // We don't track this in the simple version
      extractedText,
      textLength: extractedText.length,
      processingTime
    }
    
  } catch (error) {
    console.error('❌ Error in client-side PDF processing:', error)
    
    return {
      success: false,
      chunks: [],
      totalPages: 0,
      extractedText: '',
      textLength: 0,
      processingTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validate file before processing
 */
export function validatePDFFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (file.type !== 'application/pdf') {
    return { valid: false, error: 'File must be a PDF' }
  }
  
  // Check file size (browser memory limit - suggest max 100MB)
  const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.` 
    }
  }
  
  return { valid: true }
} 