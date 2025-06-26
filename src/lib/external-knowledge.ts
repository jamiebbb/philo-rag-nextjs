import { generateChatCompletion } from './openai'

export interface ExternalKnowledgeRequest {
  query: string
  topic: string
  context_from_library: string
  knowledge_gaps: string[]
}

export interface ExternalKnowledgeResponse {
  general_knowledge: string
  external_sources: ExternalSource[]
  knowledge_synthesis: string
  confidence_score: number
  requires_verification: boolean
}

export interface ExternalSource {
  title: string
  author?: string
  source_type: 'academic' | 'book' | 'article' | 'website' | 'course'
  url?: string
  description: string
  credibility_score: number
  access_method: string
  cost: string
}

export class ExternalKnowledgeIntegrator {
  
  async supplementWithGeneralKnowledge(request: ExternalKnowledgeRequest): Promise<ExternalKnowledgeResponse> {
    console.log('🌐 Supplementing library knowledge with external sources for:', request.query)
    
    // Generate comprehensive response using AI with specific instructions
    const knowledgePrompt = `You are an expert librarian with access to comprehensive general knowledge. A user has asked about "${request.query}" and we have some information from our library collection, but need to supplement it with broader knowledge.

LIBRARY CONTEXT PROVIDED:
${request.context_from_library}

IDENTIFIED KNOWLEDGE GAPS:
${request.knowledge_gaps.join(', ')}

TOPIC AREA: ${request.topic}

Your task is to provide comprehensive general knowledge that:
1. Supplements and enriches the library information
2. Fills in the identified knowledge gaps
3. Provides broader context and current perspectives
4. Suggests reputable external sources for deeper learning

Please structure your response to include:
1. General knowledge overview
2. Current state of the field/topic
3. Key concepts not covered in our collection
4. Notable experts and thought leaders
5. Recent developments or debates
6. Practical applications

Focus on providing accurate, well-sourced information that would be found in academic and professional sources.`

    const generalKnowledge = await generateChatCompletion([
      { role: 'system', content: knowledgePrompt },
      { role: 'user', content: request.query }
    ])

    // Generate external sources based on topic
    const externalSources = await this.findExternalSources(request.topic, request.query)
    
    // Create synthesis of library + external knowledge
    const knowledgeSynthesis = await this.synthesizeKnowledge(
      request.context_from_library,
      generalKnowledge,
      request.query
    )

    return {
      general_knowledge: generalKnowledge,
      external_sources: externalSources,
      knowledge_synthesis: knowledgeSynthesis,
      confidence_score: 0.85, // High confidence in curated sources
      requires_verification: request.topic.includes('recent') || request.topic.includes('current')
    }
  }

  private async findExternalSources(topic: string, query: string): Promise<ExternalSource[]> {
    // In production, this would integrate with APIs like Google Scholar, CrossRef, etc.
    // For now, provide curated recommendations based on topic
    
    const sourcesByTopic: Record<string, ExternalSource[]> = {
      business: [
        {
          title: 'Harvard Business Review',
          source_type: 'article',
          url: 'https://hbr.org',
          description: 'Leading business management publication with cutting-edge research and insights',
          credibility_score: 0.95,
          access_method: 'Subscription or library access',
          cost: '$99/year or free through libraries'
        },
        {
          title: 'MIT Sloan Management Review',
          source_type: 'academic',
          url: 'https://sloanreview.mit.edu',
          description: 'Academic journal bridging management research and practice',
          credibility_score: 0.9,
          access_method: 'Open access articles available',
          cost: 'Free articles available'
        },
        {
          title: 'Stanford Graduate School of Business Case Studies',
          source_type: 'academic',
          description: 'Real-world business case studies for analysis and learning',
          credibility_score: 0.92,
          access_method: 'Purchase individual cases or institutional access',
          cost: '$5-15 per case'
        }
      ],
      philosophy: [
        {
          title: 'Stanford Encyclopedia of Philosophy',
          source_type: 'academic',
          url: 'https://plato.stanford.edu',
          description: 'Comprehensive, peer-reviewed philosophical reference work',
          credibility_score: 0.98,
          access_method: 'Free online access',
          cost: 'Free'
        },
        {
          title: 'Philosophy Compass',
          source_type: 'academic',
          description: 'Peer-reviewed surveys of current research in philosophy',
          credibility_score: 0.9,
          access_method: 'Academic library access',
          cost: 'Free through universities'
        },
        {
          title: 'The Great Courses: Philosophy',
          source_type: 'course',
          description: 'University-level philosophy courses by leading professors',
          credibility_score: 0.85,
          access_method: 'Purchase or streaming subscription',
          cost: '$30-200 per course'
        }
      ],
      psychology: [
        {
          title: 'Annual Review of Psychology',
          source_type: 'academic',
          description: 'Comprehensive reviews of current psychological research',
          credibility_score: 0.95,
          access_method: 'Academic library or purchase',
          cost: 'Free through universities'
        },
        {
          title: 'Psychological Science',
          source_type: 'academic',
          description: 'Leading journal for psychological research findings',
          credibility_score: 0.92,
          access_method: 'Academic library access',
          cost: 'Free through universities'
        },
        {
          title: 'TED Talks: Psychology',
          source_type: 'website',
          url: 'https://ted.com',
          description: 'Accessible presentations by leading psychologists',
          credibility_score: 0.8,
          access_method: 'Free online viewing',
          cost: 'Free'
        }
      ]
    }

    const topicSources = sourcesByTopic[topic] || []
    
    // Add general academic sources
    const generalSources: ExternalSource[] = [
      {
        title: 'Google Scholar',
        source_type: 'academic',
        url: 'https://scholar.google.com',
        description: 'Search engine for academic literature across disciplines',
        credibility_score: 0.85,
        access_method: 'Free search, some papers require access',
        cost: 'Free search'
      },
      {
        title: 'JSTOR',
        source_type: 'academic',
        url: 'https://jstor.org',
        description: 'Digital library of academic journals and books',
        credibility_score: 0.9,
        access_method: 'Institutional or individual subscription',
        cost: '$199/year individual'
      }
    ]

    return [...topicSources, ...generalSources].slice(0, 5)
  }

  private async synthesizeKnowledge(
    libraryContext: string,
    generalKnowledge: string,
    originalQuery: string
  ): Promise<string> {
    const synthesisPrompt = `You are an expert librarian synthesizing information from multiple sources. Create a comprehensive response that combines:

LIBRARY COLLECTION INFORMATION:
${libraryContext}

GENERAL KNOWLEDGE:
${generalKnowledge}

USER'S ORIGINAL QUESTION: ${originalQuery}

Create a synthesized response that:
1. Starts with what we know from our collection
2. Expands with general knowledge to provide broader context
3. Identifies where our collection is strong and where external sources add value
4. Provides a complete, well-rounded answer
5. Maintains scholarly credibility while being accessible

The synthesis should feel seamless and comprehensive, not like separate pieces of information pasted together.`

    return await generateChatCompletion([
      { role: 'system', content: synthesisPrompt },
      { role: 'user', content: 'Please provide the synthesized knowledge response.' }
    ])
  }

  async findMissingMaterialsExternal(topic: string, existingBooks: string[]): Promise<ExternalSource[]> {
    // Identify essential materials not in collection
    const essentialMaterials = await this.getEssentialMaterialsByTopic(topic)
    
    return essentialMaterials.filter(material => 
      !existingBooks.some(existing => 
        existing.toLowerCase().includes(material.title.toLowerCase())
      )
    )
  }

  private async getEssentialMaterialsByTopic(topic: string): Promise<ExternalSource[]> {
    const essentials: Record<string, ExternalSource[]> = {
      business: [
        {
          title: 'Competitive Strategy',
          author: 'Michael Porter',
          source_type: 'book',
          description: 'Foundational text on competitive strategy and industry analysis',
          credibility_score: 0.95,
          access_method: 'Purchase or library loan',
          cost: '$20-30'
        },
        {
          title: 'The Innovator\'s Dilemma',
          author: 'Clayton Christensen',
          source_type: 'book',
          description: 'Seminal work on disruptive innovation theory',
          credibility_score: 0.9,
          access_method: 'Purchase or library loan',
          cost: '$15-25'
        }
      ],
      philosophy: [
        {
          title: 'Being and Time',
          author: 'Martin Heidegger',
          source_type: 'book',
          description: 'Fundamental work in existentialist philosophy',
          credibility_score: 0.95,
          access_method: 'Purchase or academic library',
          cost: '$25-40'
        }
      ],
      psychology: [
        {
          title: 'Principles of Psychology',
          author: 'William James',
          source_type: 'book',
          description: 'Classic foundational text in psychological theory',
          credibility_score: 0.9,
          access_method: 'Public domain or purchase',
          cost: 'Free online or $15-25'
        }
      ]
    }

    return essentials[topic] || []
  }
}

// Factory function
export async function supplementWithExternalKnowledge(request: ExternalKnowledgeRequest) {
  const integrator = new ExternalKnowledgeIntegrator()
  return await integrator.supplementWithGeneralKnowledge(request)
}