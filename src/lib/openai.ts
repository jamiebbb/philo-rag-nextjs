import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('Missing OpenAI API key. Please set OPENAI_API_KEY in your .env.local file.')
}

export const openai = new OpenAI({
  apiKey: apiKey
})

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
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
  model: string = 'gpt-4o-mini'
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 2000
    })
    
    return response.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Error generating chat completion:', error)
    throw new Error('Failed to generate response')
  }
} 