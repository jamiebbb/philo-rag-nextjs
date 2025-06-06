const { createClient } = require('@supabase/supabase-js');

async function testFeedbackSystem() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    console.log('🧪 TESTING FEEDBACK SYSTEM\n');

    // Step 1: Check if feedback table exists and what its schema is
    console.log('📊 Step 1: Check feedback table schema...');
    
    try {
      const { data: tableInfo, error: schemaError } = await supabase
        .from('feedback')
        .select('*')
        .limit(1);

      if (schemaError) {
        console.error('❌ Feedback table does not exist or has permission issues:', schemaError);
        console.log('\n🔧 You need to create the feedback table. Run this SQL in Supabase:');
        console.log(`
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_query TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful', 'not_helpful', 'partial', 'detailed')),
    chat_id TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    query_embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX feedback_feedback_type_idx ON feedback (feedback_type);
CREATE INDEX feedback_chat_id_idx ON feedback (chat_id);
CREATE INDEX feedback_created_at_idx ON feedback (created_at);
        `);
        return;
      }

      console.log('✅ Feedback table exists');
      console.log(`   Sample data count: ${tableInfo?.length || 0}`);
      
      if (tableInfo && tableInfo.length > 0) {
        console.log('   Sample columns:', Object.keys(tableInfo[0]));
      }

    } catch (error) {
      console.error('❌ Error checking feedback table:', error);
      return;
    }

    // Step 2: Test inserting feedback
    console.log('\n📊 Step 2: Test inserting feedback...');
    
    const testFeedback = {
      user_query: 'Test query about General Motors',
      ai_response: 'Test response about General Motors leadership',
      feedback_type: 'helpful',
      chat_id: 'test-chat-123',
      rating: null,
      comment: null
    };

    const { data: insertData, error: insertError } = await supabase
      .from('feedback')
      .insert(testFeedback)
      .select();

    if (insertError) {
      console.error('❌ Error inserting feedback:', insertError);
      console.log('   This might be due to schema mismatch. Current schema expects:');
      console.log('   - user_query (TEXT)');
      console.log('   - ai_response (TEXT)');
      console.log('   - feedback_type (TEXT)');
      console.log('   - chat_id (TEXT)');
      console.log('   - rating (INTEGER)');
      console.log('   - comment (TEXT)');
    } else {
      console.log('✅ Successfully inserted test feedback');
      console.log(`   Inserted record ID: ${insertData[0]?.id}`);
      
      // Clean up test record
      if (insertData[0]?.id) {
        await supabase
          .from('feedback')
          .delete()
          .eq('id', insertData[0].id);
        console.log('   🧹 Cleaned up test record');
      }
    }

    // Step 3: Test feedback retrieval
    console.log('\n📊 Step 3: Test feedback retrieval...');
    
    const { data: allFeedback, error: retrieveError } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (retrieveError) {
      console.error('❌ Error retrieving feedback:', retrieveError);
    } else {
      console.log(`✅ Retrieved ${allFeedback.length} feedback records`);
      allFeedback.forEach((feedback, i) => {
        console.log(`   ${i+1}. Type: ${feedback.feedback_type} | Query: ${feedback.user_query?.substring(0, 50)}...`);
      });
    }

    // Step 4: Test the feedback functions from the library
    console.log('\n📊 Step 4: Test feedback library functions...');
    
    // Simulate what the storeFeedback function does
    try {
      const feedbackData = {
        user_query: 'How many people work at General Motors?',
        ai_response: 'Based on the retrieved documents, General Motors employs approximately 157,000 people globally.',
        feedback_type: 'helpful',
        chat_id: 'test-chat-456',
        created_at: new Date().toISOString()
      };

      const { error: libTestError } = await supabase
        .from('feedback')
        .insert(feedbackData);

      if (libTestError) {
        console.error('❌ Library-style feedback insert failed:', libTestError);
      } else {
        console.log('✅ Library-style feedback insert successful');
        
        // Clean up
        await supabase
          .from('feedback')
          .delete()
          .eq('chat_id', 'test-chat-456');
        console.log('   🧹 Cleaned up test record');
      }

    } catch (error) {
      console.error('❌ Error testing library functions:', error);
    }

    // Step 5: Check for any existing feedback
    console.log('\n📊 Step 5: Check existing feedback data...');
    
    const { count } = await supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true });
    
    console.log(`   Total feedback records in database: ${count}`);

    if (count > 0) {
      const { data: recentFeedback } = await supabase
        .from('feedback')
        .select('feedback_type, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      console.log('   Recent feedback:');
      recentFeedback?.forEach((feedback, i) => {
        console.log(`      ${i+1}. ${feedback.feedback_type} (${new Date(feedback.created_at).toLocaleDateString()})`);
      });
    }

    console.log('\n🎯 SUMMARY:');
    console.log('   ✅ Feedback table schema check');
    console.log('   ✅ Feedback insertion test');
    console.log('   ✅ Feedback retrieval test');
    console.log('   ✅ Library compatibility test');
    console.log('\n   If all tests passed, the feedback system should be working!');
    console.log('   If any failed, check the error messages above for troubleshooting.');

  } catch (error) {
    console.error('❌ Error testing feedback system:', error);
  }
}

testFeedbackSystem(); 