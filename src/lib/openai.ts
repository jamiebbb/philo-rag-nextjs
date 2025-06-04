import OpenAI from 'openai'

let openaiInstance: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      throw new Error('Missing OpenAI API key. Please set OPENAI_API_KEY in your .env.local file.')
    }
    
    openaiInstance = new OpenAI({
      apiKey: apiKey
    })
  }
  
  return openaiInstance
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    })
    
    return response.data[0].embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    throw new Error('Failed to generate embedding')
  }
}

export async function generateChatCompletion(
  messages: Array<{ role: string; content: string }>,
  model: string = 'gpt-4o-mini',
  maxTokens: number = 2000
): Promise<string> {
  try {
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: maxTokens
    })
    
    return response.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Error generating chat completion:', error)
    throw new Error('Failed to generate response')
  }
} 