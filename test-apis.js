const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAPIs() {
  console.log('Testing APIs...\n');

  // Test 1: Vector Store Status
  try {
    console.log('1. Testing Vector Store Status...');
    const response = await axios.get(`${BASE_URL}/api/vector-store/status`);
    console.log('✅ Vector Store Status:', response.data);
  } catch (error) {
    console.log('❌ Vector Store Status failed:', error.response?.data || error.message);
  }

  // Test 2: SUPADATA API Key Check
  try {
    console.log('\n2. Testing SUPADATA API (YouTube Transcript)...');
    const response = await axios.post(`${BASE_URL}/api/youtube/process`, {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Test Video',
      author: 'Test Author',
      summary: 'Test Summary',
      genre: 'Music',
      topic: 'Entertainment',
      tags: 'test, music',
      difficulty: 'Beginner'
    });
    console.log('✅ YouTube Processing:', response.data);
  } catch (error) {
    console.log('❌ YouTube Processing failed:', error.response?.data || error.message);
  }

  console.log('\nDone testing!');
}

testAPIs().catch(console.error); 