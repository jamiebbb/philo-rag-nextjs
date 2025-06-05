// Debug vector search issues
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

async function debugVectorSearch() {
  console.log('🔍 DIAGNOSING VECTOR SEARCH ISSUES...\n');

  // 1. Check if documents have embeddings
  console.log('1️⃣ Checking document embeddings...');
  const { data: docs, error: docsError } = await supabase
    .from('documents_enhanced')
    .select('id, title, author, embedding')
    .limit(10);

  if (docsError) {
    console.error('❌ Error fetching documents:', docsError);
    return;
  }

  console.log(`📊 Found ${docs.length} documents`);
  
  let nullEmbeddings = 0;
  let validEmbeddings = 0;
  docs.forEach(doc => {
    if (!doc.embedding) {
      nullEmbeddings++;
      console.log(`❌ NULL embedding: ${doc.title}`);
    } else {
      validEmbeddings++;
    }
  });

  console.log(`✅ Valid embeddings: ${validEmbeddings}`);
  console.log(`❌ NULL embeddings: ${nullEmbeddings}\n`);

  // 2. Test different queries with different similarity thresholds
  const testQueries = [
    'What is philosophy?',
    'How does consciousness work?',
    'Investment strategies',
    'Machine learning',
    'Climate change'
  ];

  const thresholds = [0.0, 0.3, 0.5, 0.7, 0.8];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing query: "${query}"`);
    
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      console.log('❌ Failed to generate embedding for query');
      continue;
    }

    for (const threshold of thresholds) {
      try {
        const { data: results, error } = await supabase.rpc('match_documents_enhanced', {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: 5
        });

        if (error) {
          console.log(`❌ Threshold ${threshold}: ${error.message}`);
        } else {
          const titles = results?.map(r => ({
            title: r.title,
            similarity: r.similarity?.toFixed(3),
            author: r.author
          })) || [];
          
          console.log(`📊 Threshold ${threshold}: ${results?.length || 0} results`);
          if (results?.length > 0) {
            titles.forEach((doc, i) => {
              console.log(`   ${i+1}. ${doc.title} (${doc.author}) - ${doc.similarity}`);
            });
          }
        }
      } catch (error) {
        console.log(`❌ Threshold ${threshold}: ${error.message}`);
      }
    }
  }

  // 3. Check similarity distribution
  console.log('\n3️⃣ Checking similarity score distribution...');
  const sampleQuery = await generateEmbedding('What is the meaning of life?');
  
  if (sampleQuery) {
    try {
      // Get ALL documents with similarity scores (no threshold)
      const { data: allResults, error } = await supabase.rpc('match_documents_enhanced', {
        query_embedding: sampleQuery,
        match_threshold: 0.0, // Get everything
        match_count: 50
      });

      if (error) {
        console.log('❌ Error getting all results:', error);
      } else {
        console.log(`📊 Total documents with similarity scores: ${allResults?.length || 0}`);
        
        if (allResults && allResults.length > 0) {
          const similarities = allResults.map(r => r.similarity).sort((a, b) => b - a);
          console.log(`📈 Similarity range: ${similarities[0]?.toFixed(3)} to ${similarities[similarities.length-1]?.toFixed(3)}`);
          console.log(`📊 Average similarity: ${(similarities.reduce((sum, s) => sum + s, 0) / similarities.length).toFixed(3)}`);
          
          // Show distribution
          const buckets = {
            'Very High (0.8+)': similarities.filter(s => s >= 0.8).length,
            'High (0.7-0.8)': similarities.filter(s => s >= 0.7 && s < 0.8).length,
            'Medium (0.5-0.7)': similarities.filter(s => s >= 0.5 && s < 0.7).length,
            'Low (0.3-0.5)': similarities.filter(s => s >= 0.3 && s < 0.5).length,
            'Very Low (<0.3)': similarities.filter(s => s < 0.3).length
          };
          
          console.log('\n📊 Similarity Distribution:');
          Object.entries(buckets).forEach(([range, count]) => {
            const percentage = ((count / similarities.length) * 100).toFixed(1);
            console.log(`   ${range}: ${count} docs (${percentage}%)`);
          });
        }
      }
    } catch (error) {
      console.log('❌ Error in similarity analysis:', error);
    }
  }

  // 4. Test if always returning same documents
  console.log('\n4️⃣ Testing if same documents always returned...');
  const queries = [
    'philosophy and ethics',
    'quantum physics',
    'artificial intelligence',
    'economic theory'
  ];

  const allSets = [];
  for (const q of queries) {
    const embedding = await generateEmbedding(q);
    if (embedding) {
      const { data: results } = await supabase.rpc('match_documents_enhanced', {
        query_embedding: embedding,
        match_threshold: 0.5, // Use medium threshold
        match_count: 5
      });
      
      const titleSet = new Set(results?.map(r => r.title) || []);
      allSets.push({ query: q, titles: titleSet, count: titleSet.size });
      console.log(`   "${q}": ${titleSet.size} documents`);
    }
  }

  // Check for overlap
  if (allSets.length >= 2) {
    const [set1, set2] = allSets;
    const overlap = [...set1.titles].filter(title => set2.titles.has(title));
    console.log(`\n🔄 Overlap between first two queries: ${overlap.length} documents`);
    if (overlap.length > 0) {
      console.log('   Overlapping titles:', overlap);
    }
  }

  console.log('\n✅ Vector search diagnosis complete!');
}

debugVectorSearch().catch(console.error); 