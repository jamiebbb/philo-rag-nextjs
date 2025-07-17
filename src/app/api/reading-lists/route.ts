import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export interface ReadingList {
  id: string
  title: string
  description: string
  category: string
  difficulty_level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Mixed'
  estimated_duration: string
  books: ReadingListBook[]
  created_by: 'librarian' | 'user'
  is_featured: boolean
  tags: string[]
  learning_objectives: string[]
}

export interface ReadingListBook {
  title: string
  author: string
  order_in_list: number
  reading_notes?: string
  prerequisites?: string[]
  estimated_time: string
  availability_status: 'available' | 'missing' | 'external'
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const difficulty = searchParams.get('difficulty')
    const featured = searchParams.get('featured')

    const supabase = createServerSupabaseClient()

    // For now, return curated reading lists
    // In production, these would be stored in database
    const readingLists = await getCuratedReadingLists()

    let filteredLists = readingLists

    if (category) {
      filteredLists = filteredLists.filter(list => 
        list.category.toLowerCase() === category.toLowerCase()
      )
    }

    if (difficulty) {
      filteredLists = filteredLists.filter(list => 
        list.difficulty_level === difficulty
      )
    }

    if (featured === 'true') {
      filteredLists = filteredLists.filter(list => list.is_featured)
    }

    return NextResponse.json({
      reading_lists: filteredLists,
      total_count: filteredLists.length,
      categories: [...new Set(readingLists.map(list => list.category))],
      difficulty_levels: [...new Set(readingLists.map(list => list.difficulty_level))]
    })

  } catch (error) {
    console.error('Error fetching reading lists:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function getCuratedReadingLists(): Promise<ReadingList[]> {
  return [
    {
      id: 'business-leadership-essentials',
      title: 'Business Leadership Essentials',
      description: 'A comprehensive journey through modern leadership theory and practice',
      category: 'Business',
      difficulty_level: 'Intermediate',
      estimated_duration: '3-4 months',
      books: [
        {
          title: 'Good to Great',
          author: 'Jim Collins',
          order_in_list: 1,
          reading_notes: 'Focus on the Level 5 Leadership concept and the Hedgehog Principle',
          estimated_time: '8-10 hours',
          availability_status: 'missing'
        },
        {
          title: 'The 7 Habits of Highly Effective People',
          author: 'Stephen Covey',
          order_in_list: 2,
          reading_notes: 'Pay special attention to Habits 4-6 for leadership development',
          estimated_time: '10-12 hours',
          availability_status: 'available'
        },
        {
          title: 'Emotional Intelligence',
          author: 'Daniel Goleman',
          order_in_list: 3,
          reading_notes: 'Essential for understanding the emotional aspects of leadership',
          estimated_time: '6-8 hours',
          availability_status: 'available'
        }
      ],
      created_by: 'librarian',
      is_featured: true,
      tags: ['leadership', 'management', 'emotional intelligence'],
      learning_objectives: [
        'Understand the principles of effective leadership',
        'Develop emotional intelligence skills',
        'Learn to build and lead high-performing teams',
        'Master personal effectiveness habits'
      ]
    },
    {
      id: 'philosophy-beginners',
      title: 'Philosophy for Beginners',
      description: 'An accessible introduction to philosophical thinking and major concepts',
      category: 'Philosophy',
      difficulty_level: 'Beginner',
      estimated_duration: '2-3 months',
      books: [
        {
          title: 'The Problems of Philosophy',
          author: 'Bertrand Russell',
          order_in_list: 1,
          reading_notes: 'Perfect introduction to philosophical thinking and major questions',
          estimated_time: '4-5 hours',
          availability_status: 'available'
        },
        {
          title: 'Meditations',
          author: 'Marcus Aurelius',
          order_in_list: 2,
          reading_notes: 'Read slowly, one meditation at a time. Focus on practical wisdom',
          estimated_time: '3-4 hours',
          availability_status: 'missing'
        },
        {
          title: 'The Consolations of Philosophy',
          author: 'Alain de Botton',
          order_in_list: 3,
          reading_notes: 'Modern application of classical philosophical wisdom',
          estimated_time: '5-6 hours',
          availability_status: 'available'
        }
      ],
      created_by: 'librarian',
      is_featured: true,
      tags: ['philosophy', 'wisdom', 'critical thinking'],
      learning_objectives: [
        'Develop critical thinking skills',
        'Understand major philosophical questions',
        'Learn practical wisdom from classical thinkers',
        'Build a foundation for further philosophical study'
      ]
    },
    {
      id: 'strategic-thinking',
      title: 'Strategic Thinking for Professionals',
      description: 'Develop strategic thinking capabilities for complex business environments',
      category: 'Business',
      difficulty_level: 'Advanced',
      estimated_duration: '4-5 months',
      books: [
        {
          title: 'Competitive Strategy',
          author: 'Michael Porter',
          order_in_list: 1,
          reading_notes: 'Focus on the Five Forces framework and competitive positioning',
          estimated_time: '12-15 hours',
          availability_status: 'missing'
        },
        {
          title: 'The Art of War',
          author: 'Sun Tzu',
          order_in_list: 2,
          reading_notes: 'Read with business strategy applications in mind',
          estimated_time: '3-4 hours',
          availability_status: 'available'
        },
        {
          title: 'Thinking, Fast and Slow',
          author: 'Daniel Kahneman',
          order_in_list: 3,
          reading_notes: 'Essential for understanding cognitive biases in strategic decisions',
          estimated_time: '10-12 hours',
          availability_status: 'available'
        }
      ],
      created_by: 'librarian',
      is_featured: false,
      tags: ['strategy', 'decision-making', 'competitive analysis'],
      learning_objectives: [
        'Master strategic analysis frameworks',
        'Understand competitive dynamics',
        'Learn to make better strategic decisions',
        'Recognize and overcome cognitive biases'
      ]
    },
    {
      id: 'personal-development',
      title: 'Personal Development Journey',
      description: 'A holistic approach to personal growth and self-improvement',
      category: 'Personal Development',
      difficulty_level: 'Mixed',
      estimated_duration: '6-8 months',
      books: [
        {
          title: 'Atomic Habits',
          author: 'James Clear',
          order_in_list: 1,
          reading_notes: 'Start with small habits. Track your progress',
          estimated_time: '6-7 hours',
          availability_status: 'missing'
        },
        {
          title: 'Mindset',
          author: 'Carol Dweck',
          order_in_list: 2,
          reading_notes: 'Focus on developing a growth mindset in all areas of life',
          estimated_time: '5-6 hours',
          availability_status: 'available'
        },
        {
          title: 'The Power of Now',
          author: 'Eckhart Tolle',
          order_in_list: 3,
          reading_notes: 'Practice the mindfulness exercises as you read',
          estimated_time: '4-5 hours',
          availability_status: 'available'
        }
      ],
      created_by: 'librarian',
      is_featured: true,
      tags: ['personal development', 'habits', 'mindfulness', 'growth'],
      learning_objectives: [
        'Build effective habits for success',
        'Develop a growth mindset',
        'Practice mindfulness and presence',
        'Create a personal development plan'
      ]
    }
  ]
}