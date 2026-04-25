import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AIChatbot.css';

const MAX_MESSAGE_LENGTH = 2000;

// Strip HTML tags client-side before sending to backend
const sanitizeInput = (text) => text.replace(/<[^>]*>/g, '').trim();

const AIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const initializedRef = useRef(false);

  // Check authentication status on mount and when chat opens
  const checkAuth = useCallback(() => {
    // Check multiple sources for auth state
    const token = localStorage.getItem('token') ||
      localStorage.getItem('supabase_token') ||
      localStorage.getItem('adminToken');
    const authStatus = localStorage.getItem('isAuthenticated');
    const userStr = localStorage.getItem('user');

    const isLoggedIn = !!(token && (authStatus === 'true' || userStr));
    setIsAuthenticated(isLoggedIn);

    if (isLoggedIn && userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.firstName || user.name || user.email?.split('@')[0] || '');
      } catch {
        setUserName('');
      }
    } else {
      setUserName('');
    }

    return isLoggedIn;
  }, []);

  // Initialize welcome message
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const isLoggedIn = checkAuth();

      const welcomeMessage = isLoggedIn && userName
        ? `Hi ${userName}! I'm the Jetsetterss AI assistant. I can help you with your bookings, travel plans, and more. What would you like to know?`
        : 'Hi there! I\'m the Jetsetterss AI assistant. How can I help you today?';

      setMessages([{ type: 'bot', content: welcomeMessage }]);
    }
  }, [checkAuth, userName]);

  // Re-check auth when chat opens
  useEffect(() => {
    if (isOpen) {
      checkAuth();
    }
  }, [isOpen, checkAuth]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  /**
   * Fetch with timeout and automatic retry.
   * Prevents hanging requests on serverless cold starts.
   */
  const fetchWithRetry = async (url, options, { timeout = 25000, retries = 1 } = {}) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (err) {
        clearTimeout(timeoutId);

        // If this was the last attempt, throw
        if (attempt >= retries) throw err;

        // Wait briefly before retrying (cold start may have warmed up)
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`Chat API retry attempt ${attempt + 1}…`);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;
    if (inputValue.length > MAX_MESSAGE_LENGTH) return;

    // Re-check auth before sending (user may have logged in/out)
    checkAuth();

    // Client-side sanitize
    const cleanMessage = sanitizeInput(inputValue);
    if (!cleanMessage) return;

    // Add user message
    const userMessage = { type: 'user', content: cleanMessage };
    setMessages(prev => [...prev, userMessage]);

    // Store current input value and clear it
    const currentInput = inputValue;
    setInputValue('');

    // Show typing indicator
    setIsTyping(true);

    try {
      // Get auth token if available — try all possible token sources
      const token = localStorage.getItem('token') ||
        localStorage.getItem('supabase_token') ||
        localStorage.getItem('adminToken');

      // Get or initialize session ID
      const sessionId = localStorage.getItem('chatSessionId');

      const headers = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetchWithRetry('/api/chat/message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: sessionId || undefined,
          message: cleanMessage
        })
      }, { timeout: 28000, retries: 1 });

      // Handle security validation errors from backend
      if (response.status === 400) {
        const errData = await response.json();
        const botResponse = {
          type: 'bot',
          content: errData.message || 'I couldn\'t process that message. Please try rephrasing.',
        };
        setMessages(prev => [...prev, botResponse]);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();

      // Save session ID if provided by the backend and not already saved
      if (data.sessionId && !sessionId) {
        localStorage.setItem('chatSessionId', data.sessionId);
      }

      const botResponse = {
        type: 'bot',
        content: data.message || 'I\'m sorry, I couldn\'t process that right now.'
      };

      setMessages(prev => [...prev, botResponse]);
    } catch (error) {
      console.error('Chat API Error:', error);

      let errorMessage;
      if (error.name === 'AbortError') {
        errorMessage = 'The request took too long. Please try again — it should be faster now.';
      } else {
        errorMessage = 'I\'m sorry, I am having trouble connecting to my servers right now. Please try again later.';
      }

      const errorResponse = {
        type: 'bot',
        content: errorMessage,
      };
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="ai-chatbot-container">
      {/* Chat toggle button */}
      <button
        className={`chat-toggle-button ${isOpen ? 'open' : ''}`}
        onClick={toggleChat}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="chatbot-title">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M2 12h20"></path>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>Jetsetterss Assistant</span>
            </div>
          </div>

          <div className="chatbot-messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.type === 'bot' ? 'bot-message' : 'user-message'}`}
              >
                {message.type === 'bot' && (
                  <div className="bot-avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M2 12h20"></path>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                  </div>
                )}
                <div className="message-content">{message.content}</div>
              </div>
            ))}

            {isTyping && (
              <div className="message bot-message">
                <div className="bot-avatar">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M2 12h20"></path>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </div>
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="chatbot-input" onSubmit={handleSubmit}>
            <div className="input-wrapper">
              <input
                type="text"
                placeholder="Type your message..."
                value={inputValue}
                onChange={handleInputChange}
                maxLength={MAX_MESSAGE_LENGTH}
              />
              {inputValue.length > MAX_MESSAGE_LENGTH - 200 && (
                <span className="char-counter" style={{
                  position: 'absolute', right: '50px', bottom: '8px',
                  fontSize: '11px', color: inputValue.length >= MAX_MESSAGE_LENGTH ? '#e74c3c' : '#999'
                }}>
                  {inputValue.length}/{MAX_MESSAGE_LENGTH}
                </span>
              )}
            </div>
            <button type="submit">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AIChatbot;
