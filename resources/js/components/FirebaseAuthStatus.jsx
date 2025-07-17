import React from 'react';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { Link } from 'react-router-dom';
import FirebaseAuthStatusFallback from './FirebaseAuthStatusFallback';

const FirebaseAuthStatus = () => {
    try {
        const { user, loading, isAuthenticated, error } = useFirebaseAuth();
        
        // If there's an error with Firebase, show fallback
        if (error) {
            return <FirebaseAuthStatusFallback />;
        }

    if (loading) {
        return (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800">🔄 Checking authentication status...</p>
            </div>
        );
    }

    return (
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-3">🔥 Firebase Auth Status</h3>
            
            {isAuthenticated ? (
                <div className="space-y-2">
                    <div className="p-3 bg-green-50 border border-green-200 rounded">
                        <p className="text-green-800 font-medium">✅ Authenticated</p>
                    </div>
                    
                    <div className="space-y-1 text-sm">
                        <p><strong>UID:</strong> {user.uid}</p>
                        <p><strong>Email:</strong> {user.email}</p>
                        <p><strong>Display Name:</strong> {user.displayName || 'Not set'}</p>
                        <p><strong>Email Verified:</strong> {user.emailVerified ? '✅ Yes' : '❌ No'}</p>
                        <p><strong>Provider:</strong> {user.providerData?.[0]?.providerId || 'password'}</p>
                    </div>
                    
                    <div className="pt-3 space-x-2">
                        <Link 
                            to="/firebase-profile" 
                            className="inline-block px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                            View Profile
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="p-3 bg-red-50 border border-red-200 rounded">
                        <p className="text-red-800 font-medium">❌ Not Authenticated</p>
                    </div>
                    
                    <div className="pt-2 space-x-2">
                        <Link 
                            to="/firebase-login" 
                            className="inline-block px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                            Login
                        </Link>
                        <Link 
                            to="/firebase-signup" 
                            className="inline-block px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                            Sign Up
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
    } catch (error) {
        console.error('FirebaseAuthStatus error:', error);
        return <FirebaseAuthStatusFallback />;
    }
};

export default FirebaseAuthStatus; 