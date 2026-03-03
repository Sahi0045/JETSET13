import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

const ChatMessage = ({ message, onFeedback }) => {
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const { role, content, timestamp, isStreaming } = message;

  const isUser = role === 'user';

  const handleFeedback = (rating) => {
    if (feedbackGiven) return;
    setFeedbackGiven(true);
    onFeedback(message.id, rating);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div
          className={`rounded-lg px-4 py-2 ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <div className="text-sm whitespace-pre-wrap break-words">
            {content}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 mt-1 px-2">
          <span className="text-xs text-gray-500">
            {new Date(timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          
          {!isUser && !isStreaming && (
            <div className="flex gap-1">
              <button
                onClick={() => handleFeedback(5)}
                disabled={feedbackGiven}
                className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                  feedbackGiven ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title="Helpful"
              >
                <ThumbsUp className="w-3 h-3 text-gray-600" />
              </button>
              <button
                onClick={() => handleFeedback(1)}
                disabled={feedbackGiven}
                className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                  feedbackGiven ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title="Not helpful"
              >
                <ThumbsDown className="w-3 h-3 text-gray-600" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
