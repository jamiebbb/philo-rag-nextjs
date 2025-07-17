import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Running diagnostic checks...')
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
        hasOpenaiApiKey: !!process.env.OPENAI_API_KEY,
        supabaseUrlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20) + '...',
      },
      tests: {
        supabaseConnection: 'Not tested',
        supabaseQuery: 'Not tested',
        openaiConnection: 'Not tested'
      }
    }

    // Test 1: Supabase connection
    try {
      console.log('🔗 Testing Supabase connection...')
      const supabase = createServerSupabaseClient()
      
      const { data, error } = await supabase
        .from('documents_enhanced')
        .select('count')
        .limit(1)
      
      if (error) {
        diagnostics.tests.supabaseConnection = `❌ Error: ${error.message}`
      } else {
        diagnostics.tests.supabaseConnection = '✅ Connected'
        diagnostics.tests.supabaseQuery = '✅ Query successful'
      }
    } catch (error) {
      diagnostics.tests.supabaseConnection = `❌ Exception: ${error instanceof Error ? error.message : 'Unknown error'}`
    }

    // Test 2: OpenAI connection (simple check)
    try {
      if (process.env.OPENAI_API_KEY) {
        diagnostics.tests.openaiConnection = '✅ API key present'
      } else {
        diagnostics.tests.openaiConnection = '❌ API key missing'
      }
    } catch (error) {
      diagnostics.tests.openaiConnection = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }

    console.log('🔍 Diagnostic results:', diagnostics)

    return NextResponse.json({
      success: true,
      diagnostics
    })

  } catch (error) {
    console.error('❌ Diagnostic failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 