import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PHILO - Advanced Document Intelligence Platform',
  description: 'AI-powered document processing and intelligent knowledge discovery. Upload PDFs, chat with your documents, and extract insights using advanced RAG technology.',
  keywords: ['AI', 'document processing', 'RAG', 'PDF analysis', 'knowledge management', 'artificial intelligence'],
  authors: [{ name: 'PHILO Team' }],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'PHILO - Advanced Document Intelligence Platform',
    description: 'AI-powered document processing and intelligent knowledge discovery',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PHILO - Advanced Document Intelligence Platform',
    description: 'AI-powered document processing and intelligent knowledge discovery',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="mask-icon" href="/favicon.svg" color="#3B82F6" />
        <meta name="theme-color" content="#3B82F6" />
      </head>
      <body className={inter.className}>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
} 