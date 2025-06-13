'use client'

import { useState, useEffect } from 'react'
import { Database, FileText, Video, Book, Search, Filter, Eye, BarChart3, Users, Calendar, Tag, Layers } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface DatabaseDocument {
  id: string
  title: string
  author: string
  doc_type: string
  genre: string
  topic: string
  difficulty: string
  tags: string[]
  source_type: string
  source: string
  summary: string
  created_at: string
  updated_at: string
  content: string
  chunk_id: number
  total_chunks: number
  metadata: any
}

interface DatabaseStats {
  totalDocuments: number
  totalChunks: number
  uniqueDocuments: number
  averageChunksPerDocument: number
  documentsByType: { [key: string]: number }
  documentsBySource: { [key: string]: number }
  documentsByAuthor: { [key: string]: number }
  latestUpload: string
}

export function DatabaseView() {
  const [documents, setDocuments] = useState<DatabaseDocument[]>([])
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [selectedDocument, setSelectedDocument] = useState<DatabaseDocument | null>(null)
  const [viewMode, setViewMode] = useState<'documents' | 'chunks'>('documents')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [itemsPerPage, setItemsPerPage] = useState(1000)

  useEffect(() => {
    fetchDatabaseData()
  }, [currentPage])

  const fetchDatabaseData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/database-view?page=${currentPage}&limit=${itemsPerPage}`)
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents)
        setStats(data.stats)
        setTotalPages(data.pagination.totalPages)
        setTotalItems(data.pagination.totalItems)
        setItemsPerPage(data.pagination.itemsPerPage)
      }
    } catch (error) {
      console.error('Error fetching database data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getUniqueDocuments = () => {
    const documentMap = new Map()
    documents.forEach(doc => {
      const key = `${doc.title}_${doc.author}_${doc.source_type}`
      if (!documentMap.has(key)) {
        documentMap.set(key, {
          ...doc,
          chunks: [doc],
          chunkCount: 1
        })
      } else {
        const existing = documentMap.get(key)
        existing.chunks.push(doc)
        existing.chunkCount = existing.chunks.length
        existing.total_chunks = Math.max(existing.total_chunks, doc.total_chunks)
      }
    })
    return Array.from(documentMap.values())
  }

  const filteredData = () => {
    const dataToFilter = viewMode === 'documents' ? getUniqueDocuments() : documents
    
    return dataToFilter.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.topic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.summary?.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesType = !filterType || item.doc_type === filterType
      const matchesSource = !filterSource || item.source_type === filterSource
      
      return matchesSearch && matchesType && matchesSource
    })
  }

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'youtube_video': return <Video className="w-4 h-4 text-red-500" />
      case 'pdf_upload': return <Book className="w-4 h-4 text-blue-500" />
      default: return <FileText className="w-4 h-4 text-gray-500" />
    }
  }

  const uniqueTypes = [...new Set(documents.map(doc => doc.doc_type).filter(Boolean))]
  const uniqueSources = [...new Set(documents.map(doc => doc.source_type).filter(Boolean))]

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Database View</h2>
            <p className="text-sm text-gray-600">Complete vector database contents</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('documents')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'documents' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Documents
          </button>
          <button
            onClick={() => setViewMode('chunks')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'chunks' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Chunks
          </button>
        </div>
      </div>

      {/* Database Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.uniqueDocuments}</div>
                <div className="text-sm text-blue-600">Unique Documents</div>
              </div>
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.totalChunks}</div>
                <div className="text-sm text-green-600">Total Chunks</div>
              </div>
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-purple-600">{stats.averageChunksPerDocument.toFixed(1)}</div>
                <div className="text-sm text-purple-600">Avg Chunks/Doc</div>
              </div>
            </div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-600" />
              <div>
                <div className="text-sm font-bold text-orange-600">Latest Upload</div>
                <div className="text-xs text-orange-600">{stats.latestUpload}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={`Search ${viewMode}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
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
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Sources</option>
            <option value="pdf_upload">PDFs</option>
            <option value="youtube_video">Videos</option>
          </select>
        </div>
      </div>

      {/* Query Examples */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Tag className="w-4 h-4" />
          What You Can Query
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
          <div>• &quot;Who is the CEO of [Company Name]?&quot;</div>
          <div>• &quot;What are the main topics in [Document Title]?&quot;</div>
          <div>• &quot;Tell me about [Author]&apos;s key points&quot;</div>
          <div>• &quot;How many employees does [Company] have?&quot;</div>
          <div>• &quot;What did [Speaker] say about [Topic]?&quot;</div>
          <div>• &quot;Compare [Document A] and [Document B]&quot;</div>
        </div>
      </div>

      {/* Content List */}
      <div className="space-y-4">
        {filteredData().length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Database className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">No {viewMode} found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          filteredData().map((item, index) => (
            <div
              key={item.id + index}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getSourceIcon(item.source_type)}
                    <h3 className="font-semibold text-gray-900">{item.title}</h3>
                    {item.doc_type && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {item.doc_type}
                      </span>
                    )}
                    {viewMode === 'documents' ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        {item.chunkCount || item.total_chunks} chunks
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                        Chunk {item.chunk_id}/{item.total_chunks}
                      </span>
                    )}
                  </div>
                  
                  {item.author && (
                    <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {item.author}
                    </p>
                  )}
                  
                  {item.topic && (
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Topic:</span> {item.topic}
                    </p>
                  )}
                  
                  <p className="text-sm text-gray-500 mb-2">
                    {viewMode === 'documents' 
                      ? (item.summary || item.content.substring(0, 150))
                      : item.content.substring(0, 200)
                    }...
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(item.created_at)}
                    </span>
                    <span className="capitalize">{item.source_type?.replace('_', ' ')}</span>
                    {item.difficulty && <span>Difficulty: {item.difficulty}</span>}
                    {viewMode === 'chunks' && (
                      <span>Characters: {item.content.length}</span>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => setSelectedDocument(item)}
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-1 justify-between sm:hidden">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
              <span className="font-medium">
                {Math.min(currentPage * itemsPerPage, totalItems)}
              </span>{' '}
              of <span className="font-medium">{totalItems}</span> results
            </p>
          </div>
          <div>
            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
              >
                <span className="sr-only">Previous</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                      currentPage === pageNum
                        ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                        : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
              >
                <span className="sr-only">Next</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Document Details Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {getSourceIcon(selectedDocument.source_type)}
                  <h3 className="text-xl font-semibold">{selectedDocument.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedDocument(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Author</label>
                    <p className="text-gray-900">{selectedDocument.author || 'Unknown'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <p className="text-gray-900">{selectedDocument.doc_type}</p>
                  </div>
                  
                  {selectedDocument.topic && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Topic</label>
                      <p className="text-gray-900">{selectedDocument.topic}</p>
                    </div>
                  )}
                  
                  {selectedDocument.genre && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Genre</label>
                      <p className="text-gray-900">{selectedDocument.genre}</p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Source</label>
                    <p className="text-gray-900 capitalize">{selectedDocument.source_type.replace('_', ' ')}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {viewMode === 'chunks' ? 'Chunk Position' : 'Total Chunks'}
                    </label>
                    <p className="text-gray-900">
                      {viewMode === 'chunks' 
                        ? `${selectedDocument.chunk_id} of ${selectedDocument.total_chunks}` 
                        : selectedDocument.total_chunks
                      }
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Created</label>
                    <p className="text-gray-900">{formatDate(selectedDocument.created_at)}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Content Length</label>
                    <p className="text-gray-900">{selectedDocument.content.length} characters</p>
                  </div>
                </div>
              </div>
              
              {selectedDocument.summary && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Summary</label>
                  <div className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm text-gray-700">{selectedDocument.summary}</p>
                  </div>
                </div>
              )}
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {viewMode === 'chunks' ? 'Chunk Content' : 'Content Preview'}
                </label>
                <div className="p-3 bg-gray-50 rounded-md max-h-60 overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedDocument.content}
                  </p>
                </div>
              </div>
              
              {selectedDocument.metadata && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Metadata</label>
                  <div className="p-3 bg-gray-50 rounded-md max-h-40 overflow-y-auto">
                    <pre className="text-xs text-gray-600">
                      {JSON.stringify(selectedDocument.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 