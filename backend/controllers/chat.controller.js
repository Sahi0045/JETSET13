import chatModel from '../models/chat.model.js';
import geminiService from '../services/gemini.service.js';
import queryClassifier from '../services/query-classifier.js';
import responseGenerator from '../services/response-generator.js';
import bookingDataService from '../services/booking-data.service.js';
import chatSecurityService from '../services/chat-security.service.js';
import chatbotConfig from '../../config/chatbot.js';

class ChatController {
  /**
   * Process incoming message
   * 
   * Designed for reliability in serverless (Vercel) environments:
   * - Uses fast keyword classification (no extra Gemini API call)
   * - DB operations are non-blocking — failures don't prevent AI response
   * - Fetches booking data for authenticated users (read-only)
   * - Skips expensive embedding/content retrieval for simple queries
   */
  async processMessage(req, res) {
    try {
      const { sessionId, message } = req.body;
      const userId = req.user?.id || null;
      const userEmail = req.user?.email || null;
      const userName = req.user?.name || req.user?.first_name || null;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Security validation — block prompt injection, SQL injection, XSS, spam
      const securityCheck = chatSecurityService.validateMessage(message, sessionId);
      if (!securityCheck.safe) {
        if (securityCheck.securityEvent) {
          console.warn(`🛡️ Security event [${securityCheck.securityEvent}] from session ${sessionId}, user ${userId}`);
        }
        return res.status(400).json({
          error: securityCheck.reason,
          message: securityCheck.reason,
        });
      }
      const sanitizedMessage = securityCheck.sanitized;

      // Use fast keyword-based classification (no API call needed)
      const classification = queryClassifier.classifyWithKeywords(sanitizedMessage);
      const route = queryClassifier.route(classification);

      // Get or create session (non-blocking — don't fail if DB is down)
      let session = null;
      try {
        if (sessionId) {
          session = await chatModel.getSession(sessionId);
        }
        if (!session) {
          session = await chatModel.createSession(userId);
        }
      } catch (dbError) {
        console.warn('DB session operation failed, using in-memory session:', dbError.message);
        session = { id: sessionId || `temp-${Date.now()}` };
      }

      // Save user message (non-blocking — fire and forget)
      if (session?.id && !session.id.startsWith('temp-')) {
        chatModel.addMessage(session.id, 'user', sanitizedMessage).catch(err =>
          console.warn('Failed to save user message:', err.message)
        );
      }

      // Get conversation history (non-blocking — use empty if fails)
      let history = [];
      try {
        if (session?.id && !session.id.startsWith('temp-')) {
          history = await chatModel.getHistory(
            session.id,
            chatbotConfig.context.maxTurns
          );
        }
      } catch (historyError) {
        console.warn('Failed to fetch history:', historyError.message);
      }

      // Build context with booking data for authenticated users
      const context = await this._buildContext(userId, userEmail, userName, classification, route);

      // Generate response from Gemini
      const aiResponse = await geminiService.generateResponse(
        sanitizedMessage,
        context,
        history
      );

      // Sanitize AI response — strip any accidentally leaked secrets/tokens
      aiResponse.text = chatSecurityService.sanitizeResponse(aiResponse.text);

      // Format response
      const formattedResponse = responseGenerator.format(aiResponse.text, {
        sources: context.retrievedContent?.map(c => ({
          title: c.source,
          url: c.url,
        })) || [],
      });

      // Save assistant message (non-blocking — fire and forget)
      let assistantMessageId = null;
      if (session?.id && !session.id.startsWith('temp-')) {
        chatModel.addMessage(
          session.id,
          'assistant',
          formattedResponse.content,
          aiResponse.tokensUsed
        ).then(msg => {
          assistantMessageId = msg?.id;
        }).catch(err =>
          console.warn('Failed to save assistant message:', err.message)
        );

        // Log analytics (non-blocking)
        chatModel.logAnalytics(session.id, 'message_processed', {
          intent: classification.intent,
          confidence: classification.confidence,
          route,
          tokensUsed: aiResponse.tokensUsed,
          authenticated: !!userId,
        }).catch(err =>
          console.warn('Failed to log analytics:', err.message)
        );
      }

      res.json({
        sessionId: session.id,
        message: formattedResponse.content,
        messageId: assistantMessageId,
        metadata: {
          intent: classification.intent,
          confidence: classification.confidence,
          authenticated: !!userId,
          ...formattedResponse.metadata,
        },
      });
    } catch (error) {
      console.error('Error processing message:', error);

      // Try to return a graceful error response
      try {
        const errorResponse = responseGenerator.createErrorResponse(error);
        res.status(500).json({
          error: 'Failed to process message',
          message: errorResponse.content,
        });
      } catch (formatError) {
        // Ultimate fallback
        res.status(500).json({
          error: 'Failed to process message',
          message: 'I\'m experiencing some technical difficulties. Please try again in a moment.',
        });
      }
    }
  }

  /**
   * Process streaming message
   */
  async processStreamingMessage(req, res) {
    try {
      const { sessionId, message } = req.body;
      const userId = req.user?.id || null;
      const userEmail = req.user?.email || null;
      const userName = req.user?.name || req.user?.first_name || null;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Security validation
      const securityCheck = chatSecurityService.validateMessage(message, sessionId);
      if (!securityCheck.safe) {
        return res.status(400).json({ error: securityCheck.reason, message: securityCheck.reason });
      }

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Get or create session (non-blocking)
      let session = null;
      try {
        if (sessionId) {
          session = await chatModel.getSession(sessionId);
        }
        if (!session) {
          session = await chatModel.createSession(userId);
        }
      } catch (dbError) {
        console.warn('DB session operation failed for streaming:', dbError.message);
        session = { id: sessionId || `temp-${Date.now()}` };
      }

      // Save user message (non-blocking)
      if (session?.id && !session.id.startsWith('temp-')) {
        chatModel.addMessage(session.id, 'user', securityCheck.sanitized).catch(err =>
          console.warn('Failed to save user message:', err.message)
        );
      }

      // Classify and build context using fast keyword classification
      const sanitizedMessage = securityCheck.sanitized;
      const classification = queryClassifier.classifyWithKeywords(sanitizedMessage);
      const route = queryClassifier.route(classification);

      let history = [];
      try {
        if (session?.id && !session.id.startsWith('temp-')) {
          history = await chatModel.getHistory(session.id, chatbotConfig.context.maxTurns);
        }
      } catch (historyError) {
        console.warn('Failed to fetch history for streaming:', historyError.message);
      }

      const context = await this._buildContext(userId, userEmail, userName, classification, route);

      // Stream response
      let fullResponse = '';

      for await (const chunk of geminiService.generateStreamingResponse(message, context, history)) {
        if (chunk.done) {
          // Save complete response (non-blocking)
          if (session?.id && !session.id.startsWith('temp-')) {
            chatModel.addMessage(session.id, 'assistant', fullResponse).catch(err =>
              console.warn('Failed to save streamed response:', err.message)
            );
          }

          res.write(`data: ${JSON.stringify({ done: true, sessionId: session.id })}\n\n`);
          break;
        }

        fullResponse += chunk.text;
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }

      res.end();
    } catch (error) {
      console.error('Error in streaming:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Create new session
   */
  async createSession(req, res) {
    try {
      const userId = req.user?.id || null;
      const { metadata } = req.body;

      const session = await chatModel.createSession(userId, metadata);

      chatModel.logAnalytics(session.id, 'session_created', {
        userId,
        metadata,
      }).catch(err => console.warn('Failed to log session creation:', err.message));

      res.json({
        sessionId: session.id,
        createdAt: session.created_at,
      });
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  }

  /**
   * End session
   */
  async endSession(req, res) {
    try {
      const { sessionId } = req.params;

      await chatModel.endSession(sessionId);

      chatModel.logAnalytics(sessionId, 'session_ended').catch(err =>
        console.warn('Failed to log session end:', err.message)
      );

      res.json({ message: 'Session ended successfully' });
    } catch (error) {
      console.error('Error ending session:', error);
      res.status(500).json({ error: 'Failed to end session' });
    }
  }

  /**
   * Get conversation history
   */
  async getHistory(req, res) {
    try {
      const { sessionId } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      const history = await chatModel.getHistory(sessionId, limit);

      res.json({
        sessionId,
        messages: history,
        count: history.length,
      });
    } catch (error) {
      console.error('Error fetching history:', error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  }

  /**
   * Submit feedback
   */
  async submitFeedback(req, res) {
    try {
      const { messageId, sessionId, rating, comment } = req.body;

      if (!messageId || !sessionId || !rating) {
        return res.status(400).json({
          error: 'messageId, sessionId, and rating are required'
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          error: 'Rating must be between 1 and 5'
        });
      }

      const feedback = await chatModel.saveFeedback(
        messageId,
        sessionId,
        rating,
        comment
      );

      chatModel.logAnalytics(sessionId, 'feedback_submitted', {
        messageId,
        rating,
        hasComment: !!comment,
      }).catch(err => console.warn('Failed to log feedback:', err.message));

      res.json({
        message: 'Feedback submitted successfully',
        feedbackId: feedback.id,
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }

  /**
   * Build context for AI response.
   * - Fetches booking data for authenticated users (read-only)
   * - Skips expensive embedding retrieval for simple queries
   * @private
   */
  async _buildContext(userId, userEmail, userName, classification, route) {
    const context = {};

    // Add user information and booking data if authenticated
    if (userId) {
      try {
        // Fetch comprehensive booking context in parallel
        const bookingContext = await bookingDataService.getBookingContext(userId);

        context.user = {
          id: userId,
          name: userName || bookingContext.user?.name || 'User',
          email: userEmail || bookingContext.user?.email || 'Not provided',
          phone: bookingContext.user?.phone || 'Not provided',
          memberSince: bookingContext.user?.memberSince || null,
        };

        context.authenticated = true;

        // Add booking data
        if (bookingContext.recentBookings?.length > 0) {
          context.bookings = bookingContext.recentBookings;
        }

        if (bookingContext.upcomingBookings?.length > 0) {
          context.upcomingBookings = bookingContext.upcomingBookings;
        }

        if (bookingContext.inquiries?.length > 0) {
          context.inquiries = bookingContext.inquiries;
        }

        if (bookingContext.quotes?.length > 0) {
          context.quotes = bookingContext.quotes;
        }

        context.totalBookings = bookingContext.totalBookings || 0;
      } catch (error) {
        console.warn('Failed to fetch booking context (non-fatal):', error.message);
        context.user = {
          id: userId,
          name: userName || 'User',
          email: userEmail || 'Not provided',
        };
        context.authenticated = true;
      }
    } else {
      context.authenticated = false;
    }

    // Skip expensive content retrieval for simple queries
    const skipContentRoutes = ['greeting', 'general', 'support'];
    if (skipContentRoutes.includes(route)) {
      return context;
    }

    // Only retrieve content for content/policy/booking queries
    if (route === 'content' || classification.confidence < 0.7) {
      try {
        const queryEmbedding = await geminiService.generateEmbedding(
          classification.entities.destination || 'general travel'
        );

        const similarContent = await chatModel.searchSimilar(
          queryEmbedding,
          chatbotConfig.indexing.topK,
          chatbotConfig.indexing.similarityThreshold
        );

        context.retrievedContent = similarContent.map(item => ({
          text: item.chunk_text,
          source: item.source_url,
          url: item.source_url,
          similarity: item.similarity,
        }));
      } catch (error) {
        console.warn('Error retrieving content (non-fatal):', error.message);
      }
    }

    return context;
  }
}

export default new ChatController();
