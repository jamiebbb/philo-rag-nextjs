'use client'

import { useState, useRef } from 'react'
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Settings, 
  Clock,
  Search,
  X
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ChatSession {
  id: string
  title: string
  messages: any[]
  createdAt: Date
  updatedAt: Date
}

interface ChatSidebarProps {
  sessions: ChatSession[]
  currentSessionId: string
  onNewSession: () => void
  onLoadSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onClearAll: () => void
  onExport: () => void
  onImport: (file: File) => void
  isOpen: boolean
  onClose: () => void
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  onNewSession,
  onLoadSession,
  onDeleteSession,
  onClearAll,
  onExport,
  onImport,
  isOpen,
  onClose
}: ChatSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const groupedSessions = filteredSessions.reduce((groups, session) => {
    const now = new Date()
    const sessionDate = new Date(session.updatedAt)
    const diffInDays = Math.floor((now.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24))

    let group: string
    if (diffInDays === 0) {
      group = 'Today'
    } else if (diffInDays === 1) {
      group = 'Yesterday'
    } else if (diffInDays <= 7) {
      group = 'Past 7 days'
    } else if (diffInDays <= 30) {
      group = 'Past 30 days'
    } else {
      group = 'Older'
    }

    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(session)
    return groups
  }, {} as Record<string, ChatSession[]>)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImport(file)
      e.target.value = '' // Reset the input
    }
  }

  const handleDeleteSession = (sessionId: string, sessionTitle: string) => {
    try {
      if (confirm(`Delete chat "${sessionTitle}"?\n\nThis action cannot be undone.`)) {
        onDeleteSession(sessionId)
      }
    } catch (error) {
      console.error('Error deleting session:', error)
      alert('Failed to delete chat session. Please try again.')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 lg:hidden"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="relative w-80 bg-gray-900 text-white flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Chat History</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* New Chat Button */}
          <button
            onClick={() => {
              onNewSession()
              onClose()
            }}
            className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto">
          {Object.keys(groupedSessions).length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No chat sessions yet</p>
              <p className="text-xs mt-1">Start a conversation to see it here</p>
            </div>
          ) : (
            Object.entries(groupedSessions).map(([group, groupSessions]) => (
              <div key={group} className="p-4 border-b border-gray-700 last:border-b-0">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  {group}
                </h3>
                <div className="space-y-1">
                  {groupSessions
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                    .map((session) => (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        session.id === currentSessionId
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-800 text-gray-300'
                      }`}
                      onClick={() => {
                        onLoadSession(session.id)
                        onClose()
                      }}
                    >
                      <MessageSquare className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {session.title}
                        </p>
                        <p className="text-xs opacity-75 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteSession(session.id, session.title)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded transition-all"
                        title="Delete chat"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-4 border-t border-gray-700 bg-gray-800">
            <h3 className="text-sm font-semibold mb-3">Chat Management</h3>
            <div className="space-y-2">
              {/* Retention Policy Info */}
              <div className="p-3 bg-gray-700 rounded-lg mb-3">
                <h4 className="text-xs font-semibold text-gray-300 mb-2">Data Retention</h4>
                <p className="text-xs text-gray-400">
                  Chat history is stored locally on your device for 90 days. 
                  Older chats are automatically cleaned up on app startup.
                  No data is sent to external servers except during chat interactions.
                </p>
              </div>
              
              <button
                onClick={() => {
                  onExport()
                  setShowSettings(false)
                }}
                className="w-full flex items-center gap-2 p-2 text-sm hover:bg-gray-700 rounded transition-colors"
              >
                <Download className="w-4 h-4" />
                Export All Chats
              </button>
              <button
                onClick={handleImportClick}
                className="w-full flex items-center gap-2 p-2 text-sm hover:bg-gray-700 rounded transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import Chats
              </button>
              <button
                onClick={() => {
                  if (confirm('This will delete ALL chat history permanently.\n\nThis action cannot be undone.\n\nAre you sure?')) {
                    onClearAll()
                    setShowSettings(false)
                  }
                }}
                className="w-full flex items-center gap-2 p-2 text-sm text-red-400 hover:bg-red-600 hover:text-white rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear All History
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center gap-2 p-2 text-sm hover:bg-gray-800 rounded transition-colors"
          >
            <Settings className="w-4 h-4" />
            Chat Settings
          </button>
          <p className="text-xs text-gray-500 mt-2">
            {sessions.length} total session{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  )
} 