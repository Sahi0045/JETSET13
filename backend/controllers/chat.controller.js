import chatModel from '../models/chat.model.js';
import geminiService from '../services/gemini.service.js';
import queryClassifier from '../services/query-classifier.js';
import responseGenerator from '../services/response-generator.js';
import chatbotConfig from '../../config/chatbot.js';

class ChatController {
  /**
   * Process incoming message
   */
  async processMessage(req, res) {
    try {
      const { sessionId, message } = req.body;
      const userId = req.user?.id || null;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Get or create session
      let session;
      if (sessionId) {
        session = await chatModel.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
      } else {
        session = await chatModel.createSession(userId);
      }

      // Save user message
      await chatModel.addMessage(session.id, 'user', message);

      // Classify query
      const classification = await queryClassifier.classify(message);
      const route = queryClassifier.route(classification);

      // Get conversation history
      const history = await chatModel.getHistory(
        session.id,
        chatbotConfig.context.maxTurns
      );

      // Build context
      const context = await this._buildContext(userId, classification, route);

      // Generate response
      const aiResponse = await geminiService.generateResponse(
        message,
        context,
        history
      );

      // Format response
      const formattedResponse = responseGenerator.format(aiResponse.text, {
        sources: context.retrievedContent?.map(c => ({
          title: c.source,
          url: c.url,
        })) || [],
      });

      // Save assistant message
      const assistantMessage = await chatModel.addMessage(
        session.id,
        'assistant',
        formattedResponse.content,
        aiResponse.tokensUsed
      );

      // Log analytics
      await chatModel.logAnalytics(session.id, 'message_processed', {
        intent: classification.intent,
        confidence: classification.confidence,
        route,
        tokensUsed: aiResponse.tokensUsed,
      });

      res.json({
        sessionId: session.id,
        message: formattedResponse.content,
        messageId: assistantMessage.id,
        metadata: {
          intent: classification.intent,
          confidence: classification.confidence,
          ...formattedResponse.metadata,
        },
      });
    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorResponse = responseGenerator.createErrorResponse(error);
      
      res.status(500).json({
        error: 'Failed to process message',
        message: errorResponse.content,
      });
    }
  }

  /**
   * Process streaming message
   */
  async processStreamingMessage(req, res) {
    try {
      const { sessionId, message } = req.body;
      const userId = req.user?.id || null;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Get or create session
      let session;
      if (sessionId) {
        session = await chatModel.getSession(sessionId);
      } else {
        session = await chatModel.createSession(userId);
      }

      // Save user message
      await chatModel.addMessage(session.id, 'user', message);

      // Classify and build context
      const classification = await queryClassifier.classify(message);
      const route = queryClassifier.route(classification);
      const history = await chatModel.getHistory(session.id, chatbotConfig.context.maxTurns);
      const context = await this._buildContext(userId, classification, route);

      // Stream response
      let fullResponse = '';
      
      for await (const chunk of geminiService.generateStreamingResponse(message, context, history)) {
        if (chunk.done) {
          // Save complete response
          await chatModel.addMessage(session.id, 'assistant', fullResponse);
          
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

      await chatModel.logAnalytics(session.id, 'session_created', {
        userId,
        metadata,
      });

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

      await chatModel.logAnalytics(sessionId, 'session_ended');

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

      await chatModel.logAnalytics(sessionId, 'feedback_submitted', {
        messageId,
        rating,
        hasComment: !!comment,
      });

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
   * Build context for AI response
   * @private
   */
  async _buildContext(userId, classification, route) {
    const context = {};

    // Add user information if authenticated
    if (userId) {
      // TODO: Fetch user profile and bookings
      context.user = {
        id: userId,
        // Add user details here
      };
    }

    // Retrieve relevant content based on classification
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
        console.error('Error retrieving content:', error);
      }
    }

    return context;
  }
}

export default new ChatController();
