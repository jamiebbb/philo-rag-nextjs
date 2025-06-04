import { NextRequest, NextResponse } from 'next/server'
import { generateChatCompletion } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    const { title } = await request.json()

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const systemMessage = `You are a metadata expert who generates high-quality metadata for books and documents based on their titles.

Based on the title provided, generate appropriate metadata that would be typical for this type of content.

Format your response exactly as follows:
Author: [Most likely author or "Unknown" if unclear]
Type: [Document type: Book, Article, Report, Essay, etc.]
Genre: [Genre: Philosophy, Science, Fiction, History, etc.]
Topic: [Specific topic or subject matter]
Difficulty: [Beginner, Intermediate, Advanced, or Expert]
Tags: [Relevant tags separated by commas]
Description: [Brief description of what this document likely contains]

Be intelligent about inferring information from the title. For example:
- If it mentions a famous philosopher, include their name as author
- If it's clearly academic, mark as Advanced/Expert difficulty
- If it's introductory, mark as Beginner/Intermediate
- Choose appropriate genre and topic based on title keywords`

    const userMessage = `Generate metadata for a document with this title: "${title}"`

    const response = await generateChatCompletion([
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ])

    // Parse response
    const metadata: any = {}
    try {
      const lines = response.split('\n')
      for (const line of lines) {
        if (line.includes(':')) {
          const [key, ...valueParts] = line.split(':')
          const value = valueParts.join(':').trim()
          const cleanKey = key.toLowerCase().trim()
          
          switch (cleanKey) {
            case 'author':
              metadata.author = value
              break
            case 'type':
              metadata.doc_type = value
              break
            case 'genre':
              metadata.genre = value
              break
            case 'topic':
              metadata.topic = value
              break
            case 'difficulty':
              metadata.difficulty = value
              break
            case 'tags':
              metadata.tags = value
              break
            case 'description':
              metadata.description = value
              break
          }
        }
      }

      // Set fallback values if parsing fails
      if (!metadata.author) metadata.author = 'Unknown'
      if (!metadata.doc_type) metadata.doc_type = 'Book'
      if (!metadata.genre) metadata.genre = 'Unknown'
      if (!metadata.topic) metadata.topic = 'Unknown'
      if (!metadata.difficulty) metadata.difficulty = 'Intermediate'
      if (!metadata.tags) metadata.tags = 'document, book'
      if (!metadata.description) metadata.description = 'Document uploaded to knowledge base'

      // Keep the original title
      metadata.title = title

    } catch (parseError) {
      console.error('Error parsing metadata:', parseError)
      // Return fallback metadata
      return NextResponse.json({
        metadata: {
          title,
          author: 'Unknown',
          doc_type: 'Book',
          genre: 'Unknown', 
          topic: 'Unknown',
          difficulty: 'Intermediate',
          tags: 'document, book',
          description: 'Document uploaded to knowledge base'
        }
      })
    }

    return NextResponse.json({ metadata })

  } catch (error) {
    console.error('Error generating document metadata:', error)
    return NextResponse.json(
      { error: 'Failed to generate metadata' },
      { status: 500 }
    )
  }
} 