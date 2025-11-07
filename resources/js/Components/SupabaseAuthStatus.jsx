import React from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { Link } from 'react-router-dom';
import SupabaseAuthStatusFallback from './SupabaseAuthStatusFallback';

const SupabaseAuthStatus = () => {
  const { user, session, loading, error, isAuthenticated } = useSupabaseAuth();

  if (loading) {
    return <SupabaseAuthStatusFallback message="Checking authentication status..." />;
  }

  if (error) {
    return (
      <div className="auth-status-container error">
        <div className="auth-status-card">
          <h2>Authentication Error</h2>
          <p className="error-message">{error}</p>
          <Link to="/supabase-login" className="btn btn-primary">
            Try Login Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-status-container">
      <div className="auth-status-card">
        <h2>Supabase Authentication Status</h2>
        
        <div className="auth-status-section">
          <h3>Status</h3>
          <p className={`status-badge ${isAuthenticated ? 'authenticated' : 'unauthenticated'}`}>
            {isAuthenticated ? '✓ Authenticated' : '✗ Not Authenticated'}
          </p>
        </div>

        {user && (
          <>
            <div className="auth-status-section">
              <h3>User Information</h3>
              <div className="user-info">
                <div className="info-row">
                  <span className="label">User ID:</span>
                  <span className="value">{user.id}</span>
                </div>
                <div className="info-row">
                  <span className="label">Email:</span>
                  <span className="value">{user.email}</span>
                </div>
                <div className="info-row">
                  <span className="label">Email Verified:</span>
                  <span className="value">
                    {user.email_confirmed_at ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                {user.user_metadata?.first_name && (
                  <div className="info-row">
                    <span className="label">First Name:</span>
                    <span className="value">{user.user_metadata.first_name}</span>
                  </div>
                )}
                {user.user_metadata?.last_name && (
                  <div className="info-row">
                    <span className="label">Last Name:</span>
                    <span className="value">{user.user_metadata.last_name}</span>
                  </div>
                )}
                {user.phone && (
                  <div className="info-row">
                    <span className="label">Phone:</span>
                    <span className="value">{user.phone}</span>
                  </div>
                )}
                <div className="info-row">
                  <span className="label">Created At:</span>
                  <span className="value">
                    {new Date(user.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Last Sign In:</span>
                  <span className="value">
                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {session && (
              <div className="auth-status-section">
                <h3>Session Information</h3>
                <div className="user-info">
                  <div className="info-row">
                    <span className="label">Access Token:</span>
                    <span className="value token">
                      {session.access_token.substring(0, 20)}...
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Expires At:</span>
                    <span className="value">
                      {new Date(session.expires_at * 1000).toLocaleString()}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Token Type:</span>
                    <span className="value">{session.token_type}</span>
                  </div>
                </div>
              </div>
            )}

            {user.user_metadata && Object.keys(user.user_metadata).length > 0 && (
              <div className="auth-status-section">
                <h3>User Metadata</h3>
                <pre className="metadata-json">
                  {JSON.stringify(user.user_metadata, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}

        <div className="auth-status-actions">
          {isAuthenticated ? (
            <>
              <Link to="/supabase-profile" className="btn btn-primary">
                View Profile
              </Link>
              <Link to="/my-trips" className="btn btn-secondary">
                My Trips
              </Link>
            </>
          ) : (
            <>
              <Link to="/supabase-login" className="btn btn-primary">
                Login
              </Link>
              <Link to="/supabase-signup" className="btn btn-secondary">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .auth-status-container {
          max-width: 800px;
          margin: 40px auto;
          padding: 20px;
        }

        .auth-status-card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 30px;
        }

        .auth-status-card h2 {
          margin-bottom: 30px;
          color: #333;
          border-bottom: 2px solid #0066B2;
          padding-bottom: 10px;
        }

        .auth-status-section {
          margin-bottom: 30px;
        }

        .auth-status-section h3 {
          color: #555;
          margin-bottom: 15px;
          font-size: 18px;
        }

        .status-badge {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 4px;
          font-weight: 600;
        }

        .status-badge.authenticated {
          background-color: #d4edda;
          color: #155724;
        }

        .status-badge.unauthenticated {
          background-color: #f8d7da;
          color: #721c24;
        }

        .user-info {
          background: #f8f9fa;
          border-radius: 4px;
          padding: 15px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e9ecef;
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .label {
          font-weight: 600;
          color: #666;
        }

        .value {
          color: #333;
        }

        .value.token {
          font-family: monospace;
          font-size: 12px;
        }

        .metadata-json {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          padding: 15px;
          overflow-x: auto;
          font-size: 14px;
        }

        .auth-status-actions {
          display: flex;
          gap: 10px;
          margin-top: 30px;
        }

        .btn {
          padding: 10px 20px;
          border-radius: 4px;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.3s;
        }

        .btn-primary {
          background: #0066B2;
          color: white;
        }

        .btn-primary:hover {
          background: #004d85;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover {
          background: #545b62;
        }

        .error-message {
          color: #dc3545;
          padding: 10px;
          background: #f8d7da;
          border-radius: 4px;
          margin: 15px 0;
        }
      `}</style>
    </div>
  );
};

export default SupabaseAuthStatus;
