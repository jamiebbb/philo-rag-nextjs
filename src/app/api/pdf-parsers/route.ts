import { NextResponse } from 'next/server'
import { PDFParserFactory } from '@/lib/pdf-parsers'

/**
 * API endpoint to get information about available PDF parsers
 */
export async function GET() {
  try {
    const parsers = PDFParserFactory.getAvailableParsers()
    
    return NextResponse.json({
      success: true,
      parsers: parsers.map(parser => ({
        name: parser.name,
        description: parser.description,
        features: parser.features,
        recommended_for: getRecommendations(parser.features)
      })),
      default_parser: 'pdf-parse',
      total_available: parsers.length
    })
  } catch (error) {
    console.error('Error getting PDF parser info:', error)
    return NextResponse.json(
      { error: 'Failed to get parser information' },
      { status: 500 }
    )
  }
}

function getRecommendations(features: any) {
  const recommendations = []
  
  if (features.extractText && !features.ocrCapability) {
    recommendations.push('Standard PDFs with embedded text')
  }
  
  if (features.ocrCapability) {
    recommendations.push('Scanned documents and images')
  }
  
  if (features.handleEncrypted) {
    recommendations.push('Password-protected PDFs')
  }
  
  if (features.extractMetadata) {
    recommendations.push('Extracting document metadata')
  }
  
  if (features.preserveFormatting) {
    recommendations.push('Maintaining document structure')
  }
  
  return recommendations.length > 0 ? recommendations : ['General purpose']
} 