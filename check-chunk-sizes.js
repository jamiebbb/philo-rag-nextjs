// Check chunk sizes in the database
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeChunkSizes() {
  console.log('🔍 Analyzing chunk sizes in documents_enhanced table...\n');
  
  try {
    // Get all documents with content length analysis
    const { data: documents, error } = await supabase
      .from('documents_enhanced')
      .select('id, title, content, author, doc_type, chunk_id, total_chunks')
      .order('title');

    if (error) {
      console.error('Error fetching documents:', error);
      return;
    }

    if (!documents || documents.length === 0) {
      console.log('No documents found in the database.');
      return;
    }

    console.log(`📊 Found ${documents.length} chunks across all documents\n`);

    // Group by title/document
    const documentGroups = {};
    const chunkLengths = [];

    documents.forEach(doc => {
      const length = doc.content ? doc.content.length : 0;
      chunkLengths.push(length);
      
      if (!documentGroups[doc.title]) {
        documentGroups[doc.title] = {
          chunks: [],
          author: doc.author,
          doc_type: doc.doc_type,
          total_chunks: doc.total_chunks
        };
      }
      
      documentGroups[doc.title].chunks.push({
        chunk_id: doc.chunk_id,
        length: length,
        content_preview: doc.content ? doc.content.substring(0, 100) + '...' : 'No content'
      });
    });

    // Overall statistics
    const totalChunks = chunkLengths.length;
    const avgLength = Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / totalChunks);
    const minLength = Math.min(...chunkLengths);
    const maxLength = Math.max(...chunkLengths);
    const medianLength = chunkLengths.sort((a, b) => a - b)[Math.floor(totalChunks / 2)];

    console.log('📈 OVERALL CHUNK STATISTICS:');
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Average length: ${avgLength} characters`);
    console.log(`   Median length: ${medianLength} characters`);
    console.log(`   Min length: ${minLength} characters`);
    console.log(`   Max length: ${maxLength} characters`);
    console.log(`   Standard deviation: ${Math.round(Math.sqrt(chunkLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / totalChunks))}\n`);

    // Chunk size distribution
    const ranges = [
      { min: 0, max: 500, label: 'Very Small (0-500)' },
      { min: 501, max: 1000, label: 'Small (501-1000)' },
      { min: 1001, max: 2000, label: 'Medium (1001-2000)' },
      { min: 2001, max: 3000, label: 'Large (2001-3000)' },
      { min: 3001, max: 5000, label: 'Very Large (3001-5000)' },
      { min: 5001, max: Infinity, label: 'Huge (5000+)' }
    ];

    console.log('📊 CHUNK SIZE DISTRIBUTION:');
    ranges.forEach(range => {
      const count = chunkLengths.filter(len => len >= range.min && len <= range.max).length;
      const percentage = ((count / totalChunks) * 100).toFixed(1);
      console.log(`   ${range.label}: ${count} chunks (${percentage}%)`);
    });

    console.log('\n📚 DOCUMENTS BREAKDOWN:');
    Object.entries(documentGroups)
      .sort(([,a], [,b]) => b.chunks.length - a.chunks.length)
      .slice(0, 10) // Show top 10 documents
      .forEach(([title, info]) => {
        const lengths = info.chunks.map(c => c.length);
        const docAvg = Math.round(lengths.reduce((sum, len) => sum + len, 0) / lengths.length);
        const docMin = Math.min(...lengths);
        const docMax = Math.max(...lengths);
        
        console.log(`\n   📖 ${title}`);
        console.log(`      Author: ${info.author || 'Unknown'}`);
        console.log(`      Type: ${info.doc_type || 'Unknown'}`);
        console.log(`      Chunks: ${info.chunks.length}/${info.total_chunks || info.chunks.length}`);
        console.log(`      Avg chunk size: ${docAvg} chars`);
        console.log(`      Size range: ${docMin} - ${docMax} chars`);
        
        if (docMax - docMin > 2000) {
          console.log(`      ⚠️  HIGH VARIABILITY: Size difference of ${docMax - docMin} characters`);
        }
      });

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    
    if (maxLength > 4000) {
      console.log('   🔴 Some chunks are very large (>4000 chars) - consider re-chunking with smaller size');
    }
    
    if (minLength < 200) {
      console.log('   🔴 Some chunks are very small (<200 chars) - may lack context for good retrieval');
    }
    
    const variability = Math.sqrt(chunkLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / totalChunks);
    if (variability > 1000) {
      console.log('   🔴 High size variability detected - inconsistent chunking may hurt retrieval quality');
      console.log('   💡 Consider re-processing all documents with consistent chunk size (1000-1500 chars)');
    }
    
    console.log('\n✅ Analysis complete!');

  } catch (error) {
    console.error('❌ Error analyzing chunks:', error);
  }
}

analyzeChunkSizes(); 