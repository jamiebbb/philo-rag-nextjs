'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Bot, Upload, Youtube, Settings, Database, MessageSquare, FileText, BookOpen, Menu, X } from 'lucide-react'

// Dynamic imports to prevent SSR issues
const SmartUpload = dynamic(() => import('@/components/SmartUpload').then(mod => ({ default: mod.SmartUpload })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-12">
      <div className="animate-pulse text-gray-500">Loading upload interface...</div>
    </div>
  )
})

import { UnifiedChatInterface } from '@/components/UnifiedChatInterface'
import { DocumentManager } from '@/components/DocumentManager'
import { YouTubeUpload } from '@/components/YouTubeUpload'
import { DatabaseView } from '@/components/DatabaseView'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chat' | 'smart' | 'youtube' | 'manage' | 'database'>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navigationItems = [
    { 
      id: 'chat', 
      label: 'PHILO Chat', 
      icon: MessageSquare, 
      description: 'AI Assistant',
      color: 'blue'
    },
    { 
      id: 'smart', 
      label: 'Smart Upload', 
      icon: Upload, 
      description: 'Intelligent Processing',
      color: 'green'
    },
    { 
      id: 'youtube', 
      label: 'YouTube', 
      icon: Youtube, 
      description: 'Video Transcripts',
      color: 'red'
    },
    { 
      id: 'manage', 
      label: 'Manage', 
      icon: Settings, 
      description: 'Document Library',
      color: 'purple'
    },
    { 
      id: 'database', 
      label: 'Database', 
      icon: Database, 
      description: 'View Data',
      color: 'gray'
    },
  ]

  const getPageTitle = () => {
    const item = navigationItems.find(item => item.id === activeTab)
    return item ? item.label : 'PHILO'
  }

  const getPageDescription = () => {
    const descriptions = {
      chat: 'Your intelligent document companion. Chat with your knowledge base and discover insights.',
      smart: 'Intelligent file processing that automatically detects file size and uses the optimal upload method.',
      youtube: 'Extract and process video transcripts with AI-powered enhancement and grammar correction.',
      manage: 'Organize and manage your document library with advanced search and filtering options.',
      database: 'Explore your vector database contents with detailed metadata and comprehensive search.'
    }
    return descriptions[activeTab as keyof typeof descriptions] || ''
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white/90 backdrop-blur-sm border-r border-gray-200/50 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                PHILO
              </h1>
              <p className="text-xs text-gray-600">Document Intelligence</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {navigationItems.map((item) => {
            const IconComponent = item.icon
            const isActive = activeTab === item.id
            
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any)
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className={`p-1.5 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  <IconComponent className="w-4 h-4" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-xs opacity-75">{item.description}</div>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200/50">
          <div className="text-xs text-gray-500 text-center">
            Advanced RAG Technology
          </div>
        </div>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Header for Mobile */}
        <header className="lg:hidden bg-white/80 backdrop-blur-sm border-b border-gray-200/50 p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{getPageTitle()}</h1>
            <div className="w-9" /> {/* Spacer for centering */}
          </div>
        </header>

        {/* Page Header */}
        <div className="hidden lg:block border-b border-gray-200/50 bg-white/40 backdrop-blur-sm">
          <div className="px-8 py-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{getPageTitle()}</h1>
            <p className="text-gray-600 max-w-3xl">{getPageDescription()}</p>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 p-4 lg:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {activeTab === 'chat' && (
              <div className="h-full">
                <UnifiedChatInterface />
              </div>
            )}
            
            {activeTab === 'smart' && (
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-8">
                <SmartUpload />
              </div>
            )}
            
            {activeTab === 'youtube' && (
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-8">
                <YouTubeUpload />
              </div>
            )}
            
            {activeTab === 'manage' && (
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-8">
                <DocumentManager />
              </div>
            )}
            
            {activeTab === 'database' && (
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-8">
                <DatabaseView />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
} 