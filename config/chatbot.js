// Gemini AI Chatbot Configuration
export default {
  // Model Configuration
  model: {
    name: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    embeddingModel: 'text-embedding-004',
    temperature: 0.7,
    maxOutputTokens: 2048,
    topP: 0.95,
    topK: 40,
  },

  // Context Management
  context: {
    maxTurns: 10, // Maximum conversation history turns to include
    maxContextLength: 8000, // Maximum tokens for context
    systemPrompt: `You are a helpful travel assistant for JetSetters, a premium travel booking platform. 
You help users with:
- Flight and hotel bookings
- Travel recommendations
- Booking modifications and cancellations
- Account information
- General travel questions

Always be friendly, professional, and concise. If you don't know something, offer to connect the user with human support.`,
  },

  // Session Configuration
  session: {
    timeout: 30 * 60 * 1000, // 30 minutes in milliseconds
    maxSessions: 1000, // Maximum concurrent sessions
  },

  // Rate Limiting
  rateLimit: {
    messagesPerMinute: 30,
    sessionsPerHour: 5,
    windowMs: 60 * 1000, // 1 minute
  },

  // Content Indexing
  indexing: {
    chunkSize: 500, // Tokens per chunk
    chunkOverlap: 50, // Overlap between chunks
    topK: 3, // Number of similar chunks to retrieve
    similarityThreshold: 0.7, // Minimum cosine similarity
    crawlUrls: [
      '/faq',
      '/policies/cancellation',
      '/policies/refund',
      '/help',
      '/about',
    ],
  },

  // API Configuration
  api: {
    timeout: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
  },

  // Cache Configuration
  cache: {
    enabled: true,
    ttl: 3600, // 1 hour in seconds
    faqTtl: 3600, // FAQ responses cache
    contextTtl: 300, // User context cache (5 minutes)
  },

  // Feature Flags
  features: {
    streaming: true, // Enable streaming responses
    multiLanguage: false, // Multi-language support
    voiceInput: false, // Voice input support
    feedbackCollection: true, // Collect user feedback
  },
};
