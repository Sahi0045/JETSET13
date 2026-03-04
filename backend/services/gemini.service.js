import { GoogleGenAI } from "@google/genai";
import chatbotConfig from "../../config/chatbot.js";
import chatSecurityService from "./chat-security.service.js";

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
   * Includes user profile, booking data, inquiries, and quotes for authenticated users.
   * @private
   */
  _buildSystemContext(context) {
    let systemContext = chatbotConfig.context.systemPrompt;

    // Authentication status
    if (context.authenticated === false) {
      systemContext += "\n\n[User Status: Guest (not logged in). If they ask about their bookings, let them know they need to log in first to see their booking information.]";
    }

    // User information
    if (context.user) {
      systemContext += `\n\nUser Information:\n- Name: ${context.user.name ?? "Guest"}\n- Email: ${context.user.email ?? "Not provided"}\n- Phone: ${context.user.phone ?? "Not provided"}`;
      if (context.user.memberSince) {
        systemContext += `\n- Member since: ${new Date(context.user.memberSince).toLocaleDateString()}`;
      }
    }

    // Upcoming bookings (future travel)
    if (context.upcomingBookings?.length > 0) {
      systemContext += "\n\nUpcoming Travel (future bookings):";
      context.upcomingBookings.forEach((booking, idx) => {
        systemContext += `\n${idx + 1}. [${booking.travelType?.toUpperCase()}] Booking Ref: ${booking.bookingReference || 'N/A'}`;
        systemContext += `\n   Status: ${booking.status} | Payment: ${booking.paymentStatus}`;
        if (booking.origin && booking.destination) {
          systemContext += `\n   Route: ${booking.originCity || booking.origin} → ${booking.destinationCity || booking.destination}`;
        }
        if (booking.departureDate) {
          systemContext += `\n   Departure: ${booking.departureDate}${booking.departureTime ? ' at ' + booking.departureTime : ''}`;
        }
        if (booking.arrivalDate || booking.arrivalTime) {
          systemContext += `\n   Arrival: ${booking.arrivalDate || ''}${booking.arrivalTime ? ' at ' + booking.arrivalTime : ''}`;
        }
        if (booking.airline) {
          systemContext += `\n   Airline: ${booking.airline}${booking.flightNumber ? ' (' + booking.flightNumber + ')' : ''}`;
        }
        if (booking.duration) {
          systemContext += `\n   Duration: ${booking.duration}`;
        }
        if (booking.cabinClass) {
          systemContext += `\n   Class: ${booking.cabinClass}`;
        }
        if (booking.stops !== null && booking.stops !== undefined) {
          systemContext += `\n   Stops: ${booking.stops === 0 ? 'Non-stop' : booking.stops + ' stop(s)'}`;
        }
        if (booking.pnr) {
          systemContext += `\n   PNR: ${booking.pnr}`;
        }
        if (booking.cruiseName) {
          systemContext += `\n   Cruise: ${booking.cruiseName}`;
        }
        systemContext += `\n   Amount: ${booking.currency} ${booking.totalAmount}`;
        if (booking.passengerCount > 0) {
          systemContext += `\n   Passengers (${booking.passengerCount}): ${booking.passengerNames.join(', ')}`;
        }
      });
    }

    // Recent bookings (all bookings including past)
    if (context.bookings?.length > 0) {
      systemContext += "\n\nRecent Bookings (all):";
      context.bookings.forEach((booking, idx) => {
        systemContext += `\n${idx + 1}. [${booking.travelType?.toUpperCase()}] Ref: ${booking.bookingReference || 'N/A'} | Status: ${booking.status} | Payment: ${booking.paymentStatus}`;
        if (booking.origin && booking.destination) {
          systemContext += ` | ${booking.originCity || booking.origin} → ${booking.destinationCity || booking.destination}`;
        }
        if (booking.departureDate) {
          systemContext += ` | Dep: ${booking.departureDate}${booking.departureTime ? ' ' + booking.departureTime : ''}`;
        }
        if (booking.airline) {
          systemContext += ` | ${booking.airline}${booking.flightNumber ? ' ' + booking.flightNumber : ''}`;
        }
        if (booking.pnr) {
          systemContext += ` | PNR: ${booking.pnr}`;
        }
        systemContext += ` | ${booking.currency} ${booking.totalAmount}`;
        if (booking.bookingDate) {
          systemContext += ` | Booked: ${new Date(booking.bookingDate).toLocaleDateString()}`;
        }
      });
    }

    // Inquiries
    if (context.inquiries?.length > 0) {
      systemContext += "\n\nRecent Inquiries:";
      context.inquiries.forEach((inquiry, idx) => {
        systemContext += `\n${idx + 1}. Type: ${inquiry.type} | Status: ${inquiry.status}`;
        if (inquiry.destination) {
          systemContext += ` | Destination: ${inquiry.destination}`;
        }
        if (inquiry.travelDates) {
          systemContext += ` | Dates: ${inquiry.travelDates}`;
        }
      });
    }

    // Quotes
    if (context.quotes?.length > 0) {
      systemContext += "\n\nRecent Quotes:";
      context.quotes.forEach((quote, idx) => {
        systemContext += `\n${idx + 1}. Quote #${quote.quoteNumber} | ${quote.currency} ${quote.amount} | Status: ${quote.status}`;
        if (quote.validUntil) {
          systemContext += ` | Valid until: ${new Date(quote.validUntil).toLocaleDateString()}`;
        }
      });
    }

    // Total bookings count
    if (context.totalBookings !== undefined && context.totalBookings > 0) {
      systemContext += `\n\nTotal bookings on record: ${context.totalBookings}`;
    }

    // Retrieved content (RAG)
    if (context.retrievedContent?.length > 0) {
      systemContext += "\n\nRelevant Information:";
      context.retrievedContent.forEach((content, idx) => {
        systemContext += `\n${idx + 1}. ${content.text} (Source: ${content.source})`;
      });
    }

    // Important instructions for the AI
    systemContext += "\n\nIMPORTANT RULES:";
    systemContext += "\n- You have READ-ONLY access to the user's booking data shown above.";
    systemContext += "\n- You CANNOT modify, cancel, or edit any bookings. If the user asks to change/cancel a booking, direct them to the Manage Booking page or customer support.";
    systemContext += "\n- Only share booking information with the authenticated user who owns it.";
    systemContext += "\n- If the user is not logged in (Guest), tell them to log in to access their booking information.";
    systemContext += "\n- Be helpful, accurate, and concise when answering questions about their bookings.";

    // Inject security hardening rules to prevent prompt injection & data exfiltration
    systemContext += chatSecurityService.getSecurityPromptAdditions();

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
