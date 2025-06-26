import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    
    // Get pagination parameters from URL
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '1000')
    const offset = (page - 1) * limit

    // Get total count first
    const { count: totalCount, error: countError } = await supabase
      .from('documents_enhanced')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Error getting total count:', countError)
      return NextResponse.json({ error: 'Failed to get document count' }, { status: 500 })
    }

    // Ensure totalCount is a number
    const safeTotalCount = totalCount ?? 0

    // Get paginated documents
    const { data: documents, error } = await supabase
      .from('documents_enhanced')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching database documents:', error)
      return NextResponse.json({ error: 'Failed to fetch database documents' }, { status: 500 })
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({
        documents: [],
        stats: {
          totalDocuments: 0,
          totalChunks: 0,
          uniqueDocuments: 0,
          averageChunksPerDocument: 0,
          documentsByType: {},
          documentsBySource: {},
          documentsByAuthor: {},
          latestUpload: 'Never'
        },
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit
        }
      })
    }

    // Calculate comprehensive statistics
    const stats = calculateDatabaseStats(documents)

    return NextResponse.json({
      documents,
      stats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(safeTotalCount / limit),
        totalItems: safeTotalCount,
        itemsPerPage: limit
      }
    })

  } catch (error) {
    console.error('Error in database view API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function calculateDatabaseStats(documents: any[]) {
  // Group by unique documents (title + author + source_type)
  const uniqueDocsMap = new Map()
  const documentsByType: { [key: string]: number } = {}
  const documentsBySource: { [key: string]: number } = {}
  const documentsByAuthor: { [key: string]: number } = {}

  documents.forEach((doc: any) => {
    const key = `${doc.title || 'Untitled'}_${doc.author || 'Unknown'}_${doc.source_type || 'unknown'}`
    
    if (!uniqueDocsMap.has(key)) {
      uniqueDocsMap.set(key, {
        title: doc.title,
        author: doc.author,
        doc_type: doc.doc_type,
        source_type: doc.source_type,
        created_at: doc.created_at,
        chunks: []
      })
    }
    
    uniqueDocsMap.get(key).chunks.push(doc)
    
    // Count by type
    const type = doc.doc_type || 'Unknown'
    documentsByType[type] = (documentsByType[type] || 0) + 1
    
    // Count by source
    const source = doc.source_type || 'unknown'
    documentsBySource[source] = (documentsBySource[source] || 0) + 1
    
    // Count by author  
    const author = doc.author || 'Unknown'
    documentsByAuthor[author] = (documentsByAuthor[author] || 0) + 1
  })

  const uniqueDocuments = Array.from(uniqueDocsMap.values())
  const totalChunks = documents.length
  const uniqueDocCount = uniqueDocuments.length
  const averageChunksPerDocument = uniqueDocCount > 0 ? totalChunks / uniqueDocCount : 0

  // Find latest upload
  const latestDoc = documents.reduce((latest, current) => {
    return new Date(current.created_at) > new Date(latest.created_at) ? current : latest
  }, documents[0])

  const latestUpload = latestDoc ? new Date(latestDoc.created_at).toLocaleDateString() : 'Never'

  // Group counts by unique documents instead of chunks
  const uniqueDocsByType: { [key: string]: number } = {}
  const uniqueDocsBySource: { [key: string]: number } = {}
  const uniqueDocsByAuthor: { [key: string]: number } = {}

  uniqueDocuments.forEach((doc: any) => {
    const type = doc.doc_type || 'Unknown'
    const source = doc.source_type || 'unknown'
    const author = doc.author || 'Unknown'
    
    uniqueDocsByType[type] = (uniqueDocsByType[type] || 0) + 1
    uniqueDocsBySource[source] = (uniqueDocsBySource[source] || 0) + 1
    uniqueDocsByAuthor[author] = (uniqueDocsByAuthor[author] || 0) + 1
  })

  return {
    totalDocuments: totalChunks, // Total chunks in database
    totalChunks,
    uniqueDocuments: uniqueDocCount, // Unique documents
    averageChunksPerDocument,
    documentsByType: uniqueDocsByType, // Based on unique documents
    documentsBySource: uniqueDocsBySource, // Based on unique documents  
    documentsByAuthor: uniqueDocsByAuthor, // Based on unique documents
    latestUpload,
    
    // Additional detailed stats
    chunksByType: documentsByType, // Total chunks by type
    chunksBySource: documentsBySource, // Total chunks by source
    chunksByAuthor: documentsByAuthor, // Total chunks by author
    
    // Document size statistics
    avgChunkSize: documents.reduce((sum, doc) => sum + (doc.content?.length || 0), 0) / documents.length,
    minChunkSize: Math.min(...documents.map(doc => doc.content?.length || 0)),
    maxChunkSize: Math.max(...documents.map(doc => doc.content?.length || 0)),
    
    // Most prolific authors/sources
    topAuthors: Object.entries(uniqueDocsByAuthor)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([author, count]) => ({ author, count })),
    
    topSources: Object.entries(uniqueDocsBySource)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }))
  }
} 