const { createClient } = require('@supabase/supabase-js');

async function testHybridSearch() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    console.log('🔍 Testing Hybrid Search for General Motors Senior Leadership Team\n');

    const testQuery = 'how many people are in the senior leadership team at general motors?';
    console.log(`Test Query: "${testQuery}"\n`);

    // Step 1: Check what's in the database for General Motors
    console.log('📊 Step 1: Checking what General Motors content exists...');
    const { data: gmDocs } = await supabase
      .from('documents_enhanced')
      .select('id, title, author, topic, content')
      .or('title.ilike.%general motors%,author.ilike.%general motors%,topic.ilike.%general motors%,content.ilike.%general motors%');

    console.log(`Found ${gmDocs?.length || 0} documents containing "General Motors"`);
    gmDocs?.forEach((doc, i) => {
      console.log(`   ${i+1}. Title: "${doc.title}" | Author: "${doc.author}" | Topic: "${doc.topic}"`);
      console.log(`      Content preview: ${doc.content?.substring(0, 100)}...`);
    });

    // Step 2: Test metadata search specifically
    console.log('\n📊 Step 2: Testing direct metadata search...');
    const searchTerms = ['general', 'motors', 'senior', 'leadership', 'team'];
    
    for (const term of searchTerms) {
      const { data: metadataDocs } = await supabase
        .from('documents_enhanced')
        .select('id, title, author, topic, tags')
        .or(`title.ilike.%${term}%,author.ilike.%${term}%,topic.ilike.%${term}%,tags.ilike.%${term}%`)
        .limit(3);

      console.log(`   Term "${term}": Found ${metadataDocs?.length || 0} docs in metadata`);
      metadataDocs?.forEach(doc => {
        console.log(`      - "${doc.title}" by ${doc.author || 'Unknown'}`);
      });
    }

    // Step 3: Test the actual vector search function that would be used
    console.log('\n📊 Step 3: Testing vector search function...');
    
    // We can't easily test the embedding generation here, but we can check the RPC function exists
    const { data: rpcTest, error: rpcError } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: new Array(1536).fill(0), // Dummy embedding
      match_threshold: 0.0,
      match_count: 3
    });

    if (rpcError) {
      console.log(`   ❌ RPC function error: ${rpcError.message}`);
    } else {
      console.log(`   ✅ RPC function works, returned ${rpcTest?.length || 0} documents`);
    }

    // Step 4: Check if we have any leadership/management related content
    console.log('\n📊 Step 4: Checking for leadership/management content...');
    const { data: leadershipDocs } = await supabase
      .from('documents_enhanced')
      .select('id, title, author, content')
      .or('content.ilike.%leadership%,content.ilike.%senior%,content.ilike.%management%,content.ilike.%executive%,content.ilike.%team%')
      .limit(5);

    console.log(`Found ${leadershipDocs?.length || 0} documents with leadership-related content`);
    leadershipDocs?.forEach((doc, i) => {
      console.log(`   ${i+1}. "${doc.title}" by ${doc.author || 'Unknown'}`);
      
      // Show context around leadership terms
      const content = doc.content || '';
      const terms = ['leadership', 'senior', 'management', 'executive', 'team'];
      
      for (const term of terms) {
        const index = content.toLowerCase().indexOf(term);
        if (index !== -1) {
          const start = Math.max(0, index - 50);
          const end = Math.min(content.length, index + 100);
          const snippet = content.substring(start, end);
          console.log(`      Context for "${term}": ...${snippet}...`);
          break; // Show only first match
        }
      }
    });

    // Step 5: Test the exact scenario
    console.log('\n📊 Step 5: Simulating hybrid search scenario...');
    
    // Simulate what would happen with our hybrid search
    const queryTerms = ['general', 'motors', 'senior', 'leadership', 'team'];
    const relevantTerms = queryTerms.filter(term => 
      term.length > 2 && !['the', 'and', 'how', 'many', 'what', 'who', 'where', 'when', 'why', 'are', 'is', 'at', 'in', 'on', 'for', 'to', 'of'].includes(term)
    );

    console.log(`Extracted search terms: ${relevantTerms.join(', ')}`);

    let allMetadataMatches = [];
    for (const term of relevantTerms) {
      const { data: matches } = await supabase
        .from('documents_enhanced')
        .select('id, title, author, topic, tags, content')
        .or(`title.ilike.%${term}%,author.ilike.%${term}%,topic.ilike.%${term}%,tags.ilike.%${term}%`)
        .limit(5);

      if (matches && matches.length > 0) {
        console.log(`   Term "${term}" found in:`);
        matches.forEach(match => {
          console.log(`      - "${match.title}" (${match.author || 'Unknown'})`);
        });
        allMetadataMatches.push(...matches);
      }
    }

    // Deduplicate
    const uniqueMatches = new Map();
    allMetadataMatches.forEach(doc => {
      uniqueMatches.set(doc.id, doc);
    });

    console.log(`\n🎯 HYBRID SEARCH SIMULATION RESULTS:`);
    console.log(`   Total unique documents that would be found: ${uniqueMatches.size}`);
    
    Array.from(uniqueMatches.values()).forEach((doc, i) => {
      console.log(`   ${i+1}. "${doc.title}" by ${doc.author || 'Unknown'}`);
      console.log(`      Topic: ${doc.topic || 'N/A'}`);
      console.log(`      Content preview: ${doc.content?.substring(0, 150)}...`);
    });

  } catch (error) {
    console.error('❌ Error testing hybrid search:', error);
  }
}

testHybridSearch(); 