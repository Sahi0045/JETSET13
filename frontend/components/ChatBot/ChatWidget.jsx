import React from 'react';
import { MessageCircle, X, Trash2 } from 'lucide-react';
import useChat from '../../hooks/useChat';
import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';

const ChatWidget = () => {
  const {
    messages,
    isLoading,
    isOpen,
    error,
    sendMessage,
    openChat,
    closeChat,
    clearHistory,
    submitFeedback,
  } = useChat();

  const handleSend = (message) => {
    sendMessage(message);
  };

  const handleFeedback = (messageId, rating) => {
    submitFeedback(messageId, rating);
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      clearHistory();
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110 flex items-center justify-center z-50"
          aria-label="Open chat"
        >
          <MessageCircle className="w-6 h-6" />
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {messages.length}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50 border border-gray-200">
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 rounded-t-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">JetSetters Assistant</h3>
                <p className="text-xs text-blue-100">
                  {isLoading ? 'Typing...' : 'Online'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="p-2 hover:bg-white/20 rounded transition-colors"
                  title="Clear history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={closeChat}
                className="p-2 hover:bg-white/20 rounded transition-colors"
                aria-label="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border-b border-red-200 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Messages */}
          <ChatHistory
            messages={messages}
            onFeedback={handleFeedback}
            isLoading={isLoading}
          />

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            disabled={isLoading}
            placeholder="Ask me anything about travel..."
          />

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50 rounded-b-lg border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Powered by Gemini AI
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWidget;
