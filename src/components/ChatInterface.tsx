'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, FileText, Loader2, ThumbsUp, ThumbsDown, MessageSquare, Menu, ChevronDown, ChevronUp } from 'lucide-react'
import { ChatMessage, DocumentSource } from '@/types'
import { formatDate } from '@/lib/utils'
import { storeFeedback, storeDetailedFeedback } from '@/lib/feedback'
import { v4 as uuidv4 } from 'uuid'
import ReactMarkdown from 'react-markdown'
import { useChatPersistence } from '@/hooks/useChatPersistence'
import { ChatSidebar } from './ChatSidebar'

export function ChatInterface() {
  // Use our new persistence hook instead of basic useState
  const {
    messages,
    setMessages,
    currentSessionId,
    sessions,
    isLoading: persistenceLoading,
    createNewSession,
    loadSession,
    deleteSession,
    clearAllSessions,
    exportSessions,
    importSessions,
  } = useChatPersistence()

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatId] = useState(() => currentSessionId || uuidv4())
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null)
  const [expandedSources, setExpandedSources] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
      const response = await fetch('/api/chat-comprehensive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: input.trim(),
          chatId: currentSessionId,
          chatHistory: messages // Send conversation history for context
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

  // Show loading spinner while persistence is initializing
  if (persistenceLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg h-[800px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading chat history...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Chat Sidebar */}
      <ChatSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewSession={createNewSession}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        onClearAll={clearAllSessions}
        onExport={exportSessions}
        onImport={importSessions}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="bg-white rounded-lg shadow-lg h-[800px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Chat History"
              >
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-500" />
                  PHILO RAG Assistant
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Ask questions about your uploaded documents • {sessions.length} chat{sessions.length !== 1 ? 's' : ''} saved
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={createNewSession}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                title="Start new chat"
              >
                New Chat
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <Bot className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Welcome to PHILO RAG!</p>
              <p className="text-sm">Start by asking a question about your documents.</p>
              <p className="text-xs mt-2 text-gray-400">
                Your conversations will be automatically saved and can be accessed from the menu
              </p>
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
                <div
                  className={`rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="prose prose-sm max-w-none prose-p:mb-4 prose-p:mt-0">
                    {message.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <ReactMarkdown 
                        components={{
                          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="mb-4 last:mb-0 pl-6 list-disc">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-4 last:mb-0 pl-6 list-decimal">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mb-2 mt-2 first:mt-0">{children}</h3>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    )}
                  </div>
                  
                  <div className="text-xs opacity-75 mt-2">
                    {formatDate(message.timestamp)}
                  </div>

                  {/* Sources as collapsible dropdown underneath this specific message */}
                  {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <div className="bg-gray-50 rounded-lg border border-gray-200">
                        <button
                          onClick={() => setExpandedSources(expandedSources === message.id ? null : message.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-sm text-gray-800">
                              References ({message.sources.length})
                            </span>
                          </div>
                          {expandedSources === message.id ? (
                            <ChevronUp className="w-4 h-4 text-gray-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-600" />
                          )}
                        </button>
                        
                        {expandedSources === message.id && (
                          <div className="px-3 pb-3 space-y-2">
                            {message.sources.map((source, index) => (
                              <div key={index} className="bg-white rounded p-3 border text-sm">
                                <div className="font-medium text-gray-900">{source.title}</div>
                                <div className="text-gray-600 text-xs mb-2">
                                  {source.author} • {source.doc_type}
                                  {source.relevance_score && (
                                    <span className="ml-2">
                                      Relevance: {(source.relevance_score * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-700 text-xs">{source.content}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Feedback for this specific assistant message */}
                  {message.role === 'assistant' && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                        {message.feedback ? (
                          <div className="text-xs text-gray-600">
                            Feedback: {message.feedback.type === 'helpful' ? '👍 Helpful' : 
                                     message.feedback.type === 'not_helpful' ? '👎 Not helpful' : 
                                     message.feedback.type === 'partial' ? '⚡ Partially helpful' :
                                     `⭐ ${message.feedback.rating}/5 - ${message.feedback.comment}`}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Was this helpful?</span>
                            <button
                              onClick={() => handleFeedback(message.id, 'helpful')}
                              className="p-1 hover:bg-green-100 rounded"
                              title="Helpful"
                            >
                              <ThumbsUp className="w-3 h-3 text-green-600" />
                            </button>
                            <button
                              onClick={() => handleFeedback(message.id, 'not_helpful')}
                              className="p-1 hover:bg-red-100 rounded"
                              title="Not helpful"
                            >
                              <ThumbsDown className="w-3 h-3 text-red-600" />
                            </button>
                            <button
                              onClick={() => setExpandedFeedback(message.id)}
                              className="p-1 hover:bg-blue-100 rounded"
                              title="Add detailed comment"
                            >
                              <MessageSquare className="w-3 h-3 text-blue-600" />
                            </button>
                          </div>
                        )}

                        {/* Detailed feedback form */}
                        {expandedFeedback === message.id && (
                          <DetailedFeedbackForm
                            onSubmit={(rating, comment) => handleDetailedFeedback(message.id, rating, comment)}
                            onCancel={() => setExpandedFeedback(null)}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-gray-600" />
                </div>
                <div className="bg-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-gray-600">AI is thinking...</span>
                  </div>
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
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </>
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
    <div className="mt-3 p-3 bg-white rounded border">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Rating (1-5):</label>
          <select 
            value={rating} 
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full p-1 border border-gray-300 rounded text-xs"
          >
            {[1, 2, 3, 4, 5].map(num => (
              <option key={num} value={num}>{num} Star{num !== 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Comment:</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us more about your experience..."
            className="w-full p-2 border border-gray-300 rounded text-xs"
            rows={2}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
} 