import supabase from "../config/supabase.js";

class ChatModel {
  /**
   * Create a new chat session
   */
  async createSession(userId = null, metadata = {}) {
    try {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({
          user_id: userId,
          metadata,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error creating session:", error);
      throw new Error("Failed to create chat session");
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    try {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error fetching session:", error);
      return null;
    }
  }

  /**
   * Update session last active timestamp
   */
  async updateSessionActivity(sessionId) {
    try {
      const { error } = await supabase
        .from("chat_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating session activity:", error);
    }
  }

  /**
   * End a chat session
   */
  async endSession(sessionId) {
    try {
      const { error } = await supabase
        .from("chat_sessions")
        .update({ is_active: false })
        .eq("id", sessionId);

      if (error) throw error;
    } catch (error) {
      console.error("Error ending session:", error);
      throw new Error("Failed to end session");
    }
  }

  /**
   * Add a message to the conversation
   */
  async addMessage(sessionId, role, content, tokensUsed = 0, metadata = {}) {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          session_id: sessionId,
          role,
          content,
          tokens_used: tokensUsed,
          metadata,
        })
        .select()
        .single();

      if (error) throw error;

      // Update session activity
      await this.updateSessionActivity(sessionId);

      return data;
    } catch (error) {
      console.error("Error adding message:", error);
      throw new Error("Failed to save message");
    }
  }

  /**
   * Get conversation history for a session
   */
  async getHistory(sessionId, limit = 10) {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Return in chronological order (oldest first)
      return data.reverse();
    } catch (error) {
      console.error("Error fetching history:", error);
      return [];
    }
  }

  /**
   * Save user feedback for a message
   */
  async saveFeedback(messageId, sessionId, rating, comment = null) {
    try {
      const { data, error } = await supabase
        .from("chat_feedback")
        .insert({
          message_id: messageId,
          session_id: sessionId,
          rating,
          comment,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error saving feedback:", error);
      throw new Error("Failed to save feedback");
    }
  }

  /**
   * Save content embedding
   */
  async saveEmbedding(sourceUrl, chunkText, embedding, metadata = {}) {
    try {
      const { data, error } = await supabase
        .from("content_embeddings")
        .insert({
          source_url: sourceUrl,
          chunk_text: chunkText,
          embedding: JSON.stringify(embedding),
          metadata,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error saving embedding:", error);
      throw new Error("Failed to save embedding");
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilar(queryEmbedding, topK = 3, threshold = 0.7) {
    try {
      const { data, error } = await supabase.rpc("search_similar_content", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: threshold,
        match_count: topK,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error searching similar content:", error);
      return [];
    }
  }

  /**
   * Log analytics event
   */
  async logAnalytics(sessionId, eventType, eventData = {}) {
    try {
      const { error } = await supabase.from("chatbot_analytics").insert({
        session_id: sessionId,
        event_type: eventType,
        event_data: eventData,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Error logging analytics:", error);
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserActiveSessions(userId) {
    try {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("last_active_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching user sessions:", error);
      return [];
    }
  }
}

export default new ChatModel();
