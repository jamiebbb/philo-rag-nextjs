export interface Document {
  id: string
  title: string
  author?: string
  doc_type?: string
  genre?: string
  topic?: string
  difficulty?: string
  tags?: string
  source_type?: string
  summary?: string
  content: string
  metadata: Record<string, any>
  created_at: string
  updated_at?: string
  chunk_count?: number
  video_id?: string
  youtube_channel?: string
  source_url?: string
}

export interface DocumentChunk {
  id: string
  document_id?: string
  content: string
  metadata: Record<string, any>
  embedding?: number[]
  title?: string
  author?: string
  doc_type?: string
  genre?: string
  topic?: string
  difficulty?: string
  tags?: string
  source_type?: string
  summary?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  sources?: DocumentSource[]
  metadata?: Record<string, any>
  classification?: {
    type: string
    confidence: number
    reasoning: string
    contentFilter?: string
  }
  feedback?: {
    type: 'helpful' | 'not_helpful' | 'partial' | 'detailed'
    rating?: number
    comment?: string
    timestamp: Date
  }
}

export interface DocumentSource {
  title: string
  author?: string
  doc_type?: string
  content: string
  relevance_score?: number
  similarity?: number
  genre?: string
  topic?: string
  difficulty?: string
  page_number?: number
  chunk_id?: string
}

export interface UploadProgress {
  stage: 'uploading' | 'processing' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error' | 'analyzing' | 'cleaning'
  progress: number
  message: string
  details?: string
}

export interface VectorStoreInfo {
  status: 'enhanced' | 'standard' | 'failed' | 'loading'
  document_count: number
  chunk_count: number
  last_updated?: string
  error_message?: string
  stats?: {
    by_type: Record<string, number>
    by_difficulty: Record<string, number>
    by_source: Record<string, number>
  }
}

export interface DocumentMetadata {
  title: string
  author: string
  doc_type: string
  genre: string
  topic?: string
  difficulty?: string
  tags?: string
  source_type?: string
  description?: string
  summary?: string
  youtube_channel?: string
  video_id?: string
}

export interface YouTubeMetadata {
  video_id: string
  title: string
  author: string
  summary: string
  genre: string
  topic: string
  tags: string
  difficulty: string
  youtube_channel: string
  source_url: string
  source_type: 'youtube_video'
}

export interface ChunkPreview {
  index: number
  content: string
  length: number
}

export interface ChunkStats {
  total_chunks: number
  avg_length: number
  min_length: number
  max_length: number
  first_chunk: ChunkPreview
  last_chunk: ChunkPreview
  preview_chunks: ChunkPreview[]
  parsing_info: {
    total_parse_time: number
    parser_used: string
    files_metadata: any[]
  }
}

export interface FeedbackType {
  type: 'helpful' | 'not_helpful' | 'partial' | 'detailed'
  rating?: number
  comment?: string
  timestamp: Date
}

export interface DocumentFilter {
  type?: string
  difficulty?: string
  genre?: string
  source_type?: string
  author?: string
  search_query?: string
}

export interface DocumentStats {
  total: number
  total_chunks: number
  by_type: Record<string, number>
  by_difficulty: Record<string, number>
  by_source: Record<string, number>
  by_genre: Record<string, number>
}

export interface YouTubeVideoInfo {
  video_id: string
  title: string
  youtube_channel: string
  transcript?: string
  metadata?: YouTubeMetadata
}

export interface EnhancedSearchResult {
  documents: DocumentChunk[]
  stats: {
    total_found: number
    search_strategy: string
    metadata_matches: number
    semantic_matches: number
  }
} 