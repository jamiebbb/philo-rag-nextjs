// Chat endpoint configuration for testing different RAG approaches

export type ChatEndpoint = 'chat' | 'chat-advanced' | 'chat-metadata-enhanced' | 'chat-comprehensive'

export interface ChatConfig {
  endpoint: ChatEndpoint
  name: string
  description: string
  solvesIssues: string[]
  bestFor: string[]
}

export const CHAT_CONFIGS: Record<ChatEndpoint, ChatConfig> = {
  'chat': {
    endpoint: 'chat',
    name: 'Smart Agentic (Current)',
    description: 'Smart decision making with dynamic scoring and conversation context',
    solvesIssues: ['Manual ranking', 'Better agentic decisions'],
    bestFor: ['General queries', 'Conversation continuity', 'Mixed chat/knowledge requests']
  },
  'chat-advanced': {
    endpoint: 'chat-advanced',
    name: 'Multi-Stage RAG',
    description: 'Advanced multi-stage retrieval with AI reranking and confidence scoring',
    solvesIssues: ['Advanced relevance ranking', 'Query analysis', 'Confidence metrics'],
    bestFor: ['Complex queries', 'Research tasks', 'High-precision requirements']
  },
  'chat-metadata-enhanced': {
    endpoint: 'chat-metadata-enhanced',
    name: 'Metadata-First',
    description: 'Metadata-aware retrieval with semantic entity/topic understanding',
    solvesIssues: ['Metadata utilization', 'Entity recognition', 'Topic-focused search'],
    bestFor: ['Specific author/topic queries', 'Document type filtering', 'Structured search']
  },
  'chat-comprehensive': {
    endpoint: 'chat-comprehensive',
    name: 'Anti-Pollution + Complete Catalog',
    description: 'Prevents conversation pollution and provides complete catalog access',
    solvesIssues: ['Conversation pollution', 'Complete catalog queries', 'Strict boundaries'],
    bestFor: ['Clean knowledge queries', 'Complete listings', 'Avoiding false references']
  }
}

// Default endpoint
export const DEFAULT_ENDPOINT: ChatEndpoint = 'chat-comprehensive'

// Get endpoint URL
export function getChatEndpointUrl(endpoint: ChatEndpoint): string {
  return `/api/${endpoint}`
}

// Get config for endpoint
export function getChatConfig(endpoint: ChatEndpoint): ChatConfig {
  return CHAT_CONFIGS[endpoint]
} 