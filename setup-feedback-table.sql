-- Feedback Table Setup for PHILO RAG Next.js App
-- Run this script in your Supabase SQL editor to set up the feedback system

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the feedback table with the exact schema expected by the Next.js app
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_query TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful', 'not_helpful', 'partial', 'detailed')),
    chat_id TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    query_embedding vector(1536), -- For similarity search
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS feedback_feedback_type_idx ON feedback (feedback_type);
CREATE INDEX IF NOT EXISTS feedback_chat_id_idx ON feedback (chat_id);
CREATE INDEX IF NOT EXISTS feedback_rating_idx ON feedback (rating);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at);
CREATE INDEX IF NOT EXISTS feedback_embedding_idx ON feedback USING ivfflat (query_embedding vector_cosine_ops);

-- Create RPC function for embedding-based feedback search
CREATE OR REPLACE FUNCTION match_feedback_by_embedding(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE(
    id uuid,
    user_query text,
    ai_response text,
    feedback_type text,
    chat_id text,
    rating integer,
    comment text,
    created_at timestamp with time zone,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        feedback.id,
        feedback.user_query,
        feedback.ai_response,
        feedback.feedback_type,
        feedback.chat_id,
        feedback.rating,
        feedback.comment,
        feedback.created_at,
        1 - (feedback.query_embedding <=> query_embedding) AS similarity
    FROM feedback
    WHERE 1 - (feedback.query_embedding <=> query_embedding) > match_threshold
    AND feedback.comment IS NOT NULL
    AND LENGTH(TRIM(feedback.comment)) > 0
    ORDER BY feedback.query_embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Create a view for feedback statistics
CREATE OR REPLACE VIEW feedback_stats AS
SELECT 
    COUNT(*) as total_feedback,
    COUNT(CASE WHEN feedback_type = 'helpful' THEN 1 END) as helpful_count,
    COUNT(CASE WHEN feedback_type = 'not_helpful' THEN 1 END) as not_helpful_count,
    COUNT(CASE WHEN feedback_type = 'partial' THEN 1 END) as partial_count,
    COUNT(CASE WHEN feedback_type = 'detailed' THEN 1 END) as detailed_count,
    AVG(rating) as avg_rating,
    COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as rated_responses,
    MIN(created_at) as first_feedback,
    MAX(created_at) as latest_feedback
FROM feedback;

-- Create a view for daily feedback trends
CREATE OR REPLACE VIEW daily_feedback_trends AS
SELECT 
    DATE(created_at) as feedback_date,
    COUNT(*) as total_feedback,
    COUNT(CASE WHEN feedback_type = 'helpful' THEN 1 END) as helpful_count,
    COUNT(CASE WHEN feedback_type = 'not_helpful' THEN 1 END) as not_helpful_count,
    COUNT(CASE WHEN feedback_type = 'partial' THEN 1 END) as partial_count,
    COUNT(CASE WHEN feedback_type = 'detailed' THEN 1 END) as detailed_count,
    AVG(rating) as avg_rating
FROM feedback
GROUP BY DATE(created_at)
ORDER BY feedback_date DESC;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL ON feedback TO authenticated;
-- GRANT ALL ON feedback_stats TO authenticated;
-- GRANT ALL ON daily_feedback_trends TO authenticated;

-- Test the setup
DO $$
BEGIN
    -- Insert a test record
    INSERT INTO feedback (user_query, ai_response, feedback_type, chat_id, comment)
    VALUES ('Test query', 'Test response', 'helpful', 'test-setup', 'Test feedback for setup verification');
    
    -- Check if it was inserted
    IF EXISTS (SELECT 1 FROM feedback WHERE chat_id = 'test-setup') THEN
        RAISE NOTICE '✅ Feedback table setup completed successfully!';
        RAISE NOTICE 'The feedback system is ready to use.';
        
        -- Clean up test record
        DELETE FROM feedback WHERE chat_id = 'test-setup';
        RAISE NOTICE 'Test record cleaned up.';
    ELSE
        RAISE NOTICE '❌ Setup verification failed.';
    END IF;
    
    RAISE NOTICE 'Available views: feedback_stats, daily_feedback_trends';
    RAISE NOTICE 'Available functions: match_feedback_by_embedding()';
END $$; 