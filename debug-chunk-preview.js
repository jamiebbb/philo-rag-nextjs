// Debug chunk preview API
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function testChunkPreview() {
  console.log('Testing chunk preview API...');
  
  // Create a simple test text file to simulate PDF content
  const testText = `
This is a test document that will be used to test the chunk preview functionality.
This text simulates what would be extracted from a PDF document.

The purpose of this test is to verify that the text splitting and chunk generation
is working correctly in the preview API endpoint.

We want to make sure that:
1. The text is properly split into chunks
2. Statistics are calculated correctly
3. The preview shows the first and last chunks
4. All chunks are included in the response

This should generate multiple chunks based on the chunk size settings.
The system should be able to handle this test content and return meaningful
statistics about how the content would be chunked.
  `.trim();

  try {
    const response = await axios.post('http://localhost:3000/api/test-preview');
    console.log('✅ Test preview API response:', response.data);
    
    const chunkStats = response.data.chunkStats;
    console.log('\nChunk Statistics:');
    console.log('- Total chunks:', chunkStats.total_chunks);
    console.log('- Average length:', chunkStats.avg_length);
    console.log('- Min length:', chunkStats.min_length);
    console.log('- Max length:', chunkStats.max_length);
    console.log('- First chunk preview:', chunkStats.first_chunk.content.substring(0, 100) + '...');
    console.log('- Last chunk preview:', chunkStats.last_chunk.content.substring(0, 100) + '...');
    
  } catch (error) {
    console.error('❌ Error testing chunk preview:', error.response?.data || error.message);
  }
}

testChunkPreview(); 