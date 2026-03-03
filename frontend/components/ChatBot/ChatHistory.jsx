import React, { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';

const ChatHistory = ({ messages, onFeedback, isLoading }) => {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-4xl mb-4">✈️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Welcome to JetSetters!
          </h3>
          <p className="text-gray-600 text-sm">
            I'm your travel assistant. Ask me about flights, hotels, bookings, or travel advice.
          </p>
          <div className="mt-6 space-y-2">
            <p className="text-xs text-gray-500">Try asking:</p>
            <div className="flex flex-col gap-2">
              <button className="text-xs text-blue-600 hover:text-blue-700 hover:underline">
                "Show me my upcoming bookings"
              </button>
              <button className="text-xs text-blue-600 hover:text-blue-700 hover:underline">
                "What's your cancellation policy?"
              </button>
              <button className="text-xs text-blue-600 hover:text-blue-700 hover:underline">
                "Help me find a flight to Paris"
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-4"
      style={{ scrollBehavior: 'smooth' }}
    >
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onFeedback={onFeedback}
        />
      ))}
      
      {isLoading && (
        <div className="flex justify-start mb-4">
          <div className="bg-gray-100 rounded-lg px-4 py-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatHistory;
