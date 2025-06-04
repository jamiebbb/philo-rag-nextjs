'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, FileText, Loader2, ThumbsUp, ThumbsDown, Star, MessageSquare } from 'lucide-react'
import { ChatMessage, DocumentSource } from '@/types'
import { formatDate } from '@/lib/utils'
import { storeFeedback, storeDetailedFeedback } from '@/lib/feedback'
import { v4 as uuidv4 } from 'uuid'
import ReactMarkdown from 'react-markdown'

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatId] = useState(() => uuidv4())
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const testSupabase = async () => {
    try {
      const response = await fetch('/api/test-supabase')
      const data = await response.json()
      setDebugInfo(data)
      console.log('🧪 Supabase test results:', data)
    } catch (error) {
      console.error('🚨 Supabase test failed:', error)
      setDebugInfo({ error: 'Test failed' })
    }
  }

  const handleFeedback = async (messageId: string, feedbackType: 'helpful' | 'not_helpful' | 'partial') => {
    const message = messages.find(m => m.id === messageId)
    if (!message) return

    const userQuery = messages.find(m => 
      messages.indexOf(m) === messages.indexOf(message) - 1 && m.role === 'user'
    )?.content || ''

    const success = await storeFeedback(userQuery, message.content, feedbackType, chatId)
    
    if (success) {
      setMessages(prev => prev.map(m => 
        m.id === messageId 
          ? { ...m, feedback: { type: feedbackType, timestamp: new Date() } }
          : m
      ))
    }
  }

  const handleDetailedFeedback = async (
    messageId: string, 
    rating: number, 
    comment: string
  ) => {
    const message = messages.find(m => m.id === messageId)
    if (!message) return

    const userQuery = messages.find(m => 
      messages.indexOf(m) === messages.indexOf(message) - 1 && m.role === 'user'
    )?.content || ''

    const success = await storeDetailedFeedback(userQuery, message.content, rating, comment, chatId)
    
    if (success) {
      // Update message with detailed feedback
      setMessages(prev => prev.map(m => 
        m.id === messageId 
          ? { ...m, feedback: { type: 'detailed', rating, comment, timestamp: new Date() } }
          : m
      ))
      setExpandedFeedback(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: input.trim(),
          chatId
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources || [],
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg h-[600px] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-500" />
              PHILO RAG Assistant
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Ask questions about your uploaded documents
            </p>
          </div>
          <button
            onClick={testSupabase}
            className="px-3 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
          >
            🧪 Test DB
          </button>
        </div>
        
        {/* Debug Info Display */}
        {debugInfo && (
          <div className="mt-3 p-3 bg-gray-50 rounded text-xs">
            <div className="font-medium mb-2">🧪 Database Test Results:</div>
            <div className="space-y-1">
              <div>Connection: {debugInfo.tests?.connection?.success ? '✅' : '❌'}</div>
              <div>Documents: {debugInfo.tests?.documents?.count || 0} found</div>
              <div>RPC Function: {debugInfo.tests?.rpcFunction?.success ? '✅' : '❌'}</div>
              {debugInfo.tests?.documents?.sample?.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Sample docs:</div>
                  {debugInfo.tests.documents.sample.map((doc: any, i: number) => (
                    <div key={i} className="ml-2">• {doc.title} ({doc.contentLength} chars)</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <Bot className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">Welcome to PHILO RAG!</p>
            <p className="text-sm">Start by asking a question about your documents.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`flex gap-3 max-w-[80%] ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>

              <div className="flex-1">
              <div
                className={`rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                  <div className="whitespace-pre-wrap">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        strong: ({ children }) => (
                          <strong className={`font-bold ${
                            message.role === 'user' ? 'text-white' : 'text-gray-900'
                          }`}>
                            {children}
                          </strong>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                <p
                  className={`text-xs mt-2 ${
                    message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}
                >
                  {formatDate(message.timestamp)}
                </p>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      Sources:
                    </p>
                    <div className="space-y-2">
                      {message.sources.map((source, index) => (
                        <div
                          key={index}
                          className="bg-white rounded p-2 text-xs text-gray-700"
                        >
                          <div className="flex items-center gap-1 font-medium">
                            <FileText className="w-3 h-3" />
                            {source.title}
                            {source.author && (
                              <span className="text-gray-500">
                                by {source.author}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-gray-600 line-clamp-2">
                            {source.content.substring(0, 100)}...
                          </p>
                        </div>
                      ))}
                    </div>
                    </div>
                  )}
                </div>

                {/* Feedback Section */}
                {message.role === 'assistant' && (
                  <div className="mt-2 space-y-2">
                    {/* Quick Feedback Buttons */}
                    {!message.feedback && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFeedback(message.id, 'helpful')}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
                        >
                          <ThumbsUp className="w-3 h-3" />
                          Helpful
                        </button>
                        <button
                          onClick={() => handleFeedback(message.id, 'not_helpful')}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                        >
                          <ThumbsDown className="w-3 h-3" />
                          Not Helpful
                        </button>
                        <button
                          onClick={() => handleFeedback(message.id, 'partial')}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                        >
                          <Star className="w-3 h-3" />
                          Partially Helpful
                        </button>
                        <button
                          onClick={() => setExpandedFeedback(expandedFeedback === message.id ? null : message.id)}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Detailed Feedback
                        </button>
                      </div>
                    )}

                    {/* Feedback Status */}
                    {message.feedback && (
                      <div className="text-xs text-gray-500">
                        {message.feedback.type === 'detailed' ? (
                          <span>
                            ⭐ Rated {message.feedback.rating}/5
                            {message.feedback.comment && ` - "${message.feedback.comment.substring(0, 50)}${message.feedback.comment.length > 50 ? '...' : ''}"`}
                          </span>
                        ) : (
                          <span>
                            {message.feedback.type === 'helpful' && '👍 Marked as helpful'}
                            {message.feedback.type === 'not_helpful' && '👎 Marked as not helpful'}
                            {message.feedback.type === 'partial' && '⭐ Marked as partially helpful'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Expanded Feedback Form */}
                    {expandedFeedback === message.id && (
                      <div className="bg-gray-50 p-3 rounded-md">
                        <DetailedFeedbackForm
                          onSubmit={(rating, comment) => handleDetailedFeedback(message.id, rating, comment)}
                          onCancel={() => setExpandedFeedback(null)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-gray-600">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your documents..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
        <div className="mt-2 text-xs text-gray-500 text-center">
          💡 Your feedback helps improve future responses
        </div>
      </div>
    </div>
  )
}

function DetailedFeedbackForm({ 
  onSubmit, 
  onCancel 
}: { 
  onSubmit: (rating: number, comment: string) => void
  onCancel: () => void 
}) {
  const [rating, setRating] = useState(3)
  const [comment, setComment] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(rating, comment)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Rating (1-5 stars)
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className={`text-lg ${
                star <= rating ? 'text-yellow-400' : 'text-gray-300'
              } hover:text-yellow-400 transition-colors`}
            >
              ⭐
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Comments (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any corrections or suggestions?"
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={2}
        />
      </div>
      
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Submit Feedback
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
} 