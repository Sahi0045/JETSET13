# 🤖 Gemini AI Chatbot for JetSetters

A production-ready AI chatbot powered by Google's Gemini 1.5 Pro, integrated into the JetSetters travel platform.

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Features](#-features)
- [Architecture](#-architecture)
- [Documentation](#-documentation)
- [Testing](#-testing)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)

---

## ⚡ Quick Start

### 1. Verify Setup

```bash
npm run test:chatbot
```

This will check:
- ✓ Environment variables
- ✓ File structure
- ✓ Gemini API connection
- ✓ Supabase connection
- ✓ pgvector extension

### 2. Run Database Migration

If the test shows missing tables:

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/sql)
2. Copy contents of `backend/migrations/chat-tables.sql`
3. Paste and click "Run"

### 3. Start Development

```bash
npm run dev
```

Open http://localhost:5173 and click the blue chat button!

---

## ✨ Features

### Core Functionality

- **AI-Powered Conversations** - Gemini 1.5 Pro with context awareness
- **Intent Classification** - Automatically routes queries to appropriate handlers
- **Session Management** - Persistent sessions with 30-minute timeout
- **Conversation History** - Multi-turn conversations with context
- **User Feedback** - Thumbs up/down rating system
- **Streaming Responses** - Real-time token-by-token responses (optional)

### User Experience

- **Floating Widget** - Non-intrusive button in bottom-right corner
- **Responsive Design** - Works on desktop and mobile
- **Auto-scroll** - Automatically scrolls to latest message
- **Typing Indicator** - Shows when AI is thinking
- **Empty State** - Helpful suggestions when starting a conversation
- **Clear History** - One-click conversation reset

### Security & Performance

- **Rate Limiting** - 30 messages/minute, 5 sessions/hour
- **Row Level Security** - Users can only access their own data
- **Optional Authentication** - Works for both guests and logged-in users
- **Token Tracking** - Monitors API usage per message
- **Error Handling** - Graceful fallbacks with user-friendly messages
- **Retry Logic** - Exponential backoff for API failures

### Analytics

- **Usage Tracking** - Sessions, messages, intents
- **Feedback Collection** - User ratings and comments
- **Performance Metrics** - Response times, token usage
- **Intent Distribution** - Most common query types

---

## 🏗️ Architecture

### Tech Stack

**Backend:**
- Node.js + Express
- Google Generative AI SDK
- Supabase (PostgreSQL + pgvector)
- LangChain (for future content indexing)

**Frontend:**
- React 18
- Tailwind CSS
- Lucide React (icons)
- Custom hooks for state management

### File Structure

```
JETSET13/
├── config/
│   └── chatbot.js                    # Configuration
│
├── backend/
│   ├── controllers/
│   │   └── chat.controller.js        # Main orchestration
│   ├── models/
│   │   └── chat.model.js             # Database operations
│   ├── services/
│   │   ├── gemini.service.js         # Gemini API wrapper
│   │   ├── query-classifier.js       # Intent detection
│   │   └── response-generator.js     # Response formatting
│   └── migrations/
│       └── chat-tables.sql           # Database schema
│
├── api/
│   └── chat/
│       └── index.js                  # API routes
│
├── frontend/
│   ├── components/
│   │   ├── ChatBot.jsx               # Main export
│   │   └── ChatBot/
│   │       ├── ChatWidget.jsx        # Floating widget
│   │       ├── ChatMessage.jsx       # Message bubble
│   │       ├── ChatInput.jsx         # Input field
│   │       └── ChatHistory.jsx       # Message list
│   ├── hooks/
│   │   └── useChat.js                # State management
│   └── utils/
│       └── chat-api.js               # API client
│
└── Documentation/
    ├── CHATBOT_QUICK_START.md        # 3-step setup
    ├── CHATBOT_SETUP_GUIDE.md        # Detailed guide
    ├── CHATBOT_IMPLEMENTATION_SUMMARY.md
    └── CHATBOT_TODO.md               # Task breakdown
```

### Data Flow

```
User Input
    ↓
ChatWidget (React)
    ↓
useChat Hook (State Management)
    ↓
chat-api.js (API Client)
    ↓
POST /api/chat/message
    ↓
chat.controller.js
    ├─→ query-classifier.js (Classify Intent)
    ├─→ chat.model.js (Load History)
    ├─→ gemini.service.js (Generate Response)
    └─→ response-generator.js (Format Output)
    ↓
Save to Supabase
    ↓
Return JSON Response
    ↓
Update UI
```

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `CHATBOT_QUICK_START.md` | Get running in 3 steps |
| `CHATBOT_SETUP_GUIDE.md` | Detailed setup and configuration |
| `CHATBOT_IMPLEMENTATION_SUMMARY.md` | Complete technical overview |
| `CHATBOT_TODO.md` | Task breakdown and progress |
| `gemini-chatbot-implementation-plan.md` | Original design document |

---

## 🧪 Testing

### Automated Tests

```bash
# Run setup verification
npm run test:chatbot
```

### Manual Testing

1. **Basic Conversation**
   - Open chat widget
   - Send: "Hello"
   - Verify: AI responds

2. **Session Persistence**
   - Send a message
   - Refresh page
   - Verify: History is preserved

3. **Feedback System**
   - Send a message
   - Click thumbs up/down
   - Verify: Button becomes disabled

4. **Rate Limiting**
   - Send 31 messages rapidly
   - Verify: Rate limit error appears

5. **Clear History**
   - Have a conversation
   - Click trash icon
   - Confirm dialog
   - Verify: Messages cleared

### API Testing

```bash
# Create session
curl -X POST http://localhost:5006/api/chat/session \
  -H "Content-Type: application/json"

# Send message
curl -X POST http://localhost:5006/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"YOUR_SESSION_ID","message":"Hello"}'

# Get history
curl http://localhost:5006/api/chat/history/YOUR_SESSION_ID

# Submit feedback
curl -X POST http://localhost:5006/api/chat/feedback \
  -H "Content-Type: application/json" \
  -d '{"messageId":"MSG_ID","sessionId":"SESSION_ID","rating":5}'
```

---

## ⚙️ Configuration

### Environment Variables

Required in `.env`:

```env
GEMINI_API_KEY=your_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=your_jwt_secret
```

### Chatbot Settings

Edit `config/chatbot.js`:

```javascript
export default {
  // Model Configuration
  model: {
    name: 'gemini-1.5-pro',
    temperature: 0.7,              // Creativity (0-1)
    maxOutputTokens: 2048,         // Response length
  },

  // Context Management
  context: {
    maxTurns: 10,                  // Conversation history
    systemPrompt: '...',           // AI instructions
  },

  // Rate Limiting
  rateLimit: {
    messagesPerMinute: 30,
    sessionsPerHour: 5,
  },

  // Semantic Search
  indexing: {
    topK: 3,                       // Results to retrieve
    similarityThreshold: 0.7,      // Minimum similarity
  },
}
```

### Customization Examples

**Change AI Personality:**

```javascript
context: {
  systemPrompt: `You are a friendly travel expert who loves adventure.
  Use emojis occasionally and keep responses under 100 words.`,
}
```

**Adjust Rate Limits:**

```javascript
rateLimit: {
  messagesPerMinute: 50,  // More lenient
  sessionsPerHour: 10,
}
```

**Change Widget Colors:**

Edit `frontend/components/ChatBot/ChatWidget.jsx`:

```javascript
// Change from blue to purple
className="bg-purple-600 hover:bg-purple-700"
```

---

## 🚀 Deployment

### Production Checklist

- [ ] Run database migration in production Supabase
- [ ] Add `GEMINI_API_KEY` to production environment
- [ ] Test all API endpoints
- [ ] Verify rate limiting works
- [ ] Set up error monitoring
- [ ] Monitor Gemini API quota

### Vercel Deployment

```bash
# Add environment variable
vercel env add GEMINI_API_KEY

# Deploy
git push origin main
```

### Render Deployment

1. Go to Dashboard → Environment
2. Add: `GEMINI_API_KEY=your_key_here`
3. Save and redeploy

### Post-Deployment

```bash
# Test production API
curl https://your-domain.com/api/chat/session \
  -X POST \
  -H "Content-Type: application/json"
```

---

## 🐛 Troubleshooting

### Common Issues

**Widget doesn't appear**
- Check browser console for errors
- Verify `ChatBot` is imported in `App.jsx`
- Ensure Tailwind CSS is loaded

**"Failed to create session"**
- Run database migration
- Check Supabase connection
- Verify `chat_sessions` table exists

**"Failed to generate response"**
- Check `GEMINI_API_KEY` in `.env`
- Verify API quota: https://aistudio.google.com/app/apikey
- Check server logs for detailed error

**Messages not persisting**
- Check localStorage in browser DevTools
- Verify session hasn't timed out (30 min)
- Check `chat_messages` table in Supabase

**Rate limit errors**
- Increase limits in `config/chatbot.js`
- Check if multiple users share same IP
- Review rate limit logs in analytics

### Debug Mode

Enable detailed logging:

```javascript
// In gemini.service.js
console.log('Prompt:', prompt);
console.log('Context:', context);
console.log('Response:', response);
```

### Database Queries

```sql
-- Check session count
SELECT COUNT(*) FROM chat_sessions;

-- View recent messages
SELECT * FROM chat_messages 
ORDER BY created_at DESC 
LIMIT 10;

-- Average feedback rating
SELECT AVG(rating) FROM chat_feedback;

-- Intent distribution
SELECT event_data->>'intent', COUNT(*) 
FROM chatbot_analytics 
WHERE event_type = 'message_processed'
GROUP BY event_data->>'intent';
```

---

## 📊 Monitoring

### Key Metrics

1. **Usage**
   - Sessions per day
   - Messages per session
   - Active users

2. **Performance**
   - Average response time
   - API error rate
   - Token usage

3. **Quality**
   - Feedback ratings
   - Intent classification accuracy
   - Escalation rate

### Supabase Dashboard

View real-time data:
- Table Editor → chat_messages
- SQL Editor → Run custom queries
- Logs → API request logs

### Gemini API Quota

Monitor at: https://aistudio.google.com/app/apikey

---

## 🔮 Future Enhancements

### Phase 3 (Optional)

1. **Content Indexing**
   - Crawl FAQ/policy pages
   - Generate embeddings
   - Semantic search

2. **Booking Integration**
   - Fetch real booking data
   - Display itineraries
   - Assist with modifications

3. **Caching Layer**
   - Redis for frequent queries
   - Reduce API calls
   - Faster responses

4. **Advanced Features**
   - Multi-language support
   - Voice input
   - Proactive suggestions
   - Admin dashboard

See `CHATBOT_TODO.md` for complete roadmap.

---

## 🤝 Contributing

### Adding New Intents

1. Edit `backend/services/query-classifier.js`:

```javascript
this.intents = {
  // ... existing intents
  NEW_INTENT: 'new_intent',
};

this.keywordPatterns = {
  // ... existing patterns
  new_intent: [/keyword1/i, /keyword2/i],
};
```

2. Add handler in `backend/controllers/chat.controller.js`

### Adding Response Templates

Edit `backend/services/response-generator.js`:

```javascript
this.templates = {
  // ... existing templates
  newTemplate: [
    "Template option 1",
    "Template option 2",
  ],
};
```

---

## 📄 License

Part of the JetSetters travel platform.

---

## 📞 Support

- **Setup Issues**: See `CHATBOT_SETUP_GUIDE.md`
- **API Errors**: Check server logs and Supabase dashboard
- **Feature Requests**: See `CHATBOT_TODO.md` Phase 3

---

**Built with** ❤️ **using Gemini 1.5 Pro**

**Status**: ✅ Production Ready  
**Version**: 1.0.0  
**Last Updated**: March 3, 2026
