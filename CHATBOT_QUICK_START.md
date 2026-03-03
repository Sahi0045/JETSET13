# Gemini Chatbot - Quick Start ⚡

## 🚀 Get Running in 3 Steps

### Step 1: Run Database Migration (2 minutes)

1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/sql
2. Copy all content from `backend/migrations/chat-tables.sql`
3. Paste and click "Run"
4. ✅ You should see "Success. No rows returned"

### Step 2: Start Development Server (30 seconds)

```bash
npm run dev
```

### Step 3: Test the Chatbot (1 minute)

1. Open http://localhost:5173 in your browser
2. Look for the blue chat button in the bottom-right corner
3. Click it and type: "Hello, what can you help me with?"
4. ✅ You should get a response from the AI

---

## 🎯 That's It!

The chatbot is now running locally. Try these example queries:

- "What's your cancellation policy?"
- "Help me find a flight to Paris"
- "Show me my bookings"

---

## 📦 What's Included

- ✅ Gemini 1.5 Pro AI integration
- ✅ Floating chat widget on all pages
- ✅ Session persistence (survives page refresh)
- ✅ Rate limiting (30 messages/minute)
- ✅ User feedback (thumbs up/down)
- ✅ Conversation history
- ✅ Intent classification
- ✅ Streaming responses

---

## 🔧 Quick Configuration

### Change AI Behavior

Edit `config/chatbot.js`:

```javascript
context: {
  systemPrompt: `Your custom instructions here...`,
}
```

### Change Widget Colors

Edit `frontend/components/ChatBot/ChatWidget.jsx`:

```javascript
className="bg-blue-600"  // Change to your brand color
```

### Adjust Rate Limits

Edit `config/chatbot.js`:

```javascript
rateLimit: {
  messagesPerMinute: 30,  // Increase if needed
}
```

---

## 🐛 Troubleshooting

### Widget doesn't appear?
- Check browser console (F12)
- Verify `npm run dev` is running without errors

### "Failed to create session"?
- Did you run the database migration?
- Check Supabase connection in server logs

### "Failed to generate response"?
- Verify `GEMINI_API_KEY` in `.env`
- Check Gemini API quota: https://aistudio.google.com/app/apikey

---

## 📚 Full Documentation

- **Setup Guide**: `CHATBOT_SETUP_GUIDE.md`
- **Implementation Summary**: `CHATBOT_IMPLEMENTATION_SUMMARY.md`
- **Task List**: `CHATBOT_TODO.md`

---

## 🚢 Deploy to Production

### Add Environment Variable

**Vercel:**
```
Dashboard → Settings → Environment Variables
Add: GEMINI_API_KEY=AIzaSyAyfVRijjqks7783MsIQNVChQh7jjf9ceQ
```

**Render:**
```
Dashboard → Environment
Add: GEMINI_API_KEY=AIzaSyAyfVRijjqks7783MsIQNVChQh7jjf9ceQ
```

### Deploy

```bash
git add .
git commit -m "Add Gemini AI chatbot"
git push
```

Your deployment platform will automatically rebuild with the chatbot included.

---

## 💡 Pro Tips

1. **Monitor Usage**: Check Supabase dashboard for message volume
2. **Review Feedback**: Query `chat_feedback` table for user ratings
3. **Optimize Prompt**: Update system prompt based on common queries
4. **Set Alerts**: Monitor Gemini API quota to avoid service interruption

---

**Status**: ✅ Ready to Use  
**Time to Deploy**: ~3 minutes  
**Support**: See troubleshooting section above
