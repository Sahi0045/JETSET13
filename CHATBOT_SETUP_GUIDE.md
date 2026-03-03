# Gemini AI Chatbot - Setup Guide

## ✅ What's Been Completed

### Phase 1 & 2 - Foundation & Integration (100% Complete)

All core infrastructure is now in place:

- ✅ Gemini API integration with streaming support
- ✅ Database schema with pgvector for semantic search
- ✅ Backend API with rate limiting
- ✅ Frontend chat widget with real-time messaging
- ✅ Session management with persistence
- ✅ Query classification and routing
- ✅ Response generation with templates
- ✅ User feedback system

## 🚀 Next Steps to Get It Running

### Step 1: Run Database Migration

The chatbot needs database tables in Supabase. Run this SQL in your Supabase SQL Editor:

1. Go to: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/sql
2. Open the file: `backend/migrations/chat-tables.sql`
3. Copy the entire contents
4. Paste into Supabase SQL Editor
5. Click "Run"

This will:
- Enable pgvector extension
- Create 5 tables (sessions, messages, feedback, embeddings, analytics)
- Set up Row Level Security policies
- Create helper functions for semantic search

### Step 2: Add Environment Variable to Production

Your `.env` file already has the Gemini API key, but you need to add it to your production environment:

**For Vercel:**
```bash
# Go to: https://vercel.com/your-project/settings/environment-variables
# Add:
GEMINI_API_KEY=your_gemini_api_key_here
```

**For Render:**
```bash
# Go to your Render dashboard → Environment
# Add:
GEMINI_API_KEY=your_gemini_api_key_here
```

### Step 3: Test Locally

```bash
# Start the development server
npm run dev

# The chatbot widget should appear in the bottom-right corner
# Click it to open and start chatting
```

### Step 4: Test the API Directly (Optional)

```bash
# Create a session
curl -X POST http://localhost:5006/api/chat/session \
  -H "Content-Type: application/json" \
  -d '{}'

# Send a message (replace SESSION_ID with the ID from above)
curl -X POST http://localhost:5006/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "SESSION_ID",
    "message": "Hello, what can you help me with?"
  }'
```

## 📁 File Structure

```
JETSET13/
├── config/
│   └── chatbot.js                          # Configuration
├── backend/
│   ├── controllers/
│   │   └── chat.controller.js              # Main orchestration
│   ├── models/
│   │   └── chat.model.js                   # Database operations
│   ├── services/
│   │   ├── gemini.service.js               # Gemini API wrapper
│   │   ├── query-classifier.js             # Intent classification
│   │   └── response-generator.js           # Response formatting
│   └── migrations/
│       └── chat-tables.sql                 # Database schema
├── api/
│   └── chat/
│       └── index.js                        # API routes
├── frontend/
│   ├── components/
│   │   ├── ChatBot.jsx                     # Main export
│   │   └── ChatBot/
│   │       ├── ChatWidget.jsx              # Floating widget
│   │       ├── ChatMessage.jsx             # Message bubble
│   │       ├── ChatInput.jsx               # Input field
│   │       └── ChatHistory.jsx             # Message list
│   ├── hooks/
│   │   └── useChat.js                      # Chat state management
│   └── utils/
│       └── chat-api.js                     # API client
└── server.js                               # Routes registered
```

## 🔧 Configuration

All settings are in `config/chatbot.js`:

```javascript
{
  model: {
    name: 'gemini-1.5-pro',
    embeddingModel: 'text-embedding-004',
    temperature: 0.7,
    maxOutputTokens: 2048,
  },
  context: {
    maxTurns: 10,                           // Conversation history
    systemPrompt: '...',                    // AI instructions
  },
  rateLimit: {
    messagesPerMinute: 30,
    sessionsPerHour: 5,
  },
  indexing: {
    chunkSize: 500,
    topK: 3,                                // Semantic search results
    similarityThreshold: 0.7,
  },
}
```

## 🎨 Customization

### Change the System Prompt

Edit `config/chatbot.js`:

```javascript
context: {
  systemPrompt: `You are a helpful travel assistant for JetSetters...
  
  Add your custom instructions here.`,
}
```

### Modify Widget Appearance

Edit `frontend/components/ChatBot/ChatWidget.jsx`:

```javascript
// Change colors
className="bg-blue-600"  // Change to your brand color

// Change size
className="w-96 h-[600px]"  // Adjust width/height

// Change position
className="fixed bottom-6 right-6"  // Move to different corner
```

### Add Custom Response Templates

Edit `backend/services/response-generator.js`:

```javascript
this.templates = {
  greeting: [
    "Your custom greeting here",
  ],
  // Add more templates...
}
```

## 🧪 Testing Checklist

- [ ] Database migration ran successfully
- [ ] Chat widget appears on all pages
- [ ] Can open/close the widget
- [ ] Can send messages and receive responses
- [ ] Session persists after page refresh
- [ ] Feedback buttons work (thumbs up/down)
- [ ] Clear history button works
- [ ] Rate limiting prevents spam
- [ ] Error messages display properly
- [ ] Works for both authenticated and guest users

## 🐛 Troubleshooting

### "Failed to create session"
- Check Supabase connection in server logs
- Verify database migration ran successfully
- Check `chat_sessions` table exists

### "Failed to generate response"
- Verify `GEMINI_API_KEY` is set correctly
- Check Gemini API quota: https://aistudio.google.com/app/apikey
- Look for errors in server logs

### Widget doesn't appear
- Check browser console for errors
- Verify `ChatBot` is imported in `App.jsx`
- Check if Tailwind CSS is loaded

### Messages not persisting
- Check localStorage in browser DevTools
- Verify session timeout (30 minutes default)
- Check `chat_messages` table in Supabase

## 📊 Monitoring

View chatbot usage in Supabase:

```sql
-- Total sessions
SELECT COUNT(*) FROM chat_sessions;

-- Messages per day
SELECT DATE(created_at), COUNT(*) 
FROM chat_messages 
GROUP BY DATE(created_at);

-- Average feedback rating
SELECT AVG(rating) FROM chat_feedback;

-- Most common intents
SELECT event_data->>'intent', COUNT(*) 
FROM chatbot_analytics 
WHERE event_type = 'message_processed'
GROUP BY event_data->>'intent';
```

## 🚧 What's Next (Phase 3)

The chatbot is functional but can be enhanced:

1. **Content Indexing** - Crawl your FAQ/policy pages for better answers
2. **Booking Integration** - Connect to existing booking APIs
3. **Redis Caching** - Speed up responses for common questions
4. **Multi-language** - Support multiple languages
5. **Voice Input** - Add speech-to-text

See `CHATBOT_TODO.md` for the complete Phase 3 roadmap.

## 📞 Support

If you encounter issues:

1. Check server logs: `npm run dev` output
2. Check browser console: F12 → Console tab
3. Check Supabase logs: Dashboard → Logs
4. Review `CHATBOT_TODO.md` for implementation details

---

**Status**: Phase 1 & 2 Complete ✅ | Ready for Testing 🧪
