'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Import UploadTabs as client-side only to avoid pdfjs-dist SSR issues
const UploadTabs = dynamic(() => import('@/components/UploadTabs'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      <span className="ml-4 text-gray-600">Loading upload interface...</span>
    </div>
  )
})

export default function EnhancedUploadPage() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <span className="ml-4 text-gray-600">Loading upload interface...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <UploadTabs />
    </div>
  )
} 