'use client'

import React, { useState, useEffect } from 'react'
import { Server, Monitor, FileText, Youtube } from 'lucide-react'
import { DocumentUpload } from './DocumentUpload'
import DocumentUploadClient from './DocumentUploadClient'
import { YouTubeUpload } from './YouTubeUpload'

// Browser environment check
const isBrowser = typeof window !== 'undefined'

type TabType = 'server' | 'client' | 'youtube'

export default function UploadTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('client')
  const [isMounted, setIsMounted] = useState(false)

  // Only mount the component on the client side
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Don't render on server or before client hydration
  if (!isBrowser || !isMounted) {
    return (
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
            <span className="ml-4 text-gray-600">Loading upload interface...</span>
          </div>
        </div>
      </div>
    )
  }

  const tabs = [
    {
      id: 'client' as TabType,
      name: 'Client-Side Processing',
      icon: Monitor,
      description: 'Process large files locally (Recommended for books)',
      color: 'green',
      recommended: true
    },
    {
      id: 'server' as TabType,
      name: 'Server-Side Processing',
      icon: Server,
      description: 'Process small files on server (< 2MB)',
      color: 'blue'
    },
    {
      id: 'youtube' as TabType,
      name: 'YouTube Videos',
      icon: Youtube,
      description: 'Process YouTube videos with transcripts',
      color: 'red'
    }
  ]

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Document Upload Hub</h1>
        <p className="text-gray-600 mb-6">Choose your preferred processing method based on file size and type</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                  isActive
                    ? `border-${tab.color}-500 bg-${tab.color}-50`
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                {tab.recommended && (
                  <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                    Recommended
                  </span>
                )}
                
                <div className="flex items-center gap-3 mb-2">
                  <Icon className={`w-6 h-6 ${
                    isActive ? `text-${tab.color}-600` : 'text-gray-500'
                  }`} />
                  <h3 className={`font-semibold ${
                    isActive ? `text-${tab.color}-800` : 'text-gray-700'
                  }`}>
                    {tab.name}
                  </h3>
                </div>
                
                <p className="text-sm text-gray-600">{tab.description}</p>
                
                {/* Feature highlights */}
                <div className="mt-3 text-xs">
                  {tab.id === 'client' && (
                    <div className="space-y-1">
                      <div className="text-green-600">✓ No file size limits</div>
                      <div className="text-green-600">✓ Process locally</div>
                      <div className="text-green-600">✓ Faster for large files</div>
                    </div>
                  )}
                  {tab.id === 'server' && (
                    <div className="space-y-1">
                      <div className="text-blue-600">✓ Simple upload</div>
                      <div className="text-blue-600">✓ Server processing</div>
                      <div className="text-orange-600">⚠ Limited to 2MB</div>
                    </div>
                  )}
                  {tab.id === 'youtube' && (
                    <div className="space-y-1">
                      <div className="text-red-600">✓ Auto transcripts</div>
                      <div className="text-red-600">✓ Smart metadata</div>
                      <div className="text-red-600">✓ Grammar correction</div>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="transition-opacity duration-300">
        {activeTab === 'client' && <DocumentUploadClient />}
        {activeTab === 'server' && <DocumentUpload />}
        {activeTab === 'youtube' && <YouTubeUpload />}
      </div>

      {/* Info Panel */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-800 mb-1">Processing Methods Comparison</h4>
            <div className="text-sm text-blue-700 space-y-1">
              <p><strong>Client-Side:</strong> Best for large PDF books (10MB+). Processes files in your browser using PDF.js.</p>
              <p><strong>Server-Side:</strong> Best for small documents (&lt;2MB). Uses Vercel serverless functions.</p>
              <p><strong>YouTube:</strong> Extracts transcripts using SUPADATA API and corrects grammar with GPT-4o-mini.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 