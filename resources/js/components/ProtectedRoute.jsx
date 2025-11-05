import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

const ProtectedRoute = ({ children, requireAuth = true, requireAdmin = false }) => {
    const { user, loading } = useFirebaseAuth();
    const location = useLocation();

    // Check for admin JWT token
    const adminToken = localStorage.getItem('adminToken');
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    const isAdminLoggedIn = adminToken && adminUser.role === 'admin';

    // Show loading spinner while checking authentication
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // If route requires authentication and user is not logged in
    // Allow either Firebase auth or admin JWT auth
    if (requireAuth && !user && !isAdminLoggedIn) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // If route requires admin access and user is not admin
    // Check both Firebase user role and admin JWT
    if (requireAdmin && (!user || user.role !== 'admin') && !isAdminLoggedIn) {
        return <Navigate to="/" replace />;
    }

    // If route requires no authentication (like login page) and user is logged in
    if (!requireAuth && (user || isAdminLoggedIn)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default ProtectedRoute; 