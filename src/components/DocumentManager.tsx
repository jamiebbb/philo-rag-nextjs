'use client'

import { useState, useEffect } from 'react'
import { FileText, Trash2, Edit, Search, Filter } from 'lucide-react'
import { Document } from '@/types'
import { formatDate } from '@/lib/utils'

export function DocumentManager() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/documents')
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== id))
      }
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.content.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFilter = !filterType || doc.doc_type === filterType
    
    return matchesSearch && matchesFilter
  })

  const uniqueTypes = [...new Set(documents.map(doc => doc.doc_type).filter(Boolean))]

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Document Manager</h2>

      {/* Search and Filter */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="pl-10 pr-8 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Documents List */}
      <div className="space-y-4">
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No documents found</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <h3 className="font-semibold text-gray-900">{doc.title}</h3>
                    {doc.doc_type && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {doc.doc_type}
                      </span>
                    )}
                  </div>
                  
                  {doc.author && (
                    <p className="text-sm text-gray-600 mb-1">
                      by {doc.author}
                    </p>
                  )}
                  
                  <p className="text-sm text-gray-500 mb-2">
                    {doc.content.substring(0, 150)}...
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Created: {formatDate(doc.created_at)}</span>
                    {doc.chunk_count && (
                      <span>{doc.chunk_count} chunks</span>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => setSelectedDoc(doc)}
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                    title="View details"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteDocument(doc.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Document Details Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">{selectedDoc.title}</h3>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                {selectedDoc.author && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Author</label>
                    <p className="text-gray-900">{selectedDoc.author}</p>
                  </div>
                )}
                
                {selectedDoc.doc_type && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <p className="text-gray-900">{selectedDoc.doc_type}</p>
                  </div>
                )}
                
                {selectedDoc.genre && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Genre</label>
                    <p className="text-gray-900">{selectedDoc.genre}</p>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Content Preview</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-md max-h-40 overflow-y-auto">
                    <p className="text-sm text-gray-700">{selectedDoc.content.substring(0, 500)}...</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Created</label>
                    <p className="text-gray-900">{formatDate(selectedDoc.created_at)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Updated</label>
                    <p className="text-gray-900">
                      {selectedDoc.updated_at ? formatDate(selectedDoc.updated_at) : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 