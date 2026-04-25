import { useState, useEffect, useCallback, useRef } from "react";
import * as chatApi from "../utils/chat-api";

const STORAGE_KEY = "chat_session_id";
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const useChat = () => {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const streamingMessageRef = useRef("");

  // Load session from localStorage on mount
  useEffect(() => {
    const storedSessionId = localStorage.getItem(STORAGE_KEY);
    const lastActivity = localStorage.getItem(`${STORAGE_KEY}_activity`);

    if (storedSessionId && lastActivity) {
      const timeSinceActivity = Date.now() - parseInt(lastActivity);

      if (timeSinceActivity < SESSION_TIMEOUT) {
        setSessionId(storedSessionId);
        loadHistory(storedSessionId);
      } else {
        // Session expired
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(`${STORAGE_KEY}_activity`);
      }
    }
  }, []);

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    localStorage.setItem(`${STORAGE_KEY}_activity`, now.toString());
  }, []);

  // Load conversation history
  const loadHistory = useCallback(async (sid) => {
    try {
      const data = await chatApi.getHistory(sid);
      const formattedMessages = data.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at,
      }));
      setMessages(formattedMessages);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, []);

  // Create or get session
  const ensureSession = useCallback(async () => {
    if (sessionId) {
      updateActivity();
      return sessionId;
    }

    try {
      const data = await chatApi.createSession();
      const newSessionId = data.sessionId;

      setSessionId(newSessionId);
      localStorage.setItem(STORAGE_KEY, newSessionId);
      updateActivity();

      return newSessionId;
    } catch (err) {
      throw new Error("Failed to create session");
    }
  }, [sessionId, updateActivity]);

  // Send message
  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      setError(null);
      setIsLoading(true);

      // Add user message immediately
      const userMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const sid = await ensureSession();
        const data = await chatApi.sendMessage(message, sid);

        // Replace temp message and add assistant response
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== userMessage.id),
          {
            id: userMessage.id.replace("temp-", ""),
            role: "user",
            content: message,
            timestamp: userMessage.timestamp,
          },
          {
            id: data.messageId,
            role: "assistant",
            content: data.message,
            timestamp: new Date().toISOString(),
            metadata: data.metadata,
          },
        ]);

        updateActivity();
      } catch (err) {
        setError(err.message);
        // Remove the temporary user message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        setIsLoading(false);
      }
    },
    [ensureSession, updateActivity],
  );

  // Send message with streaming
  const sendStreamingMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      setError(null);
      setIsLoading(true);
      setIsStreaming(true);
      streamingMessageRef.current = "";

      // Add user message
      const userMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add placeholder for assistant message
      const assistantMessageId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
          isStreaming: true,
        },
      ]);

      try {
        const sid = await ensureSession();

        await chatApi.sendStreamingMessage(
          message,
          sid,
          // onChunk
          (text) => {
            streamingMessageRef.current += text;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: streamingMessageRef.current }
                  : msg,
              ),
            );
          },
          // onComplete
          (newSessionId) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg,
              ),
            );
            setIsStreaming(false);
            setIsLoading(false);
            updateActivity();
          },
          // onError
          (err) => {
            setError(err.message);
            setMessages((prev) =>
              prev.filter((m) => m.id !== assistantMessageId),
            );
            setIsStreaming(false);
            setIsLoading(false);
          },
        );
      } catch (err) {
        setError(err.message);
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [ensureSession, updateActivity],
  );

  // Open chat
  const openChat = useCallback(() => {
    setIsOpen(true);
  }, []);

  // Close chat
  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(`${STORAGE_KEY}_activity`);
  }, []);

  // Submit feedback
  const submitFeedback = useCallback(
    async (messageId, rating, comment) => {
      if (!sessionId) return;

      try {
        await chatApi.submitFeedback(messageId, sessionId, rating, comment);
      } catch (err) {
        console.error("Failed to submit feedback:", err);
      }
    },
    [sessionId],
  );

  return {
    messages,
    sessionId,
    isLoading,
    isOpen,
    error,
    isStreaming,
    sendMessage,
    sendStreamingMessage,
    openChat,
    closeChat,
    clearHistory,
    loadHistory,
    submitFeedback,
  };
};

export default useChat;
