import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Types for our database tables
export interface DatabaseDocument {
  id: string
  title: string
  author?: string
  doc_type?: string
  genre?: string
  content: string
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface DatabaseChunk {
  id: string
  document_id: string
  content: string
  metadata: Record<string, any>
  embedding?: number[]
  created_at: string
} 