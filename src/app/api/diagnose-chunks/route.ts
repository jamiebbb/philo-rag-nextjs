import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()

    // Get all documents with analysis
    const { data: allDocs, error } = await supabase
      .from('documents_enhanced')
      .select('*')
      .order('title', { ascending: true })

    if (error) {
      throw new Error(`Database query failed: ${error.message}`)
    }

    // Analyze the data structure
    const analysis = {
      totalChunks: allDocs?.length || 0,
      uniqueBooks: new Map(),
      chunkDistribution: new Map(),
      duplicateAnalysis: new Map(),
      issues: [] as string[]
    }

    // Process each document
    allDocs?.forEach((doc, index) => {
      const title = (doc.title || '').trim()
      const author = (doc.author || '').trim()
      
      if (!title) {
        analysis.issues.push(`Document ${index + 1}: Missing title`)
        return
      }

      const bookKey = `${title.toLowerCase()}-${author.toLowerCase()}`
      
      // Track unique books
      if (!analysis.uniqueBooks.has(bookKey)) {
        analysis.uniqueBooks.set(bookKey, {
          title,
          author,
          doc_type: doc.doc_type,
          chunks: [],
          firstSeen: index + 1
        })
      }

      const book = analysis.uniqueBooks.get(bookKey)
      book.chunks.push({
        chunk_id: doc.chunk_id || index + 1,
        content_preview: (doc.content || '').substring(0, 100),
        database_id: doc.id,
        similarity: doc.similarity
      })

      // Track chunk distribution
      const count = analysis.chunkDistribution.get(bookKey) || 0
      analysis.chunkDistribution.set(bookKey, count + 1)
    })

    // Find problematic patterns
    analysis.chunkDistribution.forEach((count, bookKey) => {
      if (count > 50) {
        analysis.issues.push(`"${bookKey}" has ${count} chunks (may be over-chunked)`)
      }
    })

    // Convert maps to objects for JSON response
    const uniqueBooksArray = Array.from(analysis.uniqueBooks.entries()).map(([key, value]) => ({
      bookKey: key,
      ...value,
      chunkCount: value.chunks.length
    }))

    const chunkDistributionArray = Array.from(analysis.chunkDistribution.entries()).map(([key, count]) => ({
      bookKey: key,
      chunkCount: count
    }))

    // Find the most over-chunked books
    const overChunkedBooks = chunkDistributionArray
      .filter(book => book.chunkCount > 10)
      .sort((a, b) => b.chunkCount - a.chunkCount)
      .slice(0, 10)

    const summary = {
      totalDocumentChunks: analysis.totalChunks,
      uniqueBooks: uniqueBooksArray.length,
      averageChunksPerBook: analysis.totalChunks / uniqueBooksArray.length,
      issues: analysis.issues,
      overChunkedBooks,
      sampleBooks: uniqueBooksArray.slice(0, 5).map(book => ({
        title: book.title,
        author: book.author,
        chunkCount: book.chunkCount,
        sampleChunks: book.chunks.slice(0, 3).map((chunk: any) => ({
          chunk_id: chunk.chunk_id,
          preview: chunk.content_preview + '...'
        }))
      }))
    }

    return NextResponse.json({
      success: true,
      analysis: summary,
      recommendations: generateRecommendations(summary),
      rawData: {
        allBooks: uniqueBooksArray,
        chunkDistribution: chunkDistributionArray
      }
    })

  } catch (error) {
    console.error('Error in chunk diagnosis:', error)
    return NextResponse.json(
      { error: 'Failed to diagnose chunks: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}

function generateRecommendations(summary: any): string[] {
  const recommendations = []

  if (summary.averageChunksPerBook > 20) {
    recommendations.push('⚠️ High chunk-to-book ratio detected. Consider using larger chunk sizes during upload.')
  }

  if (summary.overChunkedBooks.length > 0) {
    const topOffender = summary.overChunkedBooks[0]
    recommendations.push(`🔥 "${topOffender.bookKey}" has ${topOffender.chunkCount} chunks - this may be causing the duplicate issue you experienced.`)
  }

  if (summary.totalDocumentChunks > 1000) {
    recommendations.push('💾 Large database detected. Consider implementing chunk consolidation or using the cleanup utility.')
  }

  if (summary.issues.length > 0) {
    recommendations.push(`🐛 ${summary.issues.length} data quality issues found. See details in the analysis.`)
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Database structure looks healthy!')
  }

  return recommendations
}

// Add a cleanup utility endpoint
export async function DELETE(request: NextRequest) {
  try {
    const { bookKey, confirmDeletion } = await request.json()
    
    if (!confirmDeletion) {
      return NextResponse.json({ error: 'Deletion not confirmed' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Parse book key back to title and author
    const [title, author] = bookKey.split('-').map((part: string) => 
      part.split(' ').map((word: string) => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    )

    // Delete all chunks for this book
    const { error } = await supabase
      .from('documents_enhanced')
      .delete()
      .ilike('title', title)
      .ilike('author', author || '%')

    if (error) {
      throw new Error(`Failed to delete chunks: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      message: `Deleted all chunks for "${title}" by ${author || 'Unknown Author'}`
    })

  } catch (error) {
    console.error('Error in chunk cleanup:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup chunks: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 