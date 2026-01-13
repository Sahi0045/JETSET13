import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import LoadingSpinner from '../Components/LoadingSpinner';

const ProtectedRoute = ({ children, requireAuth = true, requireAdmin = false }) => {
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Check authentication from localStorage
        const authStatus = localStorage.getItem('isAuthenticated') === 'true';
        const userData = localStorage.getItem('user');

        setIsAuthenticated(authStatus);
        if (userData) {
            try {
                setUser(JSON.parse(userData));
            } catch (error) {
                console.error('Error parsing user data:', error);
            }
        }
        setLoading(false);
    }, []);

    // Check for admin JWT token
    const adminToken = localStorage.getItem('adminToken');
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    const isAdminLoggedIn = adminToken && adminUser.role === 'admin';

    // Show loading spinner while checking authentication
    if (loading) {
        return <LoadingSpinner text="Authenticating..." fullScreen={true} />;
    }

    // If route requires authentication and user is not logged in
    // Allow either regular auth or admin JWT auth
    if (requireAuth && !isAuthenticated && !isAdminLoggedIn) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // If route requires admin access and user is not admin
    // Check both regular user role and admin JWT
    if (requireAdmin && (!user || user.role !== 'admin') && !isAdminLoggedIn) {
        return <Navigate to="/" replace />;
    }

    // Allow users to access login pages even if logged in
    // (they might want to switch accounts or logout first)

    return children;
};

export default ProtectedRoute; 