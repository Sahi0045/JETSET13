import { GoogleGenAI } from "@google/genai";
import chatbotConfig from "../../config/chatbot.js";

class GeminiService {
  constructor() {
    // Lazy initialization — client is created on first use, not at import time.
    // This prevents the server from crashing on startup when GEMINI_API_KEY is not set.
    this._client = null;
  }

  /**
   * Lazily initialize the Gemini client.
   * Throws a clear error only when a method is actually called without a key.
   * @private
   */
  _init() {
    if (this._client) return; // Already initialized

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured. " +
        "Add it to your .env file and restart the server.",
      );
    }

    this._client = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate a response from Gemini.
   * @param {string} prompt - User message
   * @param {Object} context - Additional context (user data, bookings, retrieved content, etc.)
   * @param {Array}  history - Conversation history [{role, content}]
   * @returns {Promise<{text: string, tokensUsed: number, metadata: Object}>}
   */
  async generateResponse(prompt, context = {}, history = []) {
    this._init();

    try {
      const systemContext = this._buildSystemContext(context);
      const contents = this._formatHistory(history);

      // Add the final user prompt with system context
      contents.push({
        role: "user",
        parts: [{ text: `${systemContext}\n\nUser: ${prompt}` }]
      });

      const response = await this._retryWithBackoff(() =>
        this._client.models.generateContent({
          model: chatbotConfig.model.name,
          contents,
          config: {
            temperature: chatbotConfig.model.temperature,
            maxOutputTokens: chatbotConfig.model.maxOutputTokens,
            topP: chatbotConfig.model.topP,
            topK: chatbotConfig.model.topK,
          },
        }),
      );

      const text = response.text;

      return {
        text,
        tokensUsed: this._estimateTokens(text),
        metadata: {
          model: chatbotConfig.model.name,
          finishReason: response.candidates?.[0]?.finishReason ?? "STOP",
        },
      };
    } catch (error) {
      console.error("Gemini generateResponse error:", error.message);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }

  /**
   * Generate a streaming response from Gemini via an async generator.
   * @param {string} prompt - User message
   * @param {Object} context - Additional context
   * @param {Array}  history - Conversation history
   * @yields {{ text?: string, done: boolean }}
   */
  async *generateStreamingResponse(prompt, context = {}, history = []) {
    this._init();

    try {
      const systemContext = this._buildSystemContext(context);
      const contents = this._formatHistory(history);

      contents.push({
        role: "user",
        parts: [{ text: `${systemContext}\n\nUser: ${prompt}` }]
      });

      const stream = await this._client.models.generateContentStream({
        model: chatbotConfig.model.name,
        contents,
        config: {
          temperature: chatbotConfig.model.temperature,
          maxOutputTokens: chatbotConfig.model.maxOutputTokens,
        },
      });

      for await (const chunk of stream) {
        if (chunk.text) {
          yield { text: chunk.text, done: false };
        }
      }

      yield { done: true };
    } catch (error) {
      console.error("Gemini streaming error:", error.message);
      throw new Error(
        `Failed to generate streaming response: ${error.message}`,
      );
    }
  }

  /**
   * Generate a vector embedding for the given text.
   * @param {string} text
   * @returns {Promise<number[]>} Embedding vector (768 dimensions for text-embedding-004)
   */
  async generateEmbedding(text) {
    this._init();

    try {
      const result = await this._retryWithBackoff(() =>
        this._client.models.embedContent({
          model: chatbotConfig.model.embeddingModel,
          content: { parts: [{ text }] }
        }),
      );
      return result.embeddings[0].values;
    } catch (error) {
      console.error("Gemini embedding error:", error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Check whether the service is ready (API key present and client initialized).
   * Safe to call without triggering a throw.
   * @returns {{ ready: boolean, reason?: string }}
   */
  healthCheck() {
    if (!process.env.GEMINI_API_KEY) {
      return { ready: false, reason: "GEMINI_API_KEY is not set" };
    }
    return { ready: true };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a system-level context block injected at the top of every prompt.
   * @private
   */
  _buildSystemContext(context) {
    let systemContext = chatbotConfig.context.systemPrompt;

    if (context.user) {
      systemContext += `\n\nUser Information:\n- Name: ${context.user.name ?? "Guest"}\n- Email: ${context.user.email ?? "Not provided"}`;
    }

    if (context.bookings?.length > 0) {
      systemContext += "\n\nActive Bookings:";
      context.bookings.forEach((booking, idx) => {
        systemContext += `\n${idx + 1}. ${booking.type} — ${booking.destination} (${booking.date})`;
      });
    }

    if (context.retrievedContent?.length > 0) {
      systemContext += "\n\nRelevant Information:";
      context.retrievedContent.forEach((content, idx) => {
        systemContext += `\n${idx + 1}. ${content.text} (Source: ${content.source})`;
      });
    }

    return systemContext;
  }

  /**
   * Convert internal message history to the format expected by the Gemini SDK.
   * @private
   */
  _formatHistory(history) {
    return history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));
  }

  /**
   * Retry an async operation up to maxRetries times with exponential backoff.
   * Certain error types (API key, quota) are NOT retried.
   * @private
   */
  async _retryWithBackoff(fn, maxRetries = chatbotConfig.api.retryAttempts) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Do not retry on unrecoverable errors
        const msg = error.message ?? "";
        if (
          msg.includes("API key") ||
          msg.includes("quota") ||
          msg.includes("PERMISSION_DENIED")
        ) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          const delay = chatbotConfig.api.retryDelay * Math.pow(2, attempt);
          console.warn(
            `Gemini API attempt ${attempt + 1} failed, retrying in ${delay}ms…`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Rough token estimate — ~4 characters per token.
   * @private
   */
  _estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

// Export a singleton — instantiation is cheap since we now use lazy init.
export default new GeminiService();
