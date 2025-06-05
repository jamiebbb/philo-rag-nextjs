const { createClient } = require('@supabase/supabase-js');

async function checkFullDatabase() {
  console.log('🔍 Checking actual database contents...');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  try {
    // Get total count
    const { count, error: countError } = await supabase
      .from('documents_enhanced')
      .select('*', { count: 'exact', head: true });
    
    console.log('📊 Total documents in database:', count);
    
    if (countError) {
      console.error('❌ Count error:', countError);
      return;
    }
    
    // Get all documents with key info
    const { data: allDocs, error } = await supabase
      .from('documents_enhanced')
      .select('id, title, author, doc_type, created_at, embedding')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('❌ Error fetching documents:', error);
      return;
    }
    
    console.log('\n📚 All documents in database:');
    console.log('=====================================');
    
    const uniqueTitles = new Map();
    const documentsWithoutEmbeddings = [];
    
    allDocs.forEach((doc, i) => {
      const hasEmbedding = doc.embedding && doc.embedding.length > 0;
      const status = hasEmbedding ? '✅' : '❌';
      
      console.log(`${i+1}. ${status} ${doc.title} (${doc.doc_type}) - ${doc.author || 'No author'}`);
      
      // Track unique titles
      if (!uniqueTitles.has(doc.title)) {
        uniqueTitles.set(doc.title, { count: 1, hasEmbedding, type: doc.doc_type });
      } else {
        const existing = uniqueTitles.get(doc.title);
        existing.count += 1;
        if (hasEmbedding) existing.hasEmbedding = true;
      }
      
      // Track documents without embeddings
      if (!hasEmbedding) {
        documentsWithoutEmbeddings.push(doc);
      }
    });
    
    console.log('\n📊 Summary:');
    console.log('=============');
    console.log(`Total chunks: ${allDocs.length}`);
    console.log(`Unique titles: ${uniqueTitles.size}`);
    console.log(`Chunks without embeddings: ${documentsWithoutEmbeddings.length}`);
    
    console.log('\n📖 Unique Books/Documents:');
    console.log('============================');
    let bookIndex = 1;
    for (const [title, info] of uniqueTitles) {
      const embeddingStatus = info.hasEmbedding ? '✅' : '❌';
      console.log(`${bookIndex}. ${embeddingStatus} ${title} (${info.count} chunks, ${info.type})`);
      bookIndex++;
    }
    
    if (documentsWithoutEmbeddings.length > 0) {
      console.log('\n⚠️ Documents missing embeddings:');
      console.log('==================================');
      documentsWithoutEmbeddings.forEach((doc, i) => {
        console.log(`${i+1}. ${doc.title} (ID: ${doc.id})`);
      });
    }
    
    // Test vector search with different parameters
    console.log('\n🔍 Testing vector search retrieval:');
    console.log('====================================');
    
    const testEmbedding = new Array(1536).fill(0.1);
    
    // Test with very low threshold
    const { data: searchResults, error: searchError } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: testEmbedding,
      match_threshold: 0.1,
      match_count: 20
    });
    
    if (searchError) {
      console.error('❌ Vector search error:', searchError);
    } else {
      console.log(`Found ${searchResults.length} results with threshold 0.1:`);
      const uniqueSearchTitles = [...new Set(searchResults.map(r => r.title))];
      uniqueSearchTitles.forEach((title, i) => {
        console.log(`${i+1}. ${title}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  }
}

checkFullDatabase(); 