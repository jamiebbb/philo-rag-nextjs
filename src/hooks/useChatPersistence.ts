import { useState, useEffect, useCallback } from 'react'
import { ChatMessage } from '@/types'

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

// Configuration for chat retention (in days)
const CHAT_RETENTION_DAYS = 90 // Keep chats for 90 days by default

export function useChatPersistence() {
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const createNewSession = useCallback(() => {
    const newSessionId = `session-${Date.now()}`
    setCurrentSessionId(newSessionId)
    setMessages([])
    return newSessionId
  }, [])

  // Clean up old sessions based on retention policy
  const cleanupOldSessions = useCallback((sessions: ChatSession[]): ChatSession[] => {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - CHAT_RETENTION_DAYS)
    
    const filteredSessions = sessions.filter(session => {
      const sessionDate = new Date(session.updatedAt)
      return sessionDate > cutoffDate
    })

    // Log cleanup if any sessions were removed
    const removedCount = sessions.length - filteredSessions.length
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} old chat session(s) (older than ${CHAT_RETENTION_DAYS} days)`)
    }

    return filteredSessions
  }, [])

  const loadSessions = useCallback(() => {
    try {
      const stored = localStorage.getItem('philo-chat-sessions')
      const storedSessions: ChatSession[] = stored ? JSON.parse(stored) : []
      
      // Convert date strings back to Date objects
      const parsedSessions = storedSessions.map(session => ({
        ...session,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        messages: session.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }))

      // Clean up old sessions
      const cleanedSessions = cleanupOldSessions(parsedSessions)
      
      // Update localStorage if cleanup occurred
      if (cleanedSessions.length !== parsedSessions.length) {
        localStorage.setItem('philo-chat-sessions', JSON.stringify(cleanedSessions))
      }

      setSessions(cleanedSessions)

      // Load the most recent session or create a new one
      if (cleanedSessions.length > 0) {
        const mostRecent = cleanedSessions.sort((a, b) => 
          b.updatedAt.getTime() - a.updatedAt.getTime()
        )[0]
        setCurrentSessionId(mostRecent.id)
        setMessages(mostRecent.messages)
      } else {
        createNewSession()
      }
    } catch (error) {
      console.error('Failed to load chat sessions:', error)
      createNewSession()
    } finally {
      setIsLoading(false)
    }
  }, [createNewSession, cleanupOldSessions])

  const generateSessionTitle = useCallback((messages: ChatMessage[]): string => {
    const firstUserMessage = messages.find(m => m.role === 'user')
    if (firstUserMessage) {
      // Take first 30 characters of the first user message
      return firstUserMessage.content.length > 30 
        ? firstUserMessage.content.substring(0, 30) + '...'
        : firstUserMessage.content
    }
    return 'New Chat'
  }, [])

  const saveCurrentSession = useCallback(() => {
    if (!currentSessionId) return

    const sessionTitle = generateSessionTitle(messages)
    const now = new Date()

    const updatedSession: ChatSession = {
      id: currentSessionId,
      title: sessionTitle,
      messages: messages,
      createdAt: sessions.find(s => s.id === currentSessionId)?.createdAt || now,
      updatedAt: now
    }

    const updatedSessions = sessions.filter(s => s.id !== currentSessionId)
    updatedSessions.push(updatedSession)
    
    setSessions(updatedSessions)
    
    try {
      localStorage.setItem('philo-chat-sessions', JSON.stringify(updatedSessions))
    } catch (error) {
      console.error('Failed to save chat session:', error)
    }
  }, [currentSessionId, messages, sessions, generateSessionTitle])

  // Load sessions from localStorage on mount
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      saveCurrentSession()
    }
  }, [messages, currentSessionId, saveCurrentSession])

  const loadSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      setCurrentSessionId(sessionId)
      setMessages(session.messages)
    }
  }

  const deleteSession = (sessionId: string) => {
    try {
      const updatedSessions = sessions.filter(s => s.id !== sessionId)
      setSessions(updatedSessions)
      
      localStorage.setItem('philo-chat-sessions', JSON.stringify(updatedSessions))
      
      // If we deleted the current session, create a new one
      if (sessionId === currentSessionId) {
        createNewSession()
      }
      
      console.log(`🗑️ Deleted chat session: ${sessionId}`)
    } catch (error) {
      console.error('Failed to delete session:', error)
      throw error // Re-throw to let the UI handle the error
    }
  }

  const clearAllSessions = () => {
    try {
      setSessions([])
      localStorage.removeItem('philo-chat-sessions')
      createNewSession()
      console.log('🧹 Cleared all chat sessions')
    } catch (error) {
      console.error('Failed to clear all sessions:', error)
      throw error
    }
  }

  const exportSessions = () => {
    try {
      const dataStr = JSON.stringify(sessions, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `philo-chat-export-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
      console.log('📤 Exported chat sessions')
    } catch (error) {
      console.error('Failed to export sessions:', error)
      throw error
    }
  }

  const importSessions = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedSessions = JSON.parse(e.target?.result as string)
        const validatedSessions = importedSessions.map((session: any) => ({
          ...session,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
          messages: session.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }))
        
        // Clean up old sessions from imported data too
        const cleanedSessions = cleanupOldSessions(validatedSessions)
        
        setSessions(cleanedSessions)
        localStorage.setItem('philo-chat-sessions', JSON.stringify(cleanedSessions))
        
        if (cleanedSessions.length > 0) {
          const mostRecent = cleanedSessions[0]
          setCurrentSessionId(mostRecent.id)
          setMessages(mostRecent.messages)
        }
        
        console.log(`📥 Imported ${cleanedSessions.length} chat sessions`)
      } catch (error) {
        console.error('Failed to import sessions:', error)
        alert('Failed to import chat sessions. Please check the file format.')
      }
    }
    reader.readAsText(file)
  }

  // Get retention info for display
  const getRetentionInfo = () => ({
    retentionDays: CHAT_RETENTION_DAYS,
    oldestSession: sessions.length > 0 
      ? sessions.reduce((oldest, session) => 
          session.updatedAt < oldest.updatedAt ? session : oldest
        ).updatedAt
      : null
  })

  return {
    // State
    messages,
    setMessages,
    currentSessionId,
    sessions,
    isLoading,
    
    // Actions
    createNewSession,
    loadSession,
    deleteSession,
    clearAllSessions,
    exportSessions,
    importSessions,
    
    // Utility
    getRetentionInfo,
  }
} 