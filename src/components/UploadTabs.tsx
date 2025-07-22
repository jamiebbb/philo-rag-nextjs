'use client'

import { useState } from 'react'
import { Server, Monitor, FileText, Youtube, Package } from 'lucide-react'
import { DocumentUpload } from './DocumentUpload'
import { ChunkedUpload } from './ChunkedUpload'
import DocumentUploadClient from './DocumentUploadClient'
import { YouTubeUpload } from './YouTubeUpload'

type TabType = 'basic' | 'chunked' | 'server' | 'client' | 'youtube'

export default function UploadTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('basic')

  const tabs = [
    {
      id: 'basic' as TabType,
      name: 'Basic Upload',
      icon: FileText,
      description: 'Simple server-side processing for smaller files',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-600',
      featureColor: 'text-blue-600'
    },
    {
      id: 'chunked' as TabType,
      name: 'Chunked Upload',
      icon: Package,
      description: 'Break large files into chunks for Vercel compatibility',
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-600',
      featureColor: 'text-orange-600'
    },
    {
      id: 'client' as TabType,
      name: 'Client-Side',
      icon: Monitor,
      description: 'Process files locally in your browser',
      bgColor: 'bg-green-100',
      textColor: 'text-green-600',
      featureColor: 'text-green-600'
    },
    {
      id: 'server' as TabType,
      name: 'Server-Side',
      icon: Server,
      description: 'Traditional server processing',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-600',
      featureColor: 'text-purple-600'
    },
    {
      id: 'youtube' as TabType,
      name: 'YouTube',
      icon: Youtube,
      description: 'Upload video transcripts',
      bgColor: 'bg-red-100',
      textColor: 'text-red-600',
      featureColor: 'text-red-600'
    }
  ]

  const renderFeatures = (tabId: TabType, featureColor: string) => {
    const features = {
      basic: ['✓ Simple & fast', '✓ Direct processing', '✓ < 4MB files'],
      chunked: ['✓ Handles Vercel limits', '✓ 2MB chunks', '✓ Session tracking'],
      client: ['✓ Browser processing', '✓ Large files', '✓ No server limits'],
      server: ['✓ Traditional method', '✓ Server processing', '✓ Reliable'],
      youtube: ['✓ Video transcripts', '✓ AI enhancement', '✓ Multiple formats']
    }

    return (
      <div className="space-y-1">
        {features[tabId].map((feature, index) => (
          <div key={index} className={featureColor}>{feature}</div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Advanced Upload Options</h2>
        <p className="text-gray-600">Choose the upload method that best fits your needs</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const IconComponent = tab.icon
            const isActive = activeTab === tab.id
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative min-w-0 overflow-hidden py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded transition-colors ${isActive ? tab.bgColor : 'group-hover:bg-gray-100'}`}>
                    <IconComponent className={`w-4 h-4 ${isActive ? tab.textColor : 'text-gray-400 group-hover:text-gray-500'}`} />
                  </div>
                  <span>{tab.name}</span>
                </div>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {tabs.map((tab) => {
          const IconComponent = tab.icon
          const isActive = activeTab === tab.id
          
          return (
            <div 
              key={tab.id} 
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                isActive
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${isActive ? tab.bgColor : 'bg-gray-100'}`}>
                  <IconComponent className={`w-5 h-5 ${isActive ? tab.textColor : 'text-gray-500'}`} />
                </div>
                <h3 className="font-semibold text-gray-900">{tab.name}</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">{tab.description}</p>
              {renderFeatures(tab.id, tab.featureColor)}
            </div>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="transition-opacity duration-300">
        {activeTab === 'basic' && <DocumentUpload />}
        {activeTab === 'chunked' && <ChunkedUpload />}
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
              <p><strong>Basic Upload:</strong> Simple server-side processing for files under 4MB. Best for quick uploads of smaller documents.</p>
              <p><strong>Chunked Upload:</strong> Splits large files into 2MB chunks to bypass Vercel&apos;s 4.5MB limit. Uses upload sessions to track progress and reassemble files server-side.</p>
              <p><strong>Client-Side:</strong> Best for large PDF books (10MB+). Processes files in your browser using PDF.js.</p>
              <p><strong>Server-Side:</strong> Traditional server processing method. Reliable for standard document uploads.</p>
              <p><strong>YouTube:</strong> Extracts transcripts using SUPADATA API and corrects grammar with GPT-4o-mini.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 