const pdf = require('pdf-parse');
const fs = require('fs');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

async function testChunkPreview() {
  console.log('🔍 Testing chunk preview functionality...');
  
  try {
    // Create test text to simulate PDF extraction
    const testText = `
This is a comprehensive test document for the chunk preview functionality.
The document contains multiple paragraphs and sections to test how the text
splitter handles different types of content.

Section 1: Introduction
This section introduces the main concepts that will be covered in the document.
We want to ensure that the chunking algorithm properly handles section breaks
and maintains context between related paragraphs.

Section 2: Methodology  
Here we describe the approach taken to solve the problem. The methodology
includes several steps that must be followed in sequence to achieve the
desired outcome. Each step builds upon the previous one.

Section 3: Results
The results show significant improvements in performance and accuracy.
Multiple metrics were used to evaluate the effectiveness of the approach.
The data clearly demonstrates the value of the proposed solution.

Section 4: Conclusion
In conclusion, this document demonstrates the proper functioning of the
chunk preview system. The text has been successfully split into manageable
pieces while maintaining semantic coherence.
    `.trim();

    console.log('📝 Test text length:', testText.length, 'characters');

    // Test with different chunk sizes
    const testSettings = [
      { chunkSize: 400, chunkOverlap: 100 },
      { chunkSize: 800, chunkOverlap: 200 },
      { chunkSize: 1000, chunkOverlap: 200 }
    ];

    for (const settings of testSettings) {
      console.log(`\n🔧 Testing with chunk size: ${settings.chunkSize}, overlap: ${settings.chunkOverlap}`);
      
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: settings.chunkSize,
        chunkOverlap: settings.chunkOverlap,
      });

      const chunks = await textSplitter.splitText(testText);
      console.log(`✅ Created ${chunks.length} chunks`);

      if (chunks.length > 0) {
        const chunkLengths = chunks.map(chunk => chunk.length);
        const avgLength = Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / chunks.length);
        const minLength = Math.min(...chunkLengths);
        const maxLength = Math.max(...chunkLengths);

        console.log(`📊 Statistics: avg=${avgLength}, min=${minLength}, max=${maxLength}`);
        console.log(`📄 First chunk (${chunks[0].length} chars): "${chunks[0].substring(0, 100)}..."`);
        console.log(`📄 Last chunk (${chunks[chunks.length - 1].length} chars): "${chunks[chunks.length - 1].substring(0, 100)}..."`);
      }
    }

    console.log('\n✅ Chunk preview test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in chunk preview test:', error);
    console.error('❌ Error details:', error.message);
  }
}

// Run the test
testChunkPreview(); 