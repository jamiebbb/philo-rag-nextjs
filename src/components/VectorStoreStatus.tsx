'use client'

import { useState, useEffect } from 'react'
import { Database, CheckCircle, AlertCircle, RefreshCw, Activity } from 'lucide-react'
import { VectorStoreInfo } from '@/types'

export function VectorStoreStatus() {
  const [status, setStatus] = useState<VectorStoreInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/vector-store/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Error fetching status:', error)
    } finally {
      setLoading(false)
    }
  }

  const testVectorStore = async () => {
    setTesting(true)
    try {
      const response = await fetch('/api/vector-store/test', {
        method: 'POST'
      })
      
      if (response.ok) {
        const data = await response.json()
        alert(`Test successful! Found ${data.results?.length || 0} results`)
      } else {
        alert('Test failed. Check console for details.')
      }
    } catch (error) {
      console.error('Error testing vector store:', error)
      alert('Test failed. Check console for details.')
    } finally {
      setTesting(false)
    }
  }

  const getStatusIcon = () => {
    if (!status) return <AlertCircle className="w-6 h-6 text-gray-400" />
    
    switch (status.status) {
      case 'enhanced':
        return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'standard':
        return <CheckCircle className="w-6 h-6 text-yellow-500" />
      case 'failed':
        return <AlertCircle className="w-6 h-6 text-red-500" />
      default:
        return <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
    }
  }

  const getStatusColor = () => {
    if (!status) return 'text-gray-600'
    
    switch (status.status) {
      case 'enhanced':
        return 'text-green-600'
      case 'standard':
        return 'text-yellow-600'
      case 'failed':
        return 'text-red-600'
      default:
        return 'text-blue-600'
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Vector Store Status</h2>

      {/* Status Overview */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3 mb-4">
          {getStatusIcon()}
          <div>
            <h3 className={`text-lg font-semibold ${getStatusColor()}`}>
              {status?.status ? status.status.charAt(0).toUpperCase() + status.status.slice(1) : 'Unknown'} Vector Store
            </h3>
            <p className="text-sm text-gray-600">
              {status?.status === 'enhanced' && 'Enhanced vector store with full metadata support'}
              {status?.status === 'standard' && 'Standard vector store with basic functionality'}
              {status?.status === 'failed' && 'Vector store connection failed'}
              {status?.status === 'loading' && 'Checking vector store status...'}
            </p>
          </div>
        </div>

        {status?.error_message && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{status.error_message}</p>
          </div>
        )}
      </div>

      {/* Statistics */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-blue-500" />
              <h4 className="font-medium text-gray-900">Documents</h4>
            </div>
            <p className="text-2xl font-bold text-blue-600">{status.document_count}</p>
            <p className="text-sm text-gray-600">Total documents</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-green-500" />
              <h4 className="font-medium text-gray-900">Chunks</h4>
            </div>
            <p className="text-2xl font-bold text-green-600">{status.chunk_count}</p>
            <p className="text-sm text-gray-600">Vector embeddings</p>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-5 h-5 text-purple-500" />
              <h4 className="font-medium text-gray-900">Last Updated</h4>
            </div>
            <p className="text-sm font-medium text-purple-600">
              {status.last_updated ? new Date(status.last_updated).toLocaleDateString() : 'Never'}
            </p>
            <p className="text-sm text-gray-600">Database sync</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>

        <button
          onClick={testVectorStore}
          disabled={testing || !status || status.status === 'failed'}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Activity className={`w-4 h-4 ${testing ? 'animate-pulse' : ''}`} />
          Test Vector Store
        </button>
      </div>

      {/* Help Section - Rewritten to avoid quotes */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Troubleshooting</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• If the vector store shows as Failed, check your Supabase configuration</p>
          <p>• Ensure the documents_enhanced table exists in your database</p>
          <p>• Verify your environment variables are set correctly</p>
          <p>• Check the browser console for detailed error messages</p>
        </div>
      </div>
    </div>
  )
} 