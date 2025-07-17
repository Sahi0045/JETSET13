import React from 'react';
import { Link } from 'react-router-dom';

const FirebaseAuthStatusFallback = () => {
    return (
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-3">🔥 Firebase Auth Status</h3>
            
            <div className="space-y-2">
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-yellow-800 font-medium">⚠️ Firebase Not Connected</p>
                    <p className="text-sm text-yellow-700 mt-1">
                        Firebase authentication is not properly initialized. Check console for errors.
                    </p>
                </div>
                
                <div className="pt-2 space-x-2">
                    <Link 
                        to="/firebase-login" 
                        className="inline-block px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                        Try Login
                    </Link>
                    <Link 
                        to="/firebase-signup" 
                        className="inline-block px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                        Try Signup
                    </Link>
                </div>
                
                <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                    <p className="font-medium text-gray-700">Troubleshooting:</p>
                    <ul className="list-disc list-inside mt-1 text-gray-600 space-y-1">
                        <li>Check if Firebase environment variables are set</li>
                        <li>Verify Firebase project configuration</li>
                        <li>Check browser console for detailed errors</li>
                        <li>Try refreshing the page</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default FirebaseAuthStatusFallback; 