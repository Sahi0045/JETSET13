import React from 'react';

const SupabaseAuthStatusFallback = ({ message = 'Loading...' }) => {
  return (
    <div className="auth-status-fallback">
      <div className="fallback-content">
        <div className="spinner"></div>
        <p>{message}</p>
      </div>

      <style jsx>{`
        .auth-status-fallback {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
          padding: 40px 20px;
        }

        .fallback-content {
          text-align: center;
        }

        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #0066B2;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .fallback-content p {
          color: #666;
          font-size: 16px;
          margin: 0;
        }
      `}</style>
    </div>
  );
};

export default SupabaseAuthStatusFallback;
