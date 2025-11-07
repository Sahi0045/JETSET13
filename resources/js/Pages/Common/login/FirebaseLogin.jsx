import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGoogle, FaFacebook, FaEye, FaEyeSlash, FaSpinner, FaLock, FaEnvelope } from 'react-icons/fa';
import { useFirebaseAuth } from '../../../contexts/FirebaseAuthContext';
import './login.css';

export default function FirebaseLogin() {
    const navigate = useNavigate();
    const { 
        signIn, 
        signInWithGoogle, 
        signInWithFacebook, 
        resetPassword, 
        loading, 
        error, 
        clearError,
        isAuthenticated 
    } = useFirebaseAuth();

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        remember: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetMessage, setResetMessage] = useState('');

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/my-trips');
        }
    }, [isAuthenticated, navigate]);

    // Clear errors when form data changes
    useEffect(() => {
        if (error) {
            clearError();
        }
        setFormErrors({});
    }, [formData, clearError, error]);

    // Validate form
    const validateForm = () => {
        const errors = {};

        if (!formData.email) {
            errors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            errors.email = 'Email is invalid';
        }

        if (!formData.password) {
            errors.password = 'Password is required';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Handle form input changes
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Handle email/password login
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsProcessing(true);

        try {
            const result = await signIn(formData.email, formData.password);

            if (result.success) {
                console.log('Login successful:', result.user);

                // Verify token is stored (now stored immediately in firebase.js)
                const token = localStorage.getItem('token');
                console.log('Token stored:', token ? 'Yes' : 'No');

                // Determine if the user is an admin
                const isAdmin = result.user?.email === 'sahi0045@hotmail.com';
                if (isAdmin) {
                    const token = localStorage.getItem('token');
                    localStorage.setItem('adminToken', token);
                    localStorage.setItem('adminUser', JSON.stringify({
                      id: result.user.uid,
                      email: result.user.email,
                      firstName: result.user.firstName,
                      lastName: result.user.lastName,
                      role: 'admin'
                    }));
                    navigate('/admin');
                } else {
                    navigate('/my-trips');
                }
            } else {
                setFormErrors({ general: result.error });
            }
        } catch (error) {
            console.error('Login error:', error);
            setFormErrors({ general: 'An unexpected error occurred. Please try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle Google login
    const handleGoogleLogin = async () => {
        setIsProcessing(true);

        try {
            const result = await signInWithGoogle();

            if (result.success) {
                console.log('Google login successful:', result.user);

                // Verify token is stored (now stored immediately in firebase.js)
                const token = localStorage.getItem('token');
                console.log('Token stored:', token ? 'Yes' : 'No');

                // Determine if the user is an admin
                const isAdmin = result.user?.email === 'sahi0045@hotmail.com';
                if (isAdmin) {
                    const token = localStorage.getItem('token');
                    localStorage.setItem('adminToken', token);
                    localStorage.setItem('adminUser', JSON.stringify({
                      id: result.user.uid,
                      email: result.user.email,
                      firstName: result.user.firstName,
                      lastName: result.user.lastName,
                      role: 'admin'
                    }));
                    navigate('/admin');
                } else {
                    navigate('/my-trips');
                }
            } else {
                setFormErrors({ general: result.error });
            }
        } catch (error) {
            console.error('Google login error:', error);
            setFormErrors({ general: 'Google login failed. Please try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle Facebook login
    const handleFacebookLogin = async () => {
        setIsProcessing(true);

        try {
            const result = await signInWithFacebook();

            if (result.success) {
                console.log('Facebook login successful:', result.user);

                // Verify token is stored (now stored immediately in firebase.js)
                const token = localStorage.getItem('token');
                console.log('Token stored:', token ? 'Yes' : 'No');

                // Determine if the user is an admin
                const isAdmin = result.user?.email === 'sahi0045@hotmail.com';
                if (isAdmin) {
                    const token = localStorage.getItem('token');
                    localStorage.setItem('adminToken', token);
                    localStorage.setItem('adminUser', JSON.stringify({
                      id: result.user.uid,
                      email: result.user.email,
                      firstName: result.user.firstName,
                      lastName: result.user.lastName,
                      role: 'admin'
                    }));
                    navigate('/admin');
                } else {
                    navigate('/my-trips');
                }
            } else {
                setFormErrors({ general: result.error });
            }
        } catch (error) {
            console.error('Facebook login error:', error);
            setFormErrors({ general: 'Facebook login failed. Please try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle forgot password
    const handleForgotPassword = async (e) => {
        e.preventDefault();
        
        if (!resetEmail) {
            setFormErrors({ resetEmail: 'Email is required' });
            return;
        }

        if (!/\S+@\S+\.\S+/.test(resetEmail)) {
            setFormErrors({ resetEmail: 'Email is invalid' });
            return;
        }

        try {
            const result = await resetPassword(resetEmail);
            
            if (result.success) {
                setResetMessage('Password reset email sent successfully! Check your inbox.');
                setShowForgotPassword(false);
                setResetEmail('');
            } else {
                setFormErrors({ resetEmail: result.error });
            }
        } catch (error) {
            console.error('Password reset error:', error);
            setFormErrors({ resetEmail: 'Failed to send reset email. Please try again.' });
        }
    };

    return (
        <div className="login-container">
            {/* Back Button - Positioned at top of page */}
            <button 
                onClick={() => navigate('/flights')}
                className="back-button"
            >
                ← Back to Flights
            </button>
            <div className="login-wrapper">
                {/* Left Side - Image */}
                <div className="login-image-section">
                    <div className="image-overlay">
                        <h2 className="image-title">Welcome to JetSet Travel</h2>
                        <p className="image-subtitle">Discover amazing destinations and create unforgettable memories</p>
                    </div>
                </div>
                
                {/* Right Side - Login Form */}
                <div className="login-form-section">
                    <div className="login-form-container">
                        <div className="login-header">
                            <h1 className="login-title">Sign In</h1>
                            <p className="login-subtitle">Welcome back! Please enter your details</p>
                        </div>
                        
                        {/* Success Message */}
                        {resetMessage && (
                            <div className="success-message">
                                <span className="success-icon">✓</span>
                                {resetMessage}
                            </div>
                        )}
                        
                        {/* Forgot Password Modal */}
                        {showForgotPassword && (
                            <div className="forgot-password-modal">
                                <div className="modal-header">
                                    <h3>Reset Password</h3>
                                    <button 
                                        className="close-button"
                                        onClick={() => setShowForgotPassword(false)}
                                    >
                                        ×
                                    </button>
                                </div>
                                <p className="modal-description">
                                    Enter your email address and we'll send you a link to reset your password.
                                </p>
                                
                                <form onSubmit={handleForgotPassword}>
                                    <div className="form-group">
                                        <label htmlFor="resetEmail">Email Address</label>
                                        <input
                                            id="resetEmail"
                                            type="email"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                            className="form-input"
                                            placeholder="Enter your email"
                                            required
                                        />
                                        {formErrors.resetEmail && (
                                            <div className="error-message">{formErrors.resetEmail}</div>
                                        )}
                                    </div>
                                    
                                    <div className="modal-actions">
                                        <button
                                            type="submit"
                                            className="primary-button"
                                        >
                                            Send Reset Link
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowForgotPassword(false)}
                                            className="secondary-button"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                        
                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="login-form">
                            {/* General Error Message */}
                            {(formErrors.general || error) && (
                                <div className="error-message general-error">
                                    <span className="error-icon">⚠</span>
                                    {formErrors.general || error}
                                </div>
                            )}
                            
                            {/* Email Field */}
                            <div className="form-group">
                                <label htmlFor="email">Email</label>
                                <div className="input-wrapper">
                                    <FaEnvelope className="input-icon" />
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        className="form-input"
                                        placeholder="Enter your email"
                                        required
                                    />
                                </div>
                                {formErrors.email && (
                                    <div className="error-message">{formErrors.email}</div>
                                )}
                            </div>
                            
                            {/* Password Field */}
                            <div className="form-group">
                                <label htmlFor="password">Password</label>
                                <div className="input-wrapper">
                                    <FaLock className="input-icon" />
                                    <input
                                        id="password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        className="form-input"
                                        placeholder="Enter your password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="password-toggle"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                                    </button>
                                </div>
                                {formErrors.password && (
                                    <div className="error-message">{formErrors.password}</div>
                                )}
                            </div>
                            
                            {/* Remember Me & Forgot Password */}
                            <div className="form-options">
                                <label className="checkbox-container">
                                    <input
                                        type="checkbox"
                                        name="remember"
                                        checked={formData.remember}
                                        onChange={handleInputChange}
                                    />
                                    <span className="checkmark"></span>
                                    Remember me
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowForgotPassword(true)}
                                    className="forgot-password-link"
                                >
                                    Forgot password?
                                </button>
                            </div>
                            
                            {/* Login Button */}
                            <button
                                type="submit"
                                disabled={isProcessing || loading}
                                className="login-button"
                            >
                                {isProcessing || loading ? (
                                    <>
                                        <FaSpinner className="spinner" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                        </form>
                        
                        {/* Divider */}
                        <div className="divider">
                            <span>or</span>
                        </div>
                        
                        {/* Social Login Buttons */}
                        <div className="social-login">
                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={isProcessing || loading}
                                className="social-button google"
                            >
                                <FaGoogle className="social-icon" />
                                Continue with Google
                            </button>
                            
                            <button
                                type="button"
                                onClick={handleFacebookLogin}
                                disabled={isProcessing || loading}
                                className="social-button facebook"
                            >
                                <FaFacebook className="social-icon" />
                                Continue with Facebook
                            </button>
                        </div>
                        
                        {/* Signup Link */}
                        <div className="signup-section">
                            <p>Don't have an account?</p>
                            <Link to="/signup" className="signup-link">Sign up</Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 