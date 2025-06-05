import { useState, useEffect } from 'react'
import { ChatMessage } from '@/types'

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

export function useChatPersistence() {
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load sessions from localStorage on mount
  useEffect(() => {
    loadSessions()
  }, [])

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      saveCurrentSession()
    }
  }, [messages, currentSessionId])

  const loadSessions = () => {
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

      setSessions(parsedSessions)

      // Load the most recent session or create a new one
      if (parsedSessions.length > 0) {
        const mostRecent = parsedSessions.sort((a, b) => 
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
  }

  const saveCurrentSession = () => {
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
  }

  const createNewSession = () => {
    const newSessionId = `session-${Date.now()}`
    setCurrentSessionId(newSessionId)
    setMessages([])
    return newSessionId
  }

  const loadSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      setCurrentSessionId(sessionId)
      setMessages(session.messages)
    }
  }

  const deleteSession = (sessionId: string) => {
    const updatedSessions = sessions.filter(s => s.id !== sessionId)
    setSessions(updatedSessions)
    
    try {
      localStorage.setItem('philo-chat-sessions', JSON.stringify(updatedSessions))
    } catch (error) {
      console.error('Failed to delete session:', error)
    }

    // If we deleted the current session, create a new one
    if (sessionId === currentSessionId) {
      createNewSession()
    }
  }

  const clearAllSessions = () => {
    setSessions([])
    localStorage.removeItem('philo-chat-sessions')
    createNewSession()
  }

  const generateSessionTitle = (messages: ChatMessage[]): string => {
    const firstUserMessage = messages.find(m => m.role === 'user')
    if (firstUserMessage) {
      // Take first 30 characters of the first user message
      return firstUserMessage.content.length > 30 
        ? firstUserMessage.content.substring(0, 30) + '...'
        : firstUserMessage.content
    }
    return 'New Chat'
  }

  const exportSessions = () => {
    const dataStr = JSON.stringify(sessions, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `philo-chat-export-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
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
        
        setSessions(validatedSessions)
        localStorage.setItem('philo-chat-sessions', JSON.stringify(validatedSessions))
        
        if (validatedSessions.length > 0) {
          const mostRecent = validatedSessions[0]
          setCurrentSessionId(mostRecent.id)
          setMessages(mostRecent.messages)
        }
      } catch (error) {
        console.error('Failed to import sessions:', error)
        alert('Failed to import chat sessions. Please check the file format.')
      }
    }
    reader.readAsText(file)
  }

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
  }
} 