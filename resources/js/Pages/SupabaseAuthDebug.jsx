import React, { useState, useEffect } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { Link } from 'react-router-dom';

const SupabaseAuthDebug = () => {
  const { user, session, loading, error, isAuthenticated, supabase } = useSupabaseAuth();
  const [localStorageData, setLocalStorageData] = useState({});
  const [supabaseConfig, setSupabaseConfig] = useState({});

  useEffect(() => {
    // Get localStorage data
    setLocalStorageData({
      isAuthenticated: localStorage.getItem('isAuthenticated'),
      user: localStorage.getItem('user'),
      token: localStorage.getItem('token'),
      supabase_token: localStorage.getItem('supabase_token')
    });

    // Get Supabase config (safely)
    try {
      setSupabaseConfig({
        url: supabase?.supabaseUrl || 'Not available',
        hasKey: !!supabase?.supabaseKey
      });
    } catch (err) {
      console.error('Error getting Supabase config:', err);
    }
  }, [supabase, user]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="auth-debug-container">
      <div className="auth-debug-header">
        <h1>Supabase Authentication Debug</h1>
        <Link to="/" className="back-link">← Back to Home</Link>
      </div>

      <div className="debug-section">
        <h2>🔐 Authentication Status</h2>
        <div className="status-grid">
          <div className="status-item">
            <span className="label">Authenticated:</span>
            <span className={`value ${isAuthenticated ? 'success' : 'error'}`}>
              {isAuthenticated ? '✓ Yes' : '✗ No'}
            </span>
          </div>
          <div className="status-item">
            <span className="label">Loading:</span>
            <span className="value">{loading ? 'Yes' : 'No'}</span>
          </div>
          <div className="status-item">
            <span className="label">Error:</span>
            <span className={`value ${error ? 'error' : 'success'}`}>
              {error || 'None'}
            </span>
          </div>
        </div>
      </div>

      {user && (
        <div className="debug-section">
          <h2>👤 User Object</h2>
          <div className="json-viewer">
            <button 
              onClick={() => copyToClipboard(JSON.stringify(user, null, 2))}
              className="copy-btn"
            >
              📋 Copy
            </button>
            <pre>{JSON.stringify(user, null, 2)}</pre>
          </div>
        </div>
      )}

      {session && (
        <div className="debug-section">
          <h2>🎫 Session Object</h2>
          <div className="json-viewer">
            <button 
              onClick={() => copyToClipboard(JSON.stringify(session, null, 2))}
              className="copy-btn"
            >
              📋 Copy
            </button>
            <pre>{JSON.stringify(session, null, 2)}</pre>
          </div>
        </div>
      )}

      <div className="debug-section">
        <h2>💾 LocalStorage Data</h2>
        <div className="json-viewer">
          <button 
            onClick={() => copyToClipboard(JSON.stringify(localStorageData, null, 2))}
            className="copy-btn"
          >
            📋 Copy
          </button>
          <pre>{JSON.stringify(localStorageData, null, 2)}</pre>
        </div>
      </div>

      <div className="debug-section">
        <h2>⚙️ Supabase Configuration</h2>
        <div className="config-grid">
          <div className="config-item">
            <span className="label">Supabase URL:</span>
            <span className="value">{supabaseConfig.url}</span>
          </div>
          <div className="config-item">
            <span className="label">Has Anon Key:</span>
            <span className={`value ${supabaseConfig.hasKey ? 'success' : 'error'}`}>
              {supabaseConfig.hasKey ? '✓ Yes' : '✗ No'}
            </span>
          </div>
        </div>
      </div>

      <div className="debug-section">
        <h2>🔗 Quick Actions</h2>
        <div className="action-buttons">
          <Link to="/supabase-login" className="action-btn primary">
            Go to Login
          </Link>
          <Link to="/supabase-signup" className="action-btn secondary">
            Go to Signup
          </Link>
          {isAuthenticated && (
            <>
              <Link to="/supabase-profile" className="action-btn info">
                View Profile
              </Link>
              <Link to="/my-trips" className="action-btn success">
                My Trips
              </Link>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .auth-debug-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .auth-debug-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 3px solid #0066B2;
        }

        .auth-debug-header h1 {
          margin: 0;
          color: #333;
        }

        .back-link {
          color: #0066B2;
          text-decoration: none;
          font-weight: 600;
        }

        .back-link:hover {
          text-decoration: underline;
        }

        .debug-section {
          background: white;
          border-radius: 8px;
          padding: 25px;
          margin-bottom: 25px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .debug-section h2 {
          margin: 0 0 20px 0;
          color: #333;
          font-size: 20px;
        }

        .status-grid,
        .config-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
        }

        .status-item,
        .config-item {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .label {
          font-weight: 600;
          color: #666;
        }

        .value {
          color: #333;
        }

        .value.success {
          color: #28a745;
          font-weight: 600;
        }

        .value.error {
          color: #dc3545;
          font-weight: 600;
        }

        .json-viewer {
          position: relative;
        }

        .json-viewer pre {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 20px;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.6;
          margin: 0;
        }

        .copy-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #0066B2;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          z-index: 10;
        }

        .copy-btn:hover {
          background: #004d85;
        }

        .action-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .action-btn {
          padding: 10px 20px;
          border-radius: 4px;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.3s;
          display: inline-block;
        }

        .action-btn.primary {
          background: #0066B2;
          color: white;
        }

        .action-btn.primary:hover {
          background: #004d85;
        }

        .action-btn.secondary {
          background: #6c757d;
          color: white;
        }

        .action-btn.secondary:hover {
          background: #545b62;
        }

        .action-btn.info {
          background: #17a2b8;
          color: white;
        }

        .action-btn.info:hover {
          background: #117a8b;
        }

        .action-btn.success {
          background: #28a745;
          color: white;
        }

        .action-btn.success:hover {
          background: #1e7e34;
        }
      `}</style>
    </div>
  );
};

export default SupabaseAuthDebug;
