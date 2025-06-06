const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('❌ Error generating embedding:', error);
    return new Array(1536).fill(0); // Fallback dummy embedding
  }
}

async function testHybridLogic() {
  try {
    console.log('🧪 TESTING HYBRID SEARCH LOGIC\n');
    
    const testQuery = 'how many people are in the senior leadership team at general motors?';
    console.log(`Test Query: "${testQuery}"`);
    
    // Step 1: Generate embedding (simulating the hybrid search)
    console.log('\n📊 Step 1: Generate embedding...');
    const queryEmbedding = await generateEmbedding(testQuery);
    console.log(`✅ Generated embedding of length: ${queryEmbedding.length}`);
    
    // Step 2: Vector search
    console.log('\n📊 Step 2: Vector similarity search...');
    let { data: vectorDocs, error: vectorError } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: queryEmbedding,
      match_threshold: 0.0,
      match_count: 10
    });

    if (vectorError) {
      console.error('❌ Vector search failed:', vectorError);
      vectorDocs = [];
    } else {
      console.log(`✅ Vector search found: ${vectorDocs?.length || 0} documents`);
      vectorDocs?.forEach((doc, i) => {
        console.log(`   ${i+1}. "${doc.title}" by ${doc.author} - Similarity: ${doc.similarity?.toFixed(3)}`);
      });
    }

    // Step 3: Extract search terms (simulating the hybrid search logic)
    console.log('\n📊 Step 3: Extract search terms...');
    const searchTerms = testQuery.toLowerCase().split(' ').filter(term => 
      term.length > 2 && !['the', 'and', 'how', 'many', 'what', 'who', 'where', 'when', 'why', 'are', 'is', 'at', 'in', 'on', 'for', 'to', 'of'].includes(term)
    );
    
    console.log(`Extracted terms: ${searchTerms.join(', ')}`);

    // Step 4: Metadata search
    console.log('\n📊 Step 4: Metadata search...');
    let metadataDocs = [];
    
    if (searchTerms.length > 0) {
      for (const term of searchTerms) {
        console.log(`\n🔍 Searching metadata for: "${term}"`);
        
        const { data: termDocs, error: termError } = await supabase
          .from('documents_enhanced')
          .select('*, similarity:1') // Add fake similarity for consistency
          .or(`title.ilike.%${term}%,author.ilike.%${term}%,topic.ilike.%${term}%,tags.ilike.%${term}%`)
          .limit(5);

        if (termError) {
          console.error(`❌ Error searching for "${term}":`, termError);
          continue;
        }

        if (termDocs && termDocs.length > 0) {
          console.log(`   Found ${termDocs.length} docs with "${term}" in metadata:`);
          termDocs.forEach((doc, i) => {
            console.log(`      ${i+1}. "${doc.title}" by ${doc.author}`);
          });
          metadataDocs.push(...termDocs);
        } else {
          console.log(`   No docs found with "${term}" in metadata`);
        }
      }
    }

    // Step 5: Combine and deduplicate (simulating the hybrid search logic)
    console.log('\n📊 Step 5: Combine and deduplicate results...');
    
    const allDocs = [...(vectorDocs || []), ...metadataDocs];
    console.log(`Total docs before deduplication: ${allDocs.length}`);
    
    const uniqueDocs = new Map();
    
    allDocs.forEach(doc => {
      const existingDoc = uniqueDocs.get(doc.id);
      if (!existingDoc || (doc.similarity || 0) > (existingDoc.similarity || 0)) {
        uniqueDocs.set(doc.id, {
          ...doc,
          search_method: vectorDocs?.some((vd) => vd.id === doc.id) ? 
            (metadataDocs.some((md) => md.id === doc.id) ? 'hybrid' : 'vector') : 
            'metadata'
        });
      }
    });

    const finalDocs = Array.from(uniqueDocs.values())
      .sort((a, b) => {
        const priorityA = a.search_method === 'hybrid' ? 3 : (a.search_method === 'vector' ? 2 : 1);
        const priorityB = b.search_method === 'hybrid' ? 3 : (b.search_method === 'vector' ? 2 : 1);
        
        if (priorityA !== priorityB) return priorityB - priorityA;
        return (b.similarity || 0) - (a.similarity || 0);
      })
      .slice(0, 5);

    console.log(`📊 FINAL HYBRID SEARCH RESULTS: ${finalDocs.length} documents`);
    finalDocs.forEach((doc, i) => {
      console.log(`   ${i+1}. "${doc.title}" by ${doc.author || 'Unknown'}`);
      console.log(`      Method: ${doc.search_method} | Similarity: ${doc.similarity?.toFixed(3) || 'N/A'}`);
      console.log(`      Content: ${doc.content?.substring(0, 100)}...`);
      console.log('');
    });

    // Step 6: Test if we found what we're looking for
    console.log('\n📊 Step 6: Analysis - Did we find General Motors content?');
    const gmFound = finalDocs.some(doc => 
      doc.title?.toLowerCase().includes('general motors') || 
      doc.author?.toLowerCase().includes('general motors') ||
      doc.content?.toLowerCase().includes('general motors')
    );
    
    const leadershipFound = finalDocs.some(doc => 
      doc.content?.toLowerCase().includes('leadership') ||
      doc.content?.toLowerCase().includes('senior') ||
      doc.content?.toLowerCase().includes('team')
    );

    console.log(`✅ General Motors content found: ${gmFound}`);
    console.log(`✅ Leadership content found: ${leadershipFound}`);
    
    if (gmFound && leadershipFound) {
      console.log('🎯 SUCCESS: Hybrid search should work for the General Motors query!');
    } else if (gmFound || leadershipFound) {
      console.log('⚠️  PARTIAL: Some relevant content found, but not complete match');
    } else {
      console.log('❌ ISSUE: No relevant content found - may need more data or different search strategy');
    }

  } catch (error) {
    console.error('❌ Error testing hybrid logic:', error);
  }
}

testHybridLogic(); 