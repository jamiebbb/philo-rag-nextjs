import { Suspense } from 'react'
import { Metadata } from 'next'
import UploadTabs from '@/components/UploadTabs'

export const metadata: Metadata = {
  title: 'Enhanced Document Upload | PHILO RAG',
  description: 'Upload documents with both server-side and client-side processing options'
}

export default function EnhancedUploadPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Suspense fallback={
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      }>
        <UploadTabs />
      </Suspense>
    </div>
  )
} 