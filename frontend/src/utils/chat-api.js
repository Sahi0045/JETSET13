import axios from "axios";

// In production the frontend is served from the same origin as the API,
// so a relative path (/api) is correct and works on any domain.
// VITE_API_URL can be set explicitly (e.g. for a separate backend host).
const API_URL = import.meta.env.VITE_API_URL || "/api";

// Create axios instance with default config
const chatApi = axios.create({
  baseURL: `${API_URL}/chat`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests if available
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
chatApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error || error.message || "An error occurred";
    return Promise.reject(new Error(message));
  },
);

/**
 * Send a message to the chatbot
 */
export const sendMessage = async (message, sessionId = null) => {
  try {
    const response = await chatApi.post("/message", {
      message,
      sessionId,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Create a new chat session
 */
export const createSession = async (metadata = {}) => {
  try {
    const response = await chatApi.post("/session", { metadata });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * End a chat session
 */
export const endSession = async (sessionId) => {
  try {
    const response = await chatApi.delete(`/session/${sessionId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get conversation history
 */
export const getHistory = async (sessionId, limit = 50) => {
  try {
    const response = await chatApi.get(`/history/${sessionId}`, {
      params: { limit },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Submit feedback for a message
 */
export const submitFeedback = async (
  messageId,
  sessionId,
  rating,
  comment = null,
) => {
  try {
    const response = await chatApi.post("/feedback", {
      messageId,
      sessionId,
      rating,
      comment,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Send a message with streaming response
 */
export const sendStreamingMessage = async (
  message,
  sessionId,
  onChunk,
  onComplete,
  onError,
) => {
  try {
    const token = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, sessionId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));

          if (data.error) {
            onError(new Error(data.error));
            return;
          }

          if (data.done) {
            onComplete(data.sessionId);
            return;
          }

          if (data.text) {
            onChunk(data.text);
          }
        }
      }
    }
  } catch (error) {
    onError(error);
  }
};

export default {
  sendMessage,
  createSession,
  endSession,
  getHistory,
  submitFeedback,
  sendStreamingMessage,
};
