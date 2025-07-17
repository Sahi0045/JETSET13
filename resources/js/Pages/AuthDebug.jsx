import React from 'react';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { Link } from 'react-router-dom';

const AuthDebug = () => {
    const { user, isAuthenticated, loading, error } = useFirebaseAuth();

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h1>🔍 Firebase Auth Debug</h1>
            
            <div style={{ marginBottom: '20px' }}>
                <Link to="/" style={{ color: '#0066B2', textDecoration: 'none' }}>← Back to Home</Link>
            </div>

            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                <h2>Authentication Status</h2>
                <ul>
                    <li><strong>Loading:</strong> {loading ? '✅ Yes' : '❌ No'}</li>
                    <li><strong>Authenticated:</strong> {isAuthenticated ? '✅ Yes' : '❌ No'}</li>
                    <li><strong>Error:</strong> {error || '✅ None'}</li>
                </ul>
            </div>

            {user && (
                <div style={{ background: '#e8f5e8', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h2>User Information</h2>
                    <ul>
                        <li><strong>UID:</strong> {user.uid}</li>
                        <li><strong>Email:</strong> {user.email}</li>
                        <li><strong>Display Name:</strong> {user.displayName || 'Not set'}</li>
                        <li><strong>Email Verified:</strong> {user.emailVerified ? '✅ Yes' : '❌ No'}</li>
                        <li><strong>Photo URL:</strong> {user.photoURL || 'None'}</li>
                        <li><strong>Provider Data:</strong> {JSON.stringify(user.providerData, null, 2)}</li>
                    </ul>
                </div>
            )}

            <div style={{ background: '#fff3cd', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                <h2>Test Links</h2>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Link to="/firebase-login" style={{ padding: '8px 16px', background: '#007bff', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
                        Firebase Login
                    </Link>
                    <Link to="/firebase-signup" style={{ padding: '8px 16px', background: '#28a745', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
                        Firebase Signup
                    </Link>
                    <Link to="/firebase-profile" style={{ padding: '8px 16px', background: '#17a2b8', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
                        Firebase Profile
                    </Link>
                    <Link to="/profiledashboard" style={{ padding: '8px 16px', background: '#6c757d', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
                        Old Profile (should redirect)
                    </Link>
                    <Link to="/dashboard" style={{ padding: '8px 16px', background: '#fd7e14', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
                        Dashboard
                    </Link>
                </div>
            </div>

            <div style={{ background: '#f8d7da', padding: '20px', borderRadius: '8px' }}>
                <h2>Raw Data</h2>
                <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                    {JSON.stringify({ user, isAuthenticated, loading, error }, null, 2)}
                </pre>
            </div>
        </div>
    );
};

export default AuthDebug; 