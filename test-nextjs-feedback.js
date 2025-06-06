// Test script for Next.js feedback API
const fetch = require('node-fetch');

async function testFeedbackAPI() {
  console.log('🧪 Testing Next.js Feedback API...')
  
  // Test the feedback test endpoint
  try {
    console.log('\n1. Testing feedback table connection...')
    
    const testResponse = await fetch('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'test'
      })
    })

    const testData = await testResponse.json()
    console.log('Test response:', testData)

    if (testData.success) {
      console.log('✅ Feedback table connection test passed!')
    } else {
      console.log('❌ Feedback table connection test failed:', testData.error)
      if (testData.needsSetup) {
        console.log('\n📋 Feedback table needs setup! The Streamlit schema should be:')
        console.log('CREATE TABLE feedback (')
        console.log('  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),')
        console.log('  query TEXT NOT NULL,')
        console.log('  response TEXT NOT NULL,')
        console.log('  feedback TEXT NOT NULL,')
        console.log('  metadata JSONB,')
        console.log('  user_id TEXT,')
        console.log('  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()')
        console.log(');')
      }
      return
    }

    // Test storing actual feedback
    console.log('\n2. Testing feedback storage...')
    
    const storeResponse = await fetch('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'store',
        userQuery: 'Test question about philosophy',
        aiResponse: 'Test AI response about philosophical concepts',
        feedbackType: 'helpful',
        chatId: 'test-chat-123',
        rating: null,
        comment: null
      })
    })

    const storeData = await storeResponse.json()
    console.log('Store response:', storeData)

    if (storeData.success) {
      console.log('✅ Feedback storage test passed!')
    } else {
      console.log('❌ Feedback storage test failed:', storeData.error)
    }

    // Test storing detailed feedback
    console.log('\n3. Testing detailed feedback storage...')
    
    const detailedResponse = await fetch('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'store',
        userQuery: 'Another test question',
        aiResponse: 'Another test response',
        feedbackType: 'detailed',
        chatId: 'test-chat-456',
        rating: 4,
        comment: 'This response was helpful but could be more detailed'
      })
    })

    const detailedData = await detailedResponse.json()
    console.log('Detailed response:', detailedData)

    if (detailedData.success) {
      console.log('✅ Detailed feedback storage test passed!')
    } else {
      console.log('❌ Detailed feedback storage test failed:', detailedData.error)
    }

    console.log('\n🎉 All feedback tests completed!')

  } catch (error) {
    console.error('❌ Test error:', error.message)
    console.log('\n💡 Make sure the Next.js dev server is running on localhost:3000')
    console.log('Run: npm run dev')
  }
}

// Run the test
testFeedbackAPI() 