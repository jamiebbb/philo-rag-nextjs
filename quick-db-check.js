const { createClient } = require('@supabase/supabase-js');

async function quickDbCheck() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Get total count
    const { count } = await supabase
      .from('documents_enhanced')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Total documents: ${count}`);

    // Get unique titles
    const { data: docs } = await supabase
      .from('documents_enhanced')
      .select('title, author, doc_type, created_at')
      .order('created_at', { ascending: false });

    const titleCounts = new Map();
    docs.forEach(doc => {
      const key = `${doc.title} (${doc.author || 'No author'})`;
      titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
    });

    console.log(`\n📚 Unique books/documents (${titleCounts.size}):`);
    let i = 1;
    for (const [title, count] of titleCounts) {
      console.log(`${i}. ${title} - ${count} chunks`);
      i++;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

quickDbCheck(); 