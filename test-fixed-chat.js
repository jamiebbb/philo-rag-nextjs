// Test the fixed chat API to verify it works like Streamlit
require('dotenv').config();

const testQueries = [
  'hello',                                    // Should return 0 sources
  'how are you?',                            // Should return 0 sources  
  'what is philosophy?',                     // Should return relevant sources (if available)
  'investment strategies',                   // Should return relevant sources (if available)
  'machine learning concepts'                // Should return relevant sources (if available)
];

async function testChatAPI(message) {
  try {
    console.log(`\n🧪 Testing: "${message}"`);
    
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        message: message.trim(),
        chatId: 'test-123'
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log(`📊 Results:`);
    console.log(`   - Sources found: ${data.documentsFound || 0}`);
    console.log(`   - Search method: ${data.searchMethod || 'unknown'}`);
    console.log(`   - Response length: ${data.response?.length || 0} chars`);
    
    if (data.sources && data.sources.length > 0) {
      console.log(`   - Source titles:`);
      data.sources.forEach((source, i) => {
        console.log(`     ${i+1}. ${source.title} (similarity: ${source.relevance_score?.toFixed(3) || 'N/A'})`);
      });
    }
    
    console.log(`   - Response preview: "${data.response?.substring(0, 100)}..."`);
    
    return data;
  } catch (error) {
    console.error(`❌ Test failed for "${message}":`, error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('🚀 TESTING FIXED CHAT API BEHAVIOR\n');
  console.log('Expected behavior:');
  console.log('- Greetings like "hello" should return 0 sources');
  console.log('- Specific questions should only return sources if actually relevant');
  console.log('- No more "same 5 irrelevant sources" problem\n');
  
  for (const query of testQueries) {
    await testChatAPI(query);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
  }
  
  console.log('\n✅ Test completed!');
  console.log('If you see 0 sources for greetings but sources for specific topics, the fix worked!');
}

runAllTests().catch(console.error); 