const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  console.log('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testFeedbackTable() {
  try {
    console.log('🧪 Testing feedback table...')
    
    // Test if table exists by trying to fetch from it
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .limit(1)
    
    if (error) {
      console.error('❌ Feedback table error:', error.message)
      
      if (error.message.includes('relation "public.feedback" does not exist')) {
        console.log('\n📋 You need to create the feedback table!')
        console.log('Run this command in your Supabase SQL Editor:')
        console.log('-----------------------------------------------')
        console.log('CREATE TABLE feedback (')
        console.log('  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,')
        console.log('  user_query TEXT NOT NULL,')
        console.log('  ai_response TEXT NOT NULL,')
        console.log('  feedback_type VARCHAR(20) NOT NULL,')
        console.log('  chat_id UUID,')
        console.log('  rating INTEGER,')
        console.log('  comment TEXT,')
        console.log('  query_embedding VECTOR(1536),')
        console.log('  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()')
        console.log(');')
        console.log('-----------------------------------------------')
      }
      return false
    }
    
    console.log('✅ Feedback table exists!')
    
    // Test inserting a feedback entry
    const testFeedback = {
      user_query: 'Test query',
      ai_response: 'Test response',
      feedback_type: 'helpful',
      chat_id: 'test-chat-id'
    }
    
    const { error: insertError } = await supabase
      .from('feedback')
      .insert(testFeedback)
    
    if (insertError) {
      console.error('❌ Insert test failed:', insertError.message)
      return false
    }
    
    console.log('✅ Feedback insertion works!')
    
    // Clean up the test entry
    await supabase
      .from('feedback')
      .delete()
      .eq('chat_id', 'test-chat-id')
    
    console.log('✅ Feedback system is fully operational!')
    return true
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    return false
  }
}

testFeedbackTable() 