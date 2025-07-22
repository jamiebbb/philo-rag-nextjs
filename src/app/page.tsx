'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Bot, Upload, Youtube, Settings, Database, MessageSquare, FileText, BookOpen, Brain } from 'lucide-react'

// Dynamic imports to prevent SSR issues
const SmartUpload = dynamic(() => import('@/components/SmartUpload').then(mod => ({ default: mod.SmartUpload })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-12">
      <div className="animate-pulse text-gray-500">Loading upload interface...</div>
    </div>
  )
})

const UploadTabs = dynamic(() => import('@/components/UploadTabs'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="animate-pulse text-gray-500">Loading upload interface...</div>
    </div>
  )
})

import { UnifiedChatInterface } from '@/components/UnifiedChatInterface'
import { DocumentManager } from '@/components/DocumentManager'
import { YouTubeUpload } from '@/components/YouTubeUpload'
import { DatabaseView } from '@/components/DatabaseView'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chat' | 'upload' | 'youtube' | 'manage' | 'database'>('chat')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Professional Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  PHILO
                </h1>
                <p className="text-sm text-gray-600">Advanced Document Intelligence Platform</p>
              </div>
            </div>
            
            {/* Quick Stats or Actions */}
            <div className="hidden md:flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                <span>AI-Powered</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>Smart Processing</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        {activeTab === 'chat' && (
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-gray-900 mb-3">
              Welcome to PHILO
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Your intelligent document companion. Upload PDFs, chat with your knowledge base, and discover insights with AI-powered analysis.
            </p>
          </div>
        )}

        {/* Smart Upload Hero Section */}
        {activeTab === 'upload' && (
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Upload className="w-4 h-4" />
              Smart Upload System
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-3">
              Upload Documents
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Intelligent file processing that automatically handles any size document. Upload PDFs up to 50MB+ with our advanced chunking system.
            </p>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-2">
            <div className="flex space-x-2 overflow-x-auto">
              {[
                { 
                  id: 'chat', 
                  label: 'PHILO Chat', 
                  icon: MessageSquare, 
                  description: 'AI Assistant',
                  color: 'blue'
                },
                { 
                  id: 'upload', 
                  label: 'Smart Upload', 
                  icon: Upload, 
                  description: 'Process Documents',
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
              ].map((tab) => {
                const IconComponent = tab.icon
                const isActive = activeTab === tab.id
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`group flex items-center gap-3 px-6 py-4 rounded-xl font-medium transition-all duration-300 whitespace-nowrap ${
                      isActive
                        ? 'bg-white text-gray-900 shadow-lg ring-1 ring-gray-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg transition-colors ${
                      isActive 
                        ? `bg-${tab.color}-100 text-${tab.color}-600` 
                        : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                    }`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold">{tab.label}</div>
                      <div className="text-xs opacity-75">{tab.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          {activeTab === 'chat' && (
            <div className="space-y-8">
              {/* Quick Upload Card */}
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-8">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium mb-3">
                    <Upload className="w-4 h-4" />
                    Quick Upload
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Add Knowledge to PHILO
                  </h3>
                  <p className="text-gray-600 max-w-xl mx-auto">
                    Upload PDFs to expand PHILO&apos;s knowledge base. Smart processing handles any file size automatically.
                  </p>
                </div>
                
                <SmartUpload />
              </div>
              
              {/* Chat Interface */}
              <UnifiedChatInterface />
            </div>
          )}
          
          {activeTab === 'upload' && (
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-8">
              <UploadTabs />
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
      </div>
    </div>
  )
} 