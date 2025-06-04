'use client'

import { useState } from 'react'
import { DocumentUpload } from '@/components/DocumentUpload'
import { ChatInterface } from '@/components/ChatInterface'
import { DocumentManager } from '@/components/DocumentManager'
import { VectorStoreStatus } from '@/components/VectorStoreStatus'
import { YouTubeUpload } from '@/components/YouTubeUpload'
import { YouTubeUploadImproved } from '@/components/YouTubeUploadImproved'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chat' | 'upload' | 'youtube' | 'youtube-ai' | 'manage' | 'status'>('chat')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            PHILO RAG System
          </h1>
          <p className="text-lg text-gray-600">
            Advanced Document Intelligence with Agentic RAG
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-md p-1">
            <div className="flex space-x-1 overflow-x-auto">
              {[
                { id: 'chat', label: '💬 Chat', icon: '💬' },
                { id: 'upload', label: '📄 Upload', icon: '📄' },
                { id: 'youtube', label: '📺 YouTube', icon: '📺' },
                { id: 'youtube-ai', label: '🤖 Smart YouTube', icon: '🤖' },
                { id: 'manage', label: '📚 Manage', icon: '📚' },
                { id: 'status', label: '⚡ Status', icon: '⚡' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-3 rounded-md font-medium transition-all duration-200 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          {activeTab === 'chat' && <ChatInterface />}
          {activeTab === 'upload' && <DocumentUpload />}
          {activeTab === 'youtube' && <YouTubeUpload />}
          {activeTab === 'youtube-ai' && <YouTubeUploadImproved />}
          {activeTab === 'manage' && <DocumentManager />}
          {activeTab === 'status' && <VectorStoreStatus />}
        </div>
      </div>
    </div>
  )
} 