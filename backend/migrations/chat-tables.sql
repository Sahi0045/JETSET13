-- Gemini AI Chatbot Database Schema
-- Run this migration in Supabase SQL Editor

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Chat Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_last_active ON chat_sessions(last_active_at);
CREATE INDEX idx_chat_sessions_active ON chat_sessions(is_active) WHERE is_active = true;

-- Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tokens_used INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- Chat Feedback Table
CREATE TABLE IF NOT EXISTS chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_feedback_message_id ON chat_feedback(message_id);
CREATE INDEX idx_chat_feedback_rating ON chat_feedback(rating);

-- Content Embeddings Table (for RAG)
CREATE TABLE IF NOT EXISTS content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(768), -- text-embedding-004 produces 768-dimensional vectors
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_content_embeddings_source ON content_embeddings(source_url);
CREATE INDEX idx_content_embeddings_embedding ON content_embeddings 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Chatbot Analytics Table
CREATE TABLE IF NOT EXISTS chatbot_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chatbot_analytics_session ON chatbot_analytics(session_id);
CREATE INDEX idx_chatbot_analytics_event_type ON chatbot_analytics(event_type);
CREATE INDEX idx_chatbot_analytics_created_at ON chatbot_analytics(created_at);

-- Row Level Security (RLS) Policies

-- Chat Sessions: Users can only access their own sessions
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Chat Messages: Users can only access messages from their sessions
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in own sessions"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- Chat Feedback: Users can only provide feedback on their own messages
ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON chat_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_feedback.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create feedback for own messages"
  ON chat_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_feedback.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- Content Embeddings: Public read access (no user-specific data)
ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to embeddings"
  ON content_embeddings FOR SELECT
  TO authenticated
  USING (true);

-- Analytics: Users can only view their own analytics
ALTER TABLE chatbot_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics"
  ON chatbot_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chatbot_analytics.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- Helper function to search similar content
CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  source_url TEXT,
  chunk_text TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    content_embeddings.id,
    content_embeddings.source_url,
    content_embeddings.chunk_text,
    1 - (content_embeddings.embedding <=> query_embedding) AS similarity
  FROM content_embeddings
  WHERE 1 - (content_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY content_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to clean up old inactive sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_inactive_sessions(
  inactive_hours int DEFAULT 24
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM chat_sessions
    WHERE last_active_at < NOW() - (inactive_hours || ' hours')::interval
    AND is_active = false
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE chat_sessions IS 'Stores chat session metadata and user associations';
COMMENT ON TABLE chat_messages IS 'Stores individual messages in chat conversations';
COMMENT ON TABLE chat_feedback IS 'Stores user feedback ratings and comments for AI responses';
COMMENT ON TABLE content_embeddings IS 'Stores text chunks and their vector embeddings for semantic search';
COMMENT ON TABLE chatbot_analytics IS 'Stores analytics events for chatbot usage tracking';
COMMENT ON FUNCTION search_similar_content IS 'Performs semantic similarity search using cosine distance';
COMMENT ON FUNCTION cleanup_inactive_sessions IS 'Removes old inactive sessions to maintain database performance';
