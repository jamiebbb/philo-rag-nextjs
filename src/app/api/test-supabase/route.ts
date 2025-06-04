import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Supabase connection...')
    
    const supabase = createServerSupabaseClient()
    
    // Test 1: Basic connection
    const { data: testData, error: testError } = await supabase
      .from('documents_enhanced')
      .select('count(*)')
      .single()
    
    console.log('📊 Test connection result:', { testData, testError })
    
    // Test 2: Get all documents
    const { data: allDocs, error: allError } = await supabase
      .from('documents_enhanced')
      .select('id, title, author, doc_type, content')
      .limit(10)
    
    console.log('📊 All documents:', { count: allDocs?.length, error: allError })
    
    // Test 3: Test the RPC function
    const { data: rpcTest, error: rpcError } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: new Array(1536).fill(0),
      match_threshold: 0.1,
      match_count: 5
    })
    
    console.log('📊 RPC test:', { count: rpcTest?.length, error: rpcError })
    
    return NextResponse.json({
      success: true,
      tests: {
        connection: {
          success: !testError,
          error: testError?.message,
          data: testData
        },
        documents: {
          success: !allError,
          error: allError?.message,
          count: allDocs?.length || 0,
          sample: allDocs?.slice(0, 3)?.map(doc => ({
            id: doc.id,
            title: doc.title,
            author: doc.author,
            type: doc.doc_type,
            contentLength: doc.content?.length
          }))
        },
        rpcFunction: {
          success: !rpcError,
          error: rpcError?.message,
          count: rpcTest?.length || 0
        }
      }
    })
    
  } catch (error) {
    console.error('❌ Supabase test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 