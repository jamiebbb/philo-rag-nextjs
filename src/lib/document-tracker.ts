import { supabase, createServerSupabaseClient } from './supabase'
import { DocumentStats, Document, DocumentFilter } from '@/types'
import CryptoJS from 'crypto-js'

export interface DocumentRecord {
  id?: string
  title: string
  author: string
  summary?: string
  type: string
  genre: string
  topic?: string
  difficulty: string
  source_type: string
  tags?: string
  chunks: number
  chunk_size?: number
  chunk_overlap?: number
  file_hash?: string
  file_name?: string
  file_size?: number
  video_id?: string
  source_url?: string
  upload_date?: string
  created_at?: string
}

/**
 * Get the appropriate Supabase client based on environment
 */
function getSupabaseClient() {
  // Check if we're in a server environment (API route)
  if (typeof window === 'undefined') {
    return createServerSupabaseClient()
  }
  // Client-side environment
  return supabase
}

/**
 * Calculate file hash for duplicate detection
 */
export function calculateFileHash(fileContent: ArrayBuffer | string): string {
  const wordArray = typeof fileContent === 'string' 
    ? CryptoJS.enc.Utf8.parse(fileContent)
    : CryptoJS.lib.WordArray.create(fileContent)
  return CryptoJS.SHA256(wordArray).toString()
}

/**
 * Add document record to tracker
 */
export async function addDocumentRecord(
  documentData: Omit<DocumentRecord, 'id' | 'upload_date' | 'created_at'>
): Promise<string | null> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return null
    }
    
    const record: DocumentRecord = {
      ...documentData,
      upload_date: new Date().toISOString(),
      created_at: new Date().toISOString()
    }

    const { data, error } = await client
      .from('document_tracker')
      .insert(record)
      .select('id')
      .single()

    if (error) {
      console.error('Error adding document record:', error)
      return null
    }

    return data?.id || null
  } catch (error) {
    console.error('Error adding document record:', error)
    return null
  }
}

/**
 * Check for duplicate files
 */
export async function isDuplicateFile(
  fileContent: ArrayBuffer | string,
  fileName?: string
): Promise<{ isDuplicate: boolean; existingRecord?: DocumentRecord }> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return { isDuplicate: false }
    }
    
    const fileHash = calculateFileHash(fileContent)

    const { data, error } = await client
      .from('document_tracker')
      .select('*')
      .eq('file_hash', fileHash)
      .limit(1)

    if (error) {
      console.error('Error checking for duplicates:', error)
      return { isDuplicate: false }
    }

    if (data && data.length > 0) {
      return { isDuplicate: true, existingRecord: data[0] }
    }

    return { isDuplicate: false }
  } catch (error) {
    console.error('Error checking for duplicates:', error)
    return { isDuplicate: false }
  }
}

/**
 * Check for duplicate URLs (for YouTube videos)
 */
export async function isDuplicateUrl(
  url: string,
  videoId?: string
): Promise<{ isDuplicate: boolean; existingRecord?: DocumentRecord }> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return { isDuplicate: false }
    }
    
    let query = client
      .from('document_tracker')
      .select('*')

    if (videoId) {
      query = query.eq('video_id', videoId)
    } else {
      query = query.eq('source_url', url)
    }

    const { data, error } = await query.limit(1)

    if (error) {
      console.error('Error checking for duplicate URLs:', error)
      return { isDuplicate: false }
    }

    if (data && data.length > 0) {
      return { isDuplicate: true, existingRecord: data[0] }
    }

    return { isDuplicate: false }
  } catch (error) {
    console.error('Error checking for duplicate URLs:', error)
    return { isDuplicate: false }
  }
}

/**
 * Get all documents from tracker
 */
export async function getAllDocuments(): Promise<DocumentRecord[]> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return []
    }
    
    const { data, error } = await client
      .from('document_tracker')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error getting documents:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error getting documents:', error)
    return []
  }
}

/**
 * Search documents in tracker
 */
export async function searchDocuments(
  query: string,
  filters?: DocumentFilter
): Promise<DocumentRecord[]> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return []
    }
    
    let dbQuery = client
      .from('document_tracker')
      .select('*')

    // Apply text search
    if (query) {
      dbQuery = dbQuery.or(`title.ilike.%${query}%,author.ilike.%${query}%,tags.ilike.%${query}%,topic.ilike.%${query}%`)
    }

    // Apply filters
    if (filters) {
      if (filters.type) {
        dbQuery = dbQuery.eq('type', filters.type)
      }
      if (filters.difficulty) {
        dbQuery = dbQuery.eq('difficulty', filters.difficulty)
      }
      if (filters.genre) {
        dbQuery = dbQuery.eq('genre', filters.genre)
      }
      if (filters.source_type) {
        dbQuery = dbQuery.eq('source_type', filters.source_type)
      }
      if (filters.author) {
        dbQuery = dbQuery.ilike('author', `%${filters.author}%`)
      }
    }

    const { data, error } = await dbQuery
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error searching documents:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error searching documents:', error)
    return []
  }
}

/**
 * Get document statistics
 */
export async function getDocumentStats(): Promise<DocumentStats> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return {
        total: 0,
        total_chunks: 0,
        by_type: {},
        by_difficulty: {},
        by_source: {},
        by_genre: {}
      }
    }
    
    const { data, error } = await client
      .from('document_tracker')
      .select('type, difficulty, source_type, genre, chunks')

    if (error) {
      console.error('Error getting document stats:', error)
      return {
        total: 0,
        total_chunks: 0,
        by_type: {},
        by_difficulty: {},
        by_source: {},
        by_genre: {}
      }
    }

    const total = data?.length || 0
    const total_chunks = data?.reduce((sum: number, doc: any) => sum + (doc.chunks || 0), 0) || 0
    
    const by_type: Record<string, number> = {}
    const by_difficulty: Record<string, number> = {}
    const by_source: Record<string, number> = {}
    const by_genre: Record<string, number> = {}

    data?.forEach((doc: any) => {
      if (doc.type) {
        by_type[doc.type] = (by_type[doc.type] || 0) + 1
      }
      if (doc.difficulty) {
        by_difficulty[doc.difficulty] = (by_difficulty[doc.difficulty] || 0) + 1
      }
      if (doc.source_type) {
        by_source[doc.source_type] = (by_source[doc.source_type] || 0) + 1
      }
      if (doc.genre) {
        by_genre[doc.genre] = (by_genre[doc.genre] || 0) + 1
      }
    })

    return {
      total,
      total_chunks,
      by_type,
      by_difficulty,
      by_source,
      by_genre
    }
  } catch (error) {
    console.error('Error getting document stats:', error)
    return {
      total: 0,
      total_chunks: 0,
      by_type: {},
      by_difficulty: {},
      by_source: {},
      by_genre: {}
    }
  }
}

/**
 * Remove document from tracker
 */
export async function removeDocument(documentId: string): Promise<boolean> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return false
    }
    
    const { error } = await client
      .from('document_tracker')
      .delete()
      .eq('id', documentId)

    if (error) {
      console.error('Error removing document:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error removing document:', error)
    return false
  }
}

/**
 * Update document metadata
 */
export async function updateDocumentMetadata(
  documentId: string,
  updates: Partial<DocumentRecord>
): Promise<boolean> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return false
    }
    
    const { error } = await client
      .from('document_tracker')
      .update(updates)
      .eq('id', documentId)

    if (error) {
      console.error('Error updating document:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error updating document:', error)
    return false
  }
}

/**
 * Sync tracker with enhanced documents table
 */
export async function syncWithEnhancedTable(): Promise<boolean> {
  try {
    const client = getSupabaseClient()
    
    if (!client) {
      console.error('Supabase client not available')
      return false
    }
    
    // Get unique documents from enhanced table
    const { data: enhancedDocs, error: enhancedError } = await client
      .from('documents_enhanced')
      .select('title, author, doc_type, genre, topic, difficulty, tags, source_type, summary')

    if (enhancedError) {
      console.error('Error fetching enhanced documents:', enhancedError)
      return false
    }

    if (!enhancedDocs || enhancedDocs.length === 0) {
      return true // Nothing to sync
    }

    // Group by title to count chunks
    const titleCounts: Record<string, { count: number; doc: any }> = {}
    enhancedDocs.forEach((doc: any) => {
      const title = doc.title
      if (!titleCounts[title]) {
        titleCounts[title] = { count: 0, doc }
      }
      titleCounts[title].count++
    })

    // Check which documents are missing from tracker
    const { data: trackerDocs, error: trackerError } = await client
      .from('document_tracker')
      .select('title')

    if (trackerError) {
      console.error('Error fetching tracker documents:', trackerError)
      return false
    }

    const trackerTitles = new Set(trackerDocs?.map((d: any) => d.title) || [])
    const missingDocs = Object.entries(titleCounts)
      .filter(([title]: [string, any]) => !trackerTitles.has(title))
      .map(([title, { count, doc }]: [string, { count: number; doc: any }]) => ({
        title,
        author: doc.author || 'Unknown',
        summary: doc.summary || '',
        type: doc.doc_type || 'Unknown',
        genre: doc.genre || 'Unknown',
        topic: doc.topic || '',
        difficulty: doc.difficulty || 'Intermediate',
        source_type: doc.source_type || 'Unknown',
        tags: doc.tags || '',
        chunks: count,
        upload_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      }))

    if (missingDocs.length > 0) {
      const { error: insertError } = await client
        .from('document_tracker')
        .insert(missingDocs)

      if (insertError) {
        console.error('Error inserting missing documents:', insertError)
        return false
      }
    }

    return true
  } catch (error) {
    console.error('Error syncing with enhanced table:', error)
    return false
  }
} 