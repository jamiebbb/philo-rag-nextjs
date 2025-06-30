'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Loader2, BookOpen, Lightbulb, Search, TrendingUp, Archive, Coffee } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { ChatMessage } from '@/types'
import { useChatPersistence } from '@/hooks/useChatPersistence'

interface LibrarianChatMessage extends ChatMessage {
  recommendations?: any[]
  missingMaterials?: any[]
  libraryStats?: any
}

export function LibrarianInterface() {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const {
    messages,
    setMessages,
    sessions,
    currentSessionId,
    createNewSession,
    loadSession,
    deleteSession,
    clearAllSessions,
    isLoading: persistenceLoading
  } = useChatPersistence()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: LibrarianChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat-librarian', {
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

      const assistantMessage: LibrarianChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources || [],
        recommendations: data.recommendations || [],
        missingMaterials: data.missingMaterials || [],
        libraryStats: data.libraryStats || {},
        metadata: {
          searchStrategy: data.searchStrategy,
          method: data.method
        }
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: LibrarianChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error while accessing the library systems. Please try again, and if the issue persists, our technical staff will investigate.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const quickActions = [
    { label: "What's in our collection?", icon: <Search className="w-4 h-4" />, query: "What books and materials do you have in your collection?" },
    { label: "Business recommendations", icon: <TrendingUp className="w-4 h-4" />, query: "Recommend some essential business books from your collection" },
    { label: "Philosophy guides", icon: <Coffee className="w-4 h-4" />, query: "I'm new to philosophy - where should I start?" },
    { label: "Research help", icon: <Archive className="w-4 h-4" />, query: "Help me research effective leadership strategies" }
  ]

  if (persistenceLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg h-[800px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading Reading Room...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg h-[800px] flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">PHILO Reading Room</h2>
              <p className="text-sm text-gray-600 mt-1">
                Your AI Librarian • Expert guidance for professional development
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={createNewSession}
              className="px-3 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              New Research Session
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && (
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Start</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => setInput(action.query)}
                className="flex items-center gap-2 p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                {action.icon}
                <span className="text-sm text-gray-700">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-indigo-600" />
            </div>
            <p className="text-lg font-medium">Welcome to the PHILO Reading Room</p>
            <p className="text-sm mt-2">I&apos;m your AI librarian, here to help you discover, learn, and grow.</p>
            <p className="text-xs mt-2 text-gray-400">
              Ask me about our collection, get reading recommendations, or seek research guidance
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-4">
            {/* Main Message */}
            <div className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {message.role === 'user' ? <User className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                </div>
                <div className={`rounded-xl p-4 ${
                  message.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-50 text-gray-800 border border-gray-200'
                }`}>
                  {message.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <ReactMarkdown className="prose prose-sm max-w-none">
                      {message.content}
                    </ReactMarkdown>
                  )}
                  <div className="text-xs opacity-75 mt-2">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Features for Assistant Messages */}
            {message.role === 'assistant' && (
              <div className="ml-12 space-y-4">
                {/* Recommendations */}
                {message.recommendations && message.recommendations.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-green-800">Reading Recommendations</h3>
                    </div>
                    <div className="space-y-3">
                      {message.recommendations.map((rec, index) => (
                        <div key={index} className="bg-white rounded-lg p-3 border border-green-100">
                          <div className="font-medium text-gray-900">📚 {rec.title}</div>
                          <div className="text-sm text-gray-600">by {rec.author}</div>
                          <div className="text-xs text-green-700 mt-1">{rec.recommendation_reason}</div>
                          {rec.difficulty && (
                            <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                              {rec.difficulty} Level
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Materials */}
                {message.missingMaterials && message.missingMaterials.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Archive className="w-5 h-5 text-amber-600" />
                      <h3 className="font-semibold text-amber-800">Suggested Acquisitions</h3>
                    </div>
                    <div className="space-y-2">
                      {message.missingMaterials.map((missing, index) => (
                        <div key={index} className="bg-white rounded-lg p-3 border border-amber-100">
                          <div className="font-medium text-gray-900">📖 {missing.title}</div>
                          <div className="text-sm text-gray-600">by {missing.author}</div>
                          <div className="text-xs text-amber-700 mt-1">{missing.reason}</div>
                          {missing.acquisition_priority && (
                            <span className="inline-block mt-2 px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded">
                              {missing.acquisition_priority} priority
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Library Stats */}
                {message.libraryStats && Object.keys(message.libraryStats).length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-800">Collection Overview</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{message.libraryStats.total_books || 0}</div>
                        <div className="text-blue-700">Total Books</div>
                      </div>
                      {message.libraryStats.by_genre && Object.keys(message.libraryStats.by_genre).length > 0 && (
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{Object.keys(message.libraryStats.by_genre).length}</div>
                          <div className="text-blue-700">Genres</div>
                        </div>
                      )}
                      {message.libraryStats.by_topic && Object.keys(message.libraryStats.by_topic).length > 0 && (
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{Object.keys(message.libraryStats.by_topic).length}</div>
                          <div className="text-blue-700">Topics</div>
                        </div>
                      )}
                      {message.libraryStats.by_difficulty && Object.keys(message.libraryStats.by_difficulty).length > 0 && (
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{Object.keys(message.libraryStats.by_difficulty).length}</div>
                          <div className="text-blue-700">Levels</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">📚 Sources Referenced</h3>
                    <div className="space-y-2">
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
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span className="text-sm text-gray-600">Researching your request...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 border-t border-gray-200 bg-gray-50">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me about our collection, get recommendations, or seek research guidance..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          💡 Try: &quot;Recommend business strategy books&quot; • &quot;What philosophy should I read first?&quot; • &quot;Help me research leadership&quot;
        </p>
      </div>
    </div>
  )
}