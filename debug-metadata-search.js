const { createClient } = require('@supabase/supabase-js');

async function debugMetadataSearch() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    console.log('🔍 DEBUGGING METADATA SEARCH\n');

    // First, let's see what data we have
    console.log('📊 Step 1: Check database structure and sample data');
    const { data: sampleDocs, error: sampleError } = await supabase
      .from('documents_enhanced')
      .select('id, title, author, topic, tags, content')
      .limit(5);

    if (sampleError) {
      console.error('❌ Error fetching sample data:', sampleError);
      return;
    }

    console.log(`Found ${sampleDocs?.length || 0} sample documents:`);
    sampleDocs?.forEach((doc, i) => {
      console.log(`   ${i+1}. ID: ${doc.id}`);
      console.log(`      Title: "${doc.title}"`);
      console.log(`      Author: "${doc.author}"`);
      console.log(`      Topic: "${doc.topic}"`);
      console.log(`      Tags: "${doc.tags}"`);
      console.log(`      Content: ${doc.content?.substring(0, 100)}...`);
      console.log('');
    });

    // Test the exact metadata search from hybrid search
    console.log('📊 Step 2: Test metadata search for General Motors terms');
    const testTerms = ['general', 'motors'];
    
    for (const term of testTerms) {
      console.log(`\n🔍 Testing term: "${term}"`);
      
      const { data: metadataDocs, error: metadataError } = await supabase
        .from('documents_enhanced')
        .select('id, title, author, topic, tags, content')
        .or(`title.ilike.%${term}%,author.ilike.%${term}%,topic.ilike.%${term}%,tags.ilike.%${term}%`)
        .limit(10);

      if (metadataError) {
        console.error(`❌ Error searching for "${term}":`, metadataError);
        continue;
      }

      console.log(`   Found ${metadataDocs?.length || 0} documents containing "${term}"`);
      metadataDocs?.forEach((doc, i) => {
        console.log(`      ${i+1}. "${doc.title}" by ${doc.author || 'Unknown'}`);
        console.log(`         Topic: ${doc.topic}, Tags: ${doc.tags}`);
        console.log(`         Content: ${doc.content?.substring(0, 80)}...`);
      });
    }

    // Test a broader search
    console.log('\n📊 Step 3: Test broader company searches');
    const companyTerms = ['gm', 'general', 'motors', 'company', 'corporation'];
    
    for (const term of companyTerms) {
      const { data: docs, error } = await supabase
        .from('documents_enhanced')
        .select('id, title, author')
        .or(`title.ilike.%${term}%,author.ilike.%${term}%,content.ilike.%${term}%`)
        .limit(3);

      if (!error && docs && docs.length > 0) {
        console.log(`   Term "${term}" found in ${docs.length} documents:`);
        docs.forEach(doc => {
          console.log(`      - "${doc.title}" by ${doc.author}`);
        });
      }
    }

    // Test the RPC function
    console.log('\n📊 Step 4: Test vector search RPC function');
    const { data: rpcTest, error: rpcError } = await supabase.rpc('match_documents_enhanced', {
      query_embedding: new Array(1536).fill(0.1), // Simple test embedding
      match_threshold: 0.0,
      match_count: 3
    });

    if (rpcError) {
      console.error('❌ RPC function error:', rpcError);
    } else {
      console.log(`✅ RPC function works! Returned ${rpcTest?.length || 0} documents`);
      rpcTest?.forEach((doc, i) => {
        console.log(`   ${i+1}. "${doc.title}" by ${doc.author} - Similarity: ${doc.similarity?.toFixed(3)}`);
      });
    }

    // Check if we have NULL values in metadata columns
    console.log('\n📊 Step 5: Check for NULL/empty metadata values');
    const { data: nullCheck } = await supabase
      .from('documents_enhanced')
      .select('id, title, author, topic, tags')
      .or('title.is.null,author.is.null,topic.is.null,tags.is.null')
      .limit(5);

    if (nullCheck && nullCheck.length > 0) {
      console.log(`⚠️  Found ${nullCheck.length} documents with NULL metadata:`);
      nullCheck.forEach((doc, i) => {
        console.log(`   ${i+1}. ID: ${doc.id}, Title: ${doc.title}, Author: ${doc.author}, Topic: ${doc.topic}, Tags: ${doc.tags}`);
      });
    } else {
      console.log('✅ No NULL metadata values found');
    }

    // Final summary
    console.log('\n📊 Step 6: Database summary');
    const { count } = await supabase
      .from('documents_enhanced')
      .select('*', { count: 'exact', head: true });
    
    const { data: uniqueTitles } = await supabase
      .from('documents_enhanced')
      .select('title')
      .not('title', 'is', null);

    const titleSet = new Set(uniqueTitles?.map(d => d.title) || []);
    
    console.log(`   Total documents: ${count}`);
    console.log(`   Unique titles: ${titleSet.size}`);
    
    // Show some unique titles
    console.log('\n   Sample titles in database:');
    Array.from(titleSet).slice(0, 10).forEach((title, i) => {
      console.log(`      ${i+1}. "${title}"`);
    });

  } catch (error) {
    console.error('❌ Error in debug:', error);
  }
}

debugMetadataSearch(); 