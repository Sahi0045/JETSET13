import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGoogle, FaFacebook, FaPhone, FaEye, FaEyeSlash, FaSpinner } from 'react-icons/fa';
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
                navigate('/my-trips');
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
                navigate('/my-trips');
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
                navigate('/my-trips');
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
            <div className="login-card">
                {/* Header Image */}
                <div 
                    className="login-image"
                    style={{
                        backgroundImage: "url('/images/login/cruise-background.png')"
                    }}
                />
                
                {/* Login Content */}
                <div className="login-content">
                    <h1 className="login-title">Login</h1>
                    
                    {/* Success Message */}
                    {resetMessage && (
                        <div className="success-message mb-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded">
                            {resetMessage}
                        </div>
                    )}
                    
                    {/* Forgot Password Modal */}
                    {showForgotPassword && (
                        <div className="forgot-password-modal mb-4 p-4 bg-gray-50 border border-gray-200 rounded">
                            <h3 className="text-lg font-semibold mb-2">Reset Password</h3>
                            <form onSubmit={handleForgotPassword}>
                                <div className="form-group">
                                    <input
                                        type="email"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        placeholder="Enter your email address"
                                        className="form-input"
                                        required
                                    />
                                    {formErrors.resetEmail && (
                                        <div className="error-message">{formErrors.resetEmail}</div>
                                    )}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        type="submit"
                                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
                                        disabled={loading}
                                    >
                                        Send Reset Email
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowForgotPassword(false)}
                                        className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400 transition-colors"
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
                            <div className="error-message mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
                                {formErrors.general || error}
                            </div>
                        )}
                        
                        {/* Email Field */}
                        <div className="form-group">
                            <label htmlFor="email">Email</label>
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
                            {formErrors.email && (
                                <div className="error-message">{formErrors.email}</div>
                            )}
                        </div>
                        
                        {/* Password Field */}
                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <div className="relative">
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    className="form-input pr-10"
                                    placeholder="Enter your password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
                            <label className="checkbox-label">
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
                                    <FaSpinner className="animate-spin mr-2" />
                                    Signing in...
                                </>
                            ) : (
                                'Login'
                            )}
                        </button>
                    </form>
                    
                    {/* Divider */}
                    <div className="divider">
                        <span>OR</span>
                    </div>
                    
                    {/* Social Login Buttons */}
                    <div className="social-login">
                        <button
                            type="button"
                            onClick={handleGoogleLogin}
                            disabled={isProcessing || loading}
                            className="social-button google-button"
                        >
                            <FaGoogle className="mr-2" />
                            Continue with Google
                        </button>
                        
                        <button
                            type="button"
                            onClick={handleFacebookLogin}
                            disabled={isProcessing || loading}
                            className="social-button facebook-button"
                        >
                            <FaFacebook className="mr-2" />
                            Continue with Facebook
                        </button>
                        
                        <Link 
                            to="/phone-login" 
                            className="social-button phone-button"
                        >
                            <FaPhone className="mr-2" />
                            Continue with Phone
                        </Link>
                    </div>
                    
                    {/* Signup Link */}
                    <div className="signup-link">
                        Don't have an account? <Link to="/signup">Sign up now</Link>
                    </div>
                </div>
            </div>
        </div>
    );
} 