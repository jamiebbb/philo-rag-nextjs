# Deployment Guide - PHILO RAG Next.js

This guide covers deploying the PHILO RAG Next.js application to various platforms.

## Prerequisites

- Completed local setup (see README.md)
- Supabase project configured
- OpenAI API key
- Git repository

## Vercel Deployment (Recommended)

Vercel is the easiest platform for deploying Next.js applications.

### 1. Prepare for Deployment

```bash
# Ensure all dependencies are installed
npm install

# Test the build locally
npm run build
```

### 2. Deploy to Vercel

#### Option A: Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow the prompts to configure your project
```

#### Option B: GitHub Integration
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your GitHub repository
4. Configure environment variables (see below)
5. Deploy

### 3. Environment Variables

In your Vercel dashboard, add these environment variables:

```
OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key_here
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 4. Custom Domain (Optional)

1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Update DNS records as instructed

## Netlify Deployment

### 1. Build Configuration

Create `netlify.toml` in the project root:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

### 2. Deploy

1. Push code to GitHub
2. Connect repository to Netlify
3. Configure environment variables
4. Deploy

## Railway Deployment

### 1. Railway Configuration

Create `railway.toml`:

```toml
[build]
  builder = "nixpacks"

[deploy]
  startCommand = "npm start"
```

### 2. Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

## Docker Deployment

### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### 2. Build and Run

```bash
# Build image
docker build -t philo-rag .

# Run container
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=your_key \
  -e NEXT_PUBLIC_SUPABASE_URL=your_url \
  -e SUPABASE_SERVICE_ROLE_KEY=your_key \
  philo-rag
```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for embeddings and chat | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `NEXT_PUBLIC_APP_URL` | Your app's public URL | No |

## Post-Deployment Checklist

### 1. Verify Database Connection
- Test the Status tab in your deployed app
- Ensure vector store shows as "Enhanced"
- Check document and chunk counts

### 2. Test Core Functionality
- Upload a test PDF document
- Preview chunks before upload
- Upload to Supabase successfully
- Ask questions in the chat interface
- Verify source citations appear

### 3. Performance Optimization
- Enable Vercel Analytics (if using Vercel)
- Monitor API response times
- Check Supabase usage metrics
- Optimize chunk sizes if needed

### 4. Security Considerations
- Ensure environment variables are secure
- Use service role key (not anon key) for server-side operations
- Implement rate limiting if needed
- Monitor OpenAI API usage

## Troubleshooting Deployment Issues

### Build Errors

1. **TypeScript Errors**
   ```bash
   # Skip type checking during build (not recommended for production)
   npm run build -- --no-type-check
   ```

2. **Dependency Issues**
   ```bash
   # Clear cache and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

### Runtime Errors

1. **Environment Variables Not Found**
   - Verify all required env vars are set
   - Check variable names match exactly
   - Restart deployment after adding variables

2. **Database Connection Issues**
   - Verify Supabase URL and key
   - Check if vector extension is enabled
   - Ensure database table exists

3. **OpenAI API Errors**
   - Verify API key is valid
   - Check account has sufficient credits
   - Monitor rate limits

### Performance Issues

1. **Slow PDF Processing**
   - Reduce chunk size
   - Process files in batches
   - Consider using background jobs

2. **Vector Search Timeouts**
   - Optimize database indexes
   - Reduce match_count parameter
   - Increase match_threshold

## Monitoring and Maintenance

### 1. Application Monitoring
- Set up error tracking (Sentry, LogRocket)
- Monitor API response times
- Track user engagement metrics

### 2. Database Maintenance
- Monitor Supabase usage
- Clean up old documents if needed
- Optimize vector indexes periodically

### 3. Cost Management
- Monitor OpenAI API usage
- Set up billing alerts
- Optimize embedding generation

## Scaling Considerations

### 1. Horizontal Scaling
- Use serverless functions for API routes
- Implement caching for frequent queries
- Consider CDN for static assets

### 2. Database Scaling
- Monitor Supabase performance
- Consider read replicas for heavy read workloads
- Implement connection pooling

### 3. File Storage
- Use cloud storage for large files
- Implement file compression
- Consider background processing for uploads

## Support and Updates

### 1. Keeping Dependencies Updated
```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Update Next.js specifically
npm install next@latest
```

### 2. Security Updates
- Monitor security advisories
- Update dependencies regularly
- Review and rotate API keys periodically

### 3. Feature Updates
- Follow the project repository for updates
- Test new features in staging environment
- Maintain backward compatibility 