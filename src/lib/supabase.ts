import { createClient } from '@supabase/supabase-js'

// Client-side Supabase (safe for browser)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Only throw errors if we're not in build mode
const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.VERCEL

if (!supabaseUrl && !isBuildTime) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}

if (!supabaseAnonKey && !isBuildTime) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

// Client-side Supabase client (for browser/React components)
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null

// Server-side Supabase client (for API routes only)
export const createServerSupabaseClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  
  if (!serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_KEY environment variable')
  }
  
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }
  
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

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