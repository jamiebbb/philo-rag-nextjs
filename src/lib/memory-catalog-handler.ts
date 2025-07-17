import { createServerSupabaseClient } from './supabase'
import type { DocumentSource } from './citation-formatter'

export interface BookInMemory {
  title: string
  author: string
  doc_type: string
  genre?: string
  topic?: string
  difficulty?: string
  summary?: string
  totalChunks: number
  firstChunk: string
  created_at: string
}

export interface MemoryQueryResult {
  books: BookInMemory[]
  totalCount: number
  hasMore: boolean
  currentPage: number
  totalPages: number
  metadata: {
    byGenre: Record<string, number>
    byTopic: Record<string, number>
    byDifficulty: Record<string, number>
    byType: Record<string, number>
  }
}

export class MemoryCatalogHandler {
  private supabase: any

  constructor() {
    this.supabase = createServerSupabaseClient()
  }

  async getBooks(options: {
    count?: number
    topic?: string
    difficulty?: string
    page?: number
    pageSize?: number
  } = {}): Promise<MemoryQueryResult> {
    
    console.log('📚 Fetching books from memory with options:', options)

    // Get all documents from database
    let query = this.supabase
      .from('documents_enhanced')
      .select('title, author, doc_type, genre, topic, difficulty, summary, content, created_at')
      .order('title')

    // Apply topic filter if specified
    if (options.topic) {
      query = query.or(`topic.ilike.%${options.topic}%,genre.ilike.%${options.topic}%,tags.ilike.%${options.topic}%`)
    }

    // Apply difficulty filter if specified
    if (options.difficulty) {
      query = query.ilike('difficulty', `%${options.difficulty}%`)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('❌ Error fetching documents:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`📊 Retrieved ${documents?.length || 0} document chunks`)

    // Deduplicate into unique books
    const booksMap = new Map<string, BookInMemory>()
    let processedCount = 0

    documents?.forEach((doc: any) => {
      const title = doc.title?.trim()
      const author = doc.author?.trim() || 'Unknown Author'
      
      if (!title) {
        return // Skip documents without titles
      }

      processedCount++
      const bookKey = `${title.toLowerCase()}-${author.toLowerCase()}`
      
      if (!booksMap.has(bookKey)) {
        // First chunk of this book
        booksMap.set(bookKey, {
          title,
          author,
          doc_type: doc.doc_type || 'Unknown',
          genre: doc.genre,
          topic: doc.topic,
          difficulty: doc.difficulty,
          summary: doc.summary,
          totalChunks: 1,
          firstChunk: (doc.content || '').substring(0, 300) + '...',
          created_at: doc.created_at
        })
      } else {
        // Additional chunk of existing book
        const existing = booksMap.get(bookKey)!
        existing.totalChunks++
        
        // Update with better summary if available
        if (doc.summary && !existing.summary) {
          existing.summary = doc.summary
        }
        
        // Update with longer first chunk if current one is short
        if (existing.firstChunk.length < 200 && doc.content) {
          existing.firstChunk = doc.content.substring(0, 300) + '...'
        }
      }
    })

    console.log(`📖 Deduplicated into ${booksMap.size} unique books from ${processedCount} chunks`)

    // Convert to array and sort
    let allBooks = Array.from(booksMap.values())
      .sort((a, b) => a.title.localeCompare(b.title))

    // Generate metadata statistics
    const metadata = this.generateMetadata(allBooks)

    // Apply count limit if specified (for "name 3 books" type queries)
    if (options.count && options.count > 0) {
      allBooks = allBooks.slice(0, options.count)
      
      return {
        books: allBooks,
        totalCount: booksMap.size,
        hasMore: booksMap.size > options.count,
        currentPage: 1,
        totalPages: 1,
        metadata
      }
    }

    // Apply pagination for browsing
    const pageSize = options.pageSize || 20
    const currentPage = options.page || 1
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    
    const paginatedBooks = allBooks.slice(startIndex, endIndex)
    const totalPages = Math.ceil(allBooks.length / pageSize)
    const hasMore = currentPage < totalPages

    console.log(`📄 Page ${currentPage}/${totalPages}: showing ${paginatedBooks.length} books`)

    return {
      books: paginatedBooks,
      totalCount: allBooks.length,
      hasMore,
      currentPage,
      totalPages,
      metadata
    }
  }

  private generateMetadata(books: BookInMemory[]) {
    const metadata = {
      byGenre: {} as Record<string, number>,
      byTopic: {} as Record<string, number>,
      byDifficulty: {} as Record<string, number>,
      byType: {} as Record<string, number>
    }

    books.forEach(book => {
      // Count by genre
      const genre = book.genre || 'Uncategorized'
      metadata.byGenre[genre] = (metadata.byGenre[genre] || 0) + 1
      
      // Count by topic
      const topic = book.topic || 'General'
      metadata.byTopic[topic] = (metadata.byTopic[topic] || 0) + 1
      
      // Count by difficulty
      const difficulty = book.difficulty || 'Unknown'
      metadata.byDifficulty[difficulty] = (metadata.byDifficulty[difficulty] || 0) + 1
      
      // Count by type
      const type = book.doc_type || 'Unknown'
      metadata.byType[type] = (metadata.byType[type] || 0) + 1
    })

    return metadata
  }

  // Format books for display in chat response
  formatBooksForResponse(result: MemoryQueryResult, isCountQuery: boolean = false): string {
    if (result.books.length === 0) {
      return "I don't have any books in my memory at the moment. You can upload documents to build my knowledge base."
    }

    let response = ''

    if (isCountQuery) {
      response += `Here are ${result.books.length} books from my memory:\n\n`
    } else {
      response += `I have ${result.totalCount} books in my memory. `
      
      if (result.hasMore) {
        response += `Showing page ${result.currentPage} of ${result.totalPages} (${result.books.length} books):\n\n`
      } else {
        response += `Here's the complete list:\n\n`
      }
    }

    // List the books
    result.books.forEach((book, index) => {
      const num = isCountQuery ? index + 1 : (result.currentPage - 1) * 20 + index + 1
      response += `${num}. **"${book.title}"** by ${book.author}\n`
      
      if (book.genre || book.topic || book.difficulty) {
        const details = []
        if (book.genre) details.push(`Genre: ${book.genre}`)
        if (book.topic) details.push(`Topic: ${book.topic}`)
        if (book.difficulty) details.push(`Level: ${book.difficulty}`)
        response += `   ${details.join(' | ')}\n`
      }
      
      if (book.summary) {
        response += `   ${book.summary.substring(0, 150)}${book.summary.length > 150 ? '...' : ''}\n`
      }
      
      response += `   (${book.totalChunks} chunks available)\n\n`
    })

    // Add pagination info
    if (!isCountQuery && result.hasMore) {
      response += `\n📖 **${result.totalCount - (result.currentPage * 20)} more books available** - ask "show me the next 20 books" to continue browsing.\n`
    }

    // Add collection summary
    if (!isCountQuery && result.currentPage === 1) {
      response += '\n**Collection Overview:**\n'
      
      const topGenres = Object.keys(result.metadata.byGenre)
        .map(genre => ({ genre, count: result.metadata.byGenre[genre] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(item => `${item.genre} (${item.count})`)
        .join(', ')
      
      if (topGenres) {
        response += `• Top genres: ${topGenres}\n`
      }
      
      const topTopics = Object.keys(result.metadata.byTopic)
        .map(topic => ({ topic, count: result.metadata.byTopic[topic] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(item => `${item.topic} (${item.count})`)
        .join(', ')
      
      if (topTopics) {
        response += `• Main topics: ${topTopics}\n`
      }
    }

    return response
  }

  // Convert books to DocumentSource format for compatibility
  convertToDocumentSources(books: BookInMemory[]): DocumentSource[] {
    return books.map(book => ({
      title: book.title,
      author: book.author,
      content: book.firstChunk,
      doc_type: book.doc_type,
      similarity: 1.0 // High similarity since these are direct matches
    }))
  }
} 