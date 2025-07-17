import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGoogle, FaFacebook, FaEye, FaEyeSlash, FaSpinner } from 'react-icons/fa';
import { useFirebaseAuth } from '../../../contexts/FirebaseAuthContext';
import './login.css';
import './firebase-login.css';

export default function FirebaseSignup() {
    const navigate = useNavigate();
    const { 
        signUp, 
        signInWithGoogle, 
        signInWithFacebook, 
        loading, 
        error, 
        clearError,
        isAuthenticated 
    } = useFirebaseAuth();

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        acceptTerms: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);

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

        // First name validation
        if (!formData.firstName.trim()) {
            errors.firstName = 'First name is required';
        } else if (formData.firstName.trim().length < 2) {
            errors.firstName = 'First name must be at least 2 characters';
        }

        // Last name validation
        if (!formData.lastName.trim()) {
            errors.lastName = 'Last name is required';
        } else if (formData.lastName.trim().length < 2) {
            errors.lastName = 'Last name must be at least 2 characters';
        }

        // Email validation
        if (!formData.email) {
            errors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            errors.email = 'Email is invalid';
        }

        // Password validation
        if (!formData.password) {
            errors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            errors.password = 'Password must be at least 6 characters';
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
            errors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
        }

        // Confirm password validation
        if (!formData.confirmPassword) {
            errors.confirmPassword = 'Please confirm your password';
        } else if (formData.password !== formData.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match';
        }

        // Terms acceptance validation
        if (!formData.acceptTerms) {
            errors.acceptTerms = 'You must accept the Terms of Service and Privacy Policy';
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

    // Handle signup submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) return;

        setIsProcessing(true);
        
        try {
            const result = await signUp(
                formData.email, 
                formData.password, 
                formData.firstName.trim(), 
                formData.lastName.trim()
            );
            
            if (result.success) {
                console.log('Signup successful:', result.user);
                navigate('/my-trips');
            } else {
                setFormErrors({ general: result.error });
            }
        } catch (error) {
            console.error('Signup error:', error);
            setFormErrors({ general: 'An unexpected error occurred. Please try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle Google signup
    const handleGoogleSignup = async () => {
        setIsProcessing(true);
        
        try {
            const result = await signInWithGoogle();
            
            if (result.success) {
                console.log('Google signup successful:', result.user);
                navigate('/my-trips');
            } else {
                setFormErrors({ general: result.error });
            }
        } catch (error) {
            console.error('Google signup error:', error);
            setFormErrors({ general: 'Google signup failed. Please try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle Facebook signup
    const handleFacebookSignup = async () => {
        setIsProcessing(true);
        
        try {
            const result = await signInWithFacebook();
            
            if (result.success) {
                console.log('Facebook signup successful:', result.user);
                navigate('/my-trips');
            } else {
                setFormErrors({ general: result.error });
            }
        } catch (error) {
            console.error('Facebook signup error:', error);
            setFormErrors({ general: 'Facebook signup failed. Please try again.' });
        } finally {
            setIsProcessing(false);
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
                
                {/* Signup Content */}
                <div className="login-content">
                    <h1 className="login-title">Sign Up</h1>
                    
                    {/* Signup Form */}
                    <form onSubmit={handleSubmit} className="login-form">
                        {/* General Error Message */}
                        {(formErrors.general || error) && (
                            <div className="error-message mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
                                {formErrors.general || error}
                            </div>
                        )}
                        
                        {/* Name Fields */}
                        <div className="flex gap-2">
                            <div className="form-group flex-1">
                                <label htmlFor="firstName">First Name</label>
                                <input
                                    id="firstName"
                                    name="firstName"
                                    type="text"
                                    value={formData.firstName}
                                    onChange={handleInputChange}
                                    className="form-input"
                                    placeholder="Enter first name"
                                    required
                                />
                                {formErrors.firstName && (
                                    <div className="error-message">{formErrors.firstName}</div>
                                )}
                            </div>
                            
                            <div className="form-group flex-1">
                                <label htmlFor="lastName">Last Name</label>
                                <input
                                    id="lastName"
                                    name="lastName"
                                    type="text"
                                    value={formData.lastName}
                                    onChange={handleInputChange}
                                    className="form-input"
                                    placeholder="Enter last name"
                                    required
                                />
                                {formErrors.lastName && (
                                    <div className="error-message">{formErrors.lastName}</div>
                                )}
                            </div>
                        </div>
                        
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
                                    placeholder="Create a password"
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
                        
                        {/* Confirm Password Field */}
                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <div className="relative">
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={formData.confirmPassword}
                                    onChange={handleInputChange}
                                    className="form-input pr-10"
                                    placeholder="Confirm your password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>
                            {formErrors.confirmPassword && (
                                <div className="error-message">{formErrors.confirmPassword}</div>
                            )}
                        </div>
                        
                        {/* Terms and Conditions */}
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    name="acceptTerms"
                                    checked={formData.acceptTerms}
                                    onChange={handleInputChange}
                                    required
                                />
                                <span className="checkmark"></span>
                                <span className="text-sm">
                                    I agree to the <Link to="/terms" className="text-blue-600 hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
                                </span>
                            </label>
                            {formErrors.acceptTerms && (
                                <div className="error-message">{formErrors.acceptTerms}</div>
                            )}
                        </div>
                        
                        {/* Signup Button */}
                        <button
                            type="submit"
                            disabled={isProcessing || loading}
                            className="login-button"
                        >
                            {isProcessing || loading ? (
                                <>
                                    <FaSpinner className="animate-spin mr-2" />
                                    Creating Account...
                                </>
                            ) : (
                                'Create Account'
                            )}
                        </button>
                    </form>
                    
                    {/* Divider */}
                    <div className="divider">
                        <span>OR</span>
                    </div>
                    
                    {/* Social Signup Buttons */}
                    <div className="social-login">
                        <button
                            type="button"
                            onClick={handleGoogleSignup}
                            disabled={isProcessing || loading}
                            className="social-button google-button"
                        >
                            <FaGoogle className="mr-2" />
                            Sign up with Google
                        </button>
                        
                        <button
                            type="button"
                            onClick={handleFacebookSignup}
                            disabled={isProcessing || loading}
                            className="social-button facebook-button"
                        >
                            <FaFacebook className="mr-2" />
                            Sign up with Facebook
                        </button>
                    </div>
                    
                    {/* Login Link */}
                    <div className="signup-link">
                        Already have an account? <Link to="/login">Sign in</Link>
                    </div>
                </div>
            </div>
        </div>
    );
} 