import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Supabase connection...')
    
    // Check environment variables first
    const envCheck = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
      supabaseUrlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
    }
    
    console.log('🔍 Environment check:', envCheck)
    
    if (!envCheck.hasSupabaseUrl || !envCheck.hasSupabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing required environment variables',
        envCheck,
        tests: {
          connection: { success: false, error: 'Environment variables missing' },
          documents: { success: false, error: 'Cannot test without proper config' },
          rpcFunction: { success: false, error: 'Cannot test without proper config' }
        }
      }, { status: 500 })
    }
    
    let supabase
    try {
      supabase = createServerSupabaseClient()
      console.log('✅ Supabase client created successfully')
    } catch (error) {
      console.error('❌ Failed to create Supabase client:', error)
      return NextResponse.json({
        success: false,
        error: 'Failed to create Supabase client',
        details: error instanceof Error ? error.message : 'Unknown error',
        envCheck
      }, { status: 500 })
    }
    
    // Test 1: Basic connection with simple query
    let connectionTest
    try {
      console.log('🔗 Testing basic connection...')
      const { data: testData, error: testError } = await supabase
        .from('documents_enhanced')
        .select('id')
        .limit(1)
      
      connectionTest = {
        success: !testError,
        error: testError?.message,
        data: testData
      }
      console.log('📊 Connection test result:', connectionTest)
    } catch (error) {
      connectionTest = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown connection error'
      }
      console.error('❌ Connection test failed:', error)
    }
    
    // Test 2: Get documents with better error handling
    let documentsTest
    try {
      console.log('📋 Testing document retrieval...')
      const { data: allDocs, error: allError } = await supabase
        .from('documents_enhanced')
        .select('id, title, author, doc_type, content, created_at')
        .limit(10)
      
      documentsTest = {
        success: !allError,
        error: allError?.message,
        count: allDocs?.length || 0,
        sample: allDocs?.slice(0, 3)?.map(doc => ({
          id: doc.id,
          title: doc.title,
          author: doc.author,
          type: doc.doc_type,
          contentLength: doc.content?.length,
          created: doc.created_at
        }))
      }
      console.log('📊 Documents test:', documentsTest)
    } catch (error) {
      documentsTest = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown documents error',
        count: 0
      }
      console.error('❌ Documents test failed:', error)
    }
    
    // Test 3: Test the RPC function (vector search)
    let rpcTest
    try {
      console.log('🔍 Testing RPC function...')
      const { data: rpcData, error: rpcError } = await supabase.rpc('match_documents_enhanced', {
        query_embedding: new Array(1536).fill(0.1), // OpenAI ada-002 embedding dimension
        match_threshold: 0.1,
        match_count: 5
      })
      
      rpcTest = {
        success: !rpcError,
        error: rpcError?.message,
        count: rpcData?.length || 0,
        sample: rpcData?.slice(0, 2)?.map((doc: any) => ({
          id: doc.id,
          title: doc.title,
          similarity: doc.similarity
        }))
      }
      console.log('📊 RPC test:', rpcTest)
    } catch (error) {
      rpcTest = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown RPC error',
        count: 0
      }
      console.error('❌ RPC test failed:', error)
    }
    
    const allTestsPassed = connectionTest.success && documentsTest.success && rpcTest.success
    
    return NextResponse.json({
      success: allTestsPassed,
      message: allTestsPassed ? 'All tests passed!' : 'Some tests failed',
      envCheck,
      tests: {
        connection: connectionTest,
        documents: documentsTest,
        rpcFunction: rpcTest
      },
      summary: {
        connectionWorking: connectionTest.success,
        documentsFound: documentsTest.count,
        vectorSearchWorking: rpcTest.success,
        troubleshooting: !allTestsPassed ? [
          !connectionTest.success && 'Check Supabase URL and service key',
          !documentsTest.success && 'Check if documents_enhanced table exists',
          !rpcTest.success && 'Check if match_documents_enhanced RPC function exists'
        ].filter(Boolean) : []
      }
    })
    
  } catch (error) {
    console.error('❌ Supabase test error:', error)
    return NextResponse.json({
      success: false,
      error: 'Test failed with exception',
      details: error instanceof Error ? error.message : 'Unknown error',
      troubleshooting: [
        'Check if environment variables are set correctly on Vercel',
        'Verify Supabase project is active and accessible',
        'Check if database schema matches expected structure'
      ]
    }, { status: 500 })
  }
} 