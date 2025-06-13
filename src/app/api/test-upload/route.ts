import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Testing Supabase upload...')
    
    // Get server-side Supabase client
    const supabase = createServerSupabaseClient()
    
    // Test 1: Check connection
    console.log('🔗 Testing Supabase connection...')
    const { data: connectionTest, error: connectionError } = await supabase
      .from('documents_enhanced')
      .select('count(*)')
      .limit(1)
    
    if (connectionError) {
      console.error('❌ Supabase connection failed:', connectionError)
      return NextResponse.json({ 
        success: false, 
        error: 'Supabase connection failed',
        details: connectionError
      }, { status: 500 })
    }
    
    console.log('✅ Supabase connection successful')
    
    // Test 2: Check table schema
    console.log('📋 Checking table schema...')
    const { data: schemaTest, error: schemaError } = await supabase
      .from('documents_enhanced')
      .select('*')
      .limit(1)
    
    if (schemaError) {
      console.error('❌ Schema check failed:', schemaError)
      return NextResponse.json({ 
        success: false, 
        error: 'Schema check failed',
        details: schemaError
      }, { status: 500 })
    }
    
    console.log('✅ Table schema accessible')
    
    // Test 3: Try a minimal insert
    console.log('💾 Testing minimal insert...')
    const testId = `test_${Date.now()}`
    const testContent = 'This is a test chunk for debugging upload issues.'
    
    // Generate test embedding
    console.log('🔮 Generating test embedding...')
    const testEmbedding = await generateEmbedding(testContent)
    console.log('✅ Test embedding generated, length:', testEmbedding.length)
    
    const testData = {
      id: testId,
      content: testContent,
      metadata: {
        title: 'Test Document',
        author: 'Test Author',
        source_type: 'test',
        test_insert: true
      },
      embedding: testEmbedding,
      title: 'Test Document',
      author: 'Test Author',
      doc_type: 'Test',
      genre: 'Test',
      topic: 'Testing',
      difficulty: 'Beginner',
      tags: 'test, debug',
      source_type: 'test',
      summary: 'Test document for debugging',
      chunk_id: 1,
      total_chunks: 1,
      source: 'Test Upload'
    }
    
    console.log('📊 Test data prepared:', {
      id: testData.id,
      contentLength: testData.content.length,
      embeddingLength: testData.embedding.length,
      metadataKeys: Object.keys(testData.metadata)
    })
    
    const { data: insertResult, error: insertError } = await supabase
      .from('documents_enhanced')
      .insert(testData)
      .select('id, title, chunk_id')
    
    if (insertError) {
      console.error('❌ Test insert failed:', insertError)
      return NextResponse.json({ 
        success: false, 
        error: 'Test insert failed',
        details: insertError,
        testData: {
          keys: Object.keys(testData),
          contentLength: testData.content.length,
          embeddingLength: testData.embedding.length
        }
      }, { status: 500 })
    }
    
    console.log('✅ Test insert successful:', insertResult)
    
    // Test 4: Clean up test data
    console.log('🧹 Cleaning up test data...')
    await supabase
      .from('documents_enhanced')
      .delete()
      .eq('id', testId)
    
    return NextResponse.json({
      success: true,
      message: 'All Supabase tests passed!',
      tests: {
        connection: '✅ Connected',
        schema: '✅ Accessible',
        insert: '✅ Successful',
        cleanup: '✅ Completed'
      },
      insertResult: insertResult
    })
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 