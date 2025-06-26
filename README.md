# PHILO RAG System

A modern NextJS application for intelligent document processing and question-answering using Retrieval-Augmented Generation (RAG).

## 🚀 Features

- **Enhanced RAG System**: Advanced document retrieval with metadata filtering
- **PDF Processing**: Upload and process PDF documents with AI-powered metadata generation
- **YouTube Integration**: Process YouTube videos with automatic transcript extraction
- **User Feedback System**: Collect and incorporate user feedback to improve responses
- **Document Management**: Advanced tracking and filtering of uploaded documents
- **Real-time Chat**: Interactive chat interface with source citations

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase
- **AI/ML**: OpenAI GPT-4, LangChain, Vector Embeddings
- **Database**: Supabase (PostgreSQL with pgvector)
- **Deployment**: Vercel, Netlify, or any Node.js hosting

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key

## ⚙️ Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd philo-rag-nextjs
npm install
```

### 2. Environment Variables

Copy the example environment file and add your API keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual keys:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-actual-openai-key

# Supabase Configuration  
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-supabase-anon-key
SUPABASE_SERVICE_KEY=your-actual-supabase-service-key

# YouTube Transcript Service (Supadata API)
SUPADATA_API_KEY=your_supadata_api_key

# App Configuration
NEXT_PUBLIC_APP_NAME=PHILO RAG System
NEXT_PUBLIC_APP_VERSION=1.0.0
NODE_ENV=development
```

### 3. Database Setup

Run the SQL scripts in your Supabase SQL editor:

1. **Enhanced Documents Table**: `setup_enhanced_documents_table.sql`
2. **Feedback System**: `setup_feedback_table.sql` 
3. **Document Tracker**: `setup_document_tracker_table.sql`

See `DEPLOYMENT.md` for complete SQL scripts.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## 🔑 Getting API Keys

### OpenAI API Key
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Create an account and navigate to "API Keys"
3. Generate a new secret key

### Supabase Keys
1. Create a project at [Supabase](https://app.supabase.com/)
2. Go to Settings → API
3. Copy the Project URL and API keys

### Supadata API Key
- The YouTube transcript service key is provided in the example
- For production, consider getting your own key from [Supadata](https://supadata.ai/)

## 🚀 Deployment

### Vercel (Recommended)
1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Netlify
1. Push to GitHub
2. Connect repository to Netlify
3. Add environment variables in build settings
4. Deploy

### Other Platforms
The app can be deployed on any platform supporting Node.js. Ensure environment variables are set correctly.

## 📁 Project Structure

```
src/
├── app/                    # Next.js 13+ app directory
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
├── lib/                   # Utility libraries
│   ├── supabase.ts       # Supabase client
│   ├── openai.ts         # OpenAI client
│   ├── youtube.ts        # YouTube utilities
│   ├── feedback.ts       # Feedback system
│   └── document-tracker.ts # Document management
└── types/                 # TypeScript type definitions
```

## 🛡️ Security

- All API keys are stored in environment variables
- `.env.local` is excluded from Git via `.gitignore`
- Supabase Row Level Security (RLS) policies recommended
- API routes include proper error handling

## 📝 Usage

1. **Upload Documents**: Use the upload tab to add PDFs or YouTube URLs
2. **Chat Interface**: Ask questions about your uploaded documents
3. **Provide Feedback**: Rate responses to improve the system
4. **Manage Documents**: View and edit document metadata in the management tab

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter issues:

1. Check the environment variables are set correctly
2. Ensure Supabase tables are created with proper schemas
3. Verify API keys have sufficient permissions
4. Check the console for detailed error messages

For additional help, please open an issue on GitHub. 