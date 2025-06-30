'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, BookOpen, Brain, Menu, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { ChatMessage } from '@/types'
import { useChatPersistence } from '@/hooks/useChatPersistence'
import { ChatSidebar } from './ChatSidebar'

export function UnifiedChatInterface() {
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
      const response = await fetch('/api/chat-unified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: input.trim(),
          chatId: currentSessionId,
          chatHistory: messages
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
        metadata: data.metadata || {},
        classification: data.classification || null,
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error while processing your request. Please try again, and if the issue persists, I\'ll do my best to help with a different approach.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const quickActions = [
    { 
      label: "What books do you have?", 
      icon: <BookOpen className="w-4 h-4" />, 
      query: "List the books in your memory",
      description: "Browse my knowledge base"
    },
    { 
      label: "Recommend business books", 
      icon: <Brain className="w-4 h-4" />, 
      query: "Recommend some good business books for a CEO",
      description: "Get personalized recommendations"
    },
    { 
      label: "Meeting advice", 
      icon: <MessageSquare className="w-4 h-4" />, 
      query: "Give me advice on holding effective meetings",
      description: "Get practical guidance"
    },
    { 
      label: "Books on leadership", 
      icon: <BookOpen className="w-4 h-4" />, 
      query: "Show me 3 books on leadership",
      description: "Topic-specific book lists"
    }
  ]

  if (persistenceLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg h-[800px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading PHILO...</p>
        </div>
      </div>
    )
  }

  return (
    <>
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
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-white hover:bg-opacity-50 rounded-lg transition-colors"
                title="Chat History"
              >
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">PHILO</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Your AI Librarian • Expert guidance from your personal knowledge base
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={createNewSession}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                New Chat
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        {messages.length === 0 && (
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Try asking me about:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => setInput(action.query)}
                  className="flex items-start gap-3 p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors group"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    {action.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{action.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{action.description}</div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>💡 Tip:</strong> I can help with advice requests, book recommendations, memory queries (&quot;name 3 books&quot;), 
                topic-specific lists (&quot;2 books on banking&quot;), and HR scenarios. 
                Add &quot;use only uploaded books&quot; to limit responses to your knowledge base.
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-lg font-medium">Welcome to PHILO</p>
              <p className="text-sm mt-2">Your AI Librarian for intelligent knowledge discovery</p>
              <p className="text-xs mt-2 text-gray-400">
                Ask me about books, get recommendations, or seek advice from your knowledge base
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="space-y-4">
              <div className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === 'user' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gradient-to-br from-indigo-100 to-blue-100 text-indigo-600'
                  }`}>
                    {message.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  <div className={`rounded-xl p-4 ${
                    message.role === 'user' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-50 text-gray-800 border border-gray-200'
                  }`}>
                    {message.role === 'user' ? (
                      <p className="text-sm">{message.content}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-700">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Classification & Sources Info */}
              {message.role === 'assistant' && (message.classification || message.sources?.length) && (
                <div className="ml-13 space-y-2">
                  {message.classification && (
                    <div className="text-xs text-gray-500 bg-gray-100 rounded-lg p-2">
                      <span className="font-medium">Query Type:</span> {message.classification.type.replace('_', ' ')} 
                      <span className="mx-2">•</span>
                      <span className="font-medium">Confidence:</span> {(message.classification.confidence * 100).toFixed(0)}%
                    </div>
                  )}
                  
                  {message.sources && message.sources.length > 0 && (
                    <div className="text-xs text-gray-600">
                      <div className="font-medium text-gray-700 mb-1">
                        📚 Sources ({message.sources.length}):
                      </div>
                      {message.sources.slice(0, 3).map((source, index) => (
                        <div key={index} className="ml-2 text-gray-600">
                          • &quot;{source.title}&quot; {source.author && `by ${source.author}`}
                        </div>
                      ))}
                      {message.sources.length > 3 && (
                        <div className="ml-2 text-gray-500">
                          + {message.sources.length - 3} more sources
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm text-gray-600">PHILO is thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask PHILO about books, advice, recommendations, or your knowledge base..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          
          <div className="mt-2 text-xs text-gray-500 text-center">
            Try: &quot;Name 3 books&quot; • &quot;Recommend books for beginners&quot; • &quot;Use only uploaded books to answer...&quot;
          </div>
        </div>
      </div>
    </>
  )
} 