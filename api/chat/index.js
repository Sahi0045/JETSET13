import express from "express";
import rateLimit from "express-rate-limit";
import chatController from "../../backend/controllers/chat.controller.js";
import {
  optionalProtect,
  protect,
} from "../../backend/middleware/auth.middleware.js";
import chatbotConfig from "../../config/chatbot.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const messageLimiter = rateLimit({
  windowMs: chatbotConfig.rateLimit.windowMs,
  max: chatbotConfig.rateLimit.messagesPerMinute,
  message: {
    error: "Too many messages sent. Please wait a moment and try again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const sessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: chatbotConfig.rateLimit.sessionsPerHour,
  message: {
    error: "Too many session requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Route handlers
//
// IMPORTANT: Class methods must be explicitly bound (or wrapped in arrow
// functions) before being handed to Express.  If you pass an unbound method
// reference such as `chatController.processMessage`, the `this` keyword
// inside that method will be `undefined` at call-time because Express invokes
// it as a plain function, not as a method on the instance.
// ---------------------------------------------------------------------------

// POST /api/chat/message
// Send a user message and receive an AI response (standard request/response).
router.post("/message", optionalProtect, messageLimiter, (req, res) =>
  chatController.processMessage(req, res),
);

// POST /api/chat/stream
// Send a user message and receive a streaming AI response via SSE.
router.post("/stream", optionalProtect, messageLimiter, (req, res) =>
  chatController.processStreamingMessage(req, res),
);

// POST /api/chat/session
// Create a new chat session.
router.post("/session", optionalProtect, sessionLimiter, (req, res) =>
  chatController.createSession(req, res),
);

// DELETE /api/chat/session/:sessionId
// End an existing session.
router.delete("/session/:sessionId", optionalProtect, (req, res) =>
  chatController.endSession(req, res),
);

// GET /api/chat/history/:sessionId
// Retrieve message history for a session.
router.get("/history/:sessionId", optionalProtect, (req, res) =>
  chatController.getHistory(req, res),
);

// POST /api/chat/feedback
// Submit a thumbs-up / thumbs-down (or 1–5 star) rating for an AI message.
router.post("/feedback", optionalProtect, (req, res) =>
  chatController.submitFeedback(req, res),
);

// GET /api/chat/health
// Quick health-check that confirms the chat service is reachable and the
// Gemini API key is present.  Useful for CI smoke tests and monitoring.
router.get("/health", (_req, res) => {
  try {
    // Import is safe here — healthCheck() does NOT throw
    import("../../backend/services/gemini.service.js").then(
      ({ default: geminiService }) => {
        const status = geminiService.healthCheck();
        res.json({
          status: status.ready ? "ok" : "degraded",
          gemini: status,
          timestamp: new Date().toISOString(),
        });
      },
    );
  } catch {
    res
      .status(500)
      .json({ status: "error", timestamp: new Date().toISOString() });
  }
});

export default router;
