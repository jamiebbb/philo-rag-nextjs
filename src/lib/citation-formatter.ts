export interface DocumentSource {
  title: string
  author?: string
  content: string
  doc_type?: string
  page_number?: number
  chunk_id?: string
  similarity?: number
}

export interface FormattedCitation {
  inlineText: string  // e.g. "(The Intelligent Investor, Benjamin Graham, p. 45)"
  fullReference: string  // e.g. "Graham, B. (The Intelligent Investor), Page 45"
  shortForm: string  // e.g. "(Graham, p. 45)"
}

export class CitationFormatter {
  
  static formatCitation(source: DocumentSource): FormattedCitation {
    const title = source.title || 'Unknown Title'
    const author = source.author || 'Unknown Author'
    const pageNum = this.extractPageNumber(source.content, source.page_number)
    
    // Clean up author name for citation
    const cleanAuthor = this.formatAuthorName(author)
    const shortAuthor = this.getAuthorLastName(author)
    
    return {
      inlineText: this.buildInlineCitation(title, cleanAuthor, pageNum),
      fullReference: this.buildFullReference(title, cleanAuthor, pageNum),
      shortForm: this.buildShortForm(shortAuthor, pageNum)
    }
  }

  static formatMultipleCitations(sources: DocumentSource[]): {
    inlineText: string
    consolidatedSources: string[]
  } {
    if (sources.length === 0) {
      return { inlineText: '', consolidatedSources: [] }
    }

    if (sources.length === 1) {
      const citation = this.formatCitation(sources[0])
      return {
        inlineText: citation.inlineText,
        consolidatedSources: [citation.fullReference]
      }
    }

    // Group by book
    const bookGroups = new Map<string, DocumentSource[]>()
    sources.forEach(source => {
      const bookKey = `${source.title}-${source.author}`
      if (!bookGroups.has(bookKey)) {
        bookGroups.set(bookKey, [])
      }
      bookGroups.get(bookKey)!.push(source)
    })

    const consolidatedSources: string[] = []
    const inlineParts: string[] = []

    bookGroups.forEach((bookSources, bookKey) => {
      const firstSource = bookSources[0]
      const title = firstSource.title || 'Unknown Title'
      const author = firstSource.author || 'Unknown Author'
      const cleanAuthor = this.formatAuthorName(author)
      
      // Extract all page numbers for this book
      const pageNumbers = bookSources
        .map(source => this.extractPageNumber(source.content, source.page_number))
        .filter(page => page !== null)
        .sort((a, b) => a! - b!)
      
      if (pageNumbers.length > 0) {
        const pageRef = pageNumbers.length === 1 ? 
          `p. ${pageNumbers[0]}` : 
          `pp. ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`
        
        inlineParts.push(`(${title}, ${cleanAuthor}, ${pageRef})`)
        consolidatedSources.push(`${cleanAuthor} (${title}), ${pageRef}`)
      } else {
        inlineParts.push(`(${title}, ${cleanAuthor})`)
        consolidatedSources.push(`${cleanAuthor} (${title})`)
      }
    })

    return {
      inlineText: inlineParts.join('; '),
      consolidatedSources
    }
  }

  private static extractPageNumber(content: string, providedPageNum?: number): number | null {
    if (providedPageNum && providedPageNum > 0) {
      return providedPageNum
    }

    // Try to extract page number from content
    const pagePatterns = [
      /(?:page|p\.)\s*(\d+)/i,
      /\[page\s*(\d+)\]/i,
      /\(p\.?\s*(\d+)\)/i,
      /page\s*#?\s*(\d+)/i
    ]

    for (const pattern of pagePatterns) {
      const match = content.match(pattern)
      if (match) {
        const pageNum = parseInt(match[1])
        if (pageNum > 0 && pageNum < 10000) { // Reasonable page number range
          return pageNum
        }
      }
    }

    return null
  }

  private static formatAuthorName(author: string): string {
    if (!author || author === 'Unknown Author') {
      return 'Unknown Author'
    }

    // Clean up common formatting issues
    return author
      .replace(/^\s+|\s+$/g, '') // Trim
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/,$/, '') // Remove trailing comma
  }

  private static getAuthorLastName(author: string): string {
    if (!author || author === 'Unknown Author') {
      return 'Unknown'
    }

    const parts = author.trim().split(' ')
    return parts[parts.length - 1] // Get last part as surname
  }

  private static buildInlineCitation(title: string, author: string, pageNum: number | null): string {
    const pageRef = pageNum ? `, p. ${pageNum}` : ''
    return `(${title}, ${author}${pageRef})`
  }

  private static buildFullReference(title: string, author: string, pageNum: number | null): string {
    const pageRef = pageNum ? `, Page ${pageNum}` : ''
    return `${author} (${title})${pageRef}`
  }

  private static buildShortForm(shortAuthor: string, pageNum: number | null): string {
    const pageRef = pageNum ? `, p. ${pageNum}` : ''
    return `(${shortAuthor}${pageRef})`
  }

  // Helper method to add citations to response text
  static addCitationsToResponse(responseText: string, sources: DocumentSource[]): string {
    if (sources.length === 0) {
      return responseText
    }

    const { inlineText, consolidatedSources } = this.formatMultipleCitations(sources)
    
    // Add inline citation at the end of the response
    let citedResponse = responseText

    // Add sources section
    if (consolidatedSources.length > 0) {
      citedResponse += '\n\n**Sources:**\n'
      consolidatedSources.forEach((source, index) => {
        citedResponse += `${index + 1}. ${source}\n`
      })
    }

    return citedResponse
  }

  // Helper to check if content comes from uploaded books vs general knowledge
  static identifySourceType(sources: DocumentSource[]): {
    hasUploadedBooks: boolean
    hasGeneralKnowledge: boolean
    uploadedBookCount: number
  } {
    const uploadedBookCount = sources.length
    
    return {
      hasUploadedBooks: uploadedBookCount > 0,
      hasGeneralKnowledge: false, // We'll determine this in the response handlers
      uploadedBookCount
    }
  }
} 