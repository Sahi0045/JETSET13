import React, { useState, useEffect, useRef } from 'react';
import './AIChatbot.css';

const AIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      content: 'Hi there! I\'m the Jetsetterss AI assistant. How can I help you today?',
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Check authentication status on mount
  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated');
    setIsAuthenticated(authStatus === 'true');
  }, []);

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

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Add user message
    const userMessage = { type: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    // Show typing indicator
    setIsTyping(true);

    // Simulate AI response based on authentication status
    setTimeout(() => {
      let botResponse;

      // Very basic AI logic - in a real app this would call an API or more sophisticated logic
      const input = inputValue.toLowerCase();

      if (input.includes('flight') || input.includes('fly')) {
        botResponse = {
          type: 'bot',
          content: 'We offer flights to over 100 destinations worldwide. Would you like me to help you find the best flight options for your trip?'
        };
      } else if (input.includes('cruise')) {
        botResponse = {
          type: 'bot',
          content: 'Our cruise packages include luxury amenities and visits to the most beautiful destinations. What type of cruise experience are you looking for?'
        };
      } else if (input.includes('rental') || input.includes('car')) {
        botResponse = {
          type: 'bot',
          content: 'We offer car rentals in partnership with leading providers. Would you like me to check availability for a specific location and date?'
        };
      } else if (input.includes('package') || input.includes('deal')) {
        botResponse = {
          type: 'bot',
          content: 'Our vacation packages combine flights, accommodations, and activities at discounted rates. Are you interested in any specific destination?'
        };
      } else if (input.includes('cancel') || input.includes('refund')) {
        if (isAuthenticated) {
          botResponse = {
            type: 'bot',
            content: 'I can help you with your cancellation request. Since you\'re logged in, I can see your bookings. Please let me know which reservation you\'d like to cancel.'
          };

        } else {
          botResponse = {
            type: 'bot',
            content: 'For cancellation requests, you\'ll need to log in to your account. Once logged in, I can assist you with your specific bookings.'
          };
        }
      } else if (input.includes('account') || input.includes('login')) {
        if (isAuthenticated) {
          botResponse = {
            type: 'bot',
            content: 'You\'re currently logged in to your Jetsetterss account. Would you like me to help you manage your profile or view your trip history?'
          };
        } else {
          botResponse = {
            type: 'bot',
            content: 'You can login or create an account by clicking the Login/Signup button in the top right corner of the page.'
          };
        }
      } else {
        // Default response
        botResponse = {
          type: 'bot',
          content: isAuthenticated ?
            'Thank you for your question. As a logged-in customer, I can provide personalized assistance. How else can I help with your travel plans?' :
            'Thanks for your question. For more personalized assistance, consider logging in or creating an account. How else can I help you today?'
        };
      }

      setIsTyping(false);
      setMessages(prev => [...prev, botResponse]);
    }, 1500);
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
            <input
              type="text"
              placeholder="Type your message..."
              value={inputValue}
              onChange={handleInputChange}
            />
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
