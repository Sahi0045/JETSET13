import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGoogle, FaEye, FaEyeSlash, FaSpinner, FaLock, FaEnvelope } from 'react-icons/fa';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import './login.css';

export default function SupabaseLogin() {
    const navigate = useNavigate();
    const { signIn, signInWithOAuth, user, loading: authLoading, error: authError } = useSupabaseAuth();

    const [data, setData] = useState({
        email: '',
        password: '',
        rememberMe: false,
    });

    const [errors, setErrors] = useState({});
    const [processing, setProcessing] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Redirect if already logged in
    useEffect(() => {
        if (user && !authLoading) {
            navigate('/my-trips');
        }
    }, [user, authLoading, navigate]);

    // Handle Google Sign-In
    const handleGoogleSignIn = async () => {
        try {
            setProcessing(true);
            setErrors({});
            
            // Store intended destination for after auth
            sessionStorage.setItem('auth_redirect', '/my-trips');
            
            const { error } = await signInWithOAuth('google', {
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                }
            });

            if (error) {
                setErrors({ login: error.message || 'Failed to sign in with Google. Please try again.' });
                setProcessing(false);
            }
            // OAuth redirect will happen automatically
        } catch (error) {
            console.error('Google login error:', error);
            setProcessing(false);
            setErrors({ 
                login: error.message || 'Failed to sign in with Google. Please try again.' 
            });
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setData({
            ...data,
            [name]: type === 'checkbox' ? checked : value
        });
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors({ ...errors, [name]: '' });
        }
    };

    const validateForm = () => {
        const newErrors = {};
        
        if (!data.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(data.email)) {
            newErrors.email = 'Email is invalid';
        }
        
        if (!data.password) {
            newErrors.password = 'Password is required';
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const submit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            return;
        }
        
        setProcessing(true);
        setErrors({});
        
        try {
            const { data: authData, error } = await signIn(data.email, data.password);

            if (error) {
                setErrors({ login: error.message || 'Invalid email or password. Please try again.' });
                setProcessing(false);
                return;
            }

            console.log('Login successful:', authData);
            
            // Wait a moment for auth state to update, then navigate
            setTimeout(() => {
                navigate('/my-trips', { replace: true });
            }, 500);
        } catch (error) {
            setProcessing(false);
            console.error('Login error:', error);
            setErrors({ login: 'An error occurred. Please try again later.' });
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                {/* Image Section */}
                <div
                    className="login-image"
                    style={{
                        backgroundImage: `url('/images/Rectangle 1434 (1).png')`,
                    }}
                ></div>

                {/* Login Form Section */}
                <div className="login-content">
                    <h2 className="login-title">
                        <FaLock className="inline mr-2" />
                        Login with Supabase
                    </h2>
                    
                    {authError && (
                        <div className="error-message mb-4">
                            {authError}
                        </div>
                    )}

                    <form className="login-form" onSubmit={submit}>
                        <div className="form-group">
                            <label htmlFor="email">
                                <FaEnvelope className="inline mr-2" />
                                Email
                            </label>
                            <input
                                value={data.email}
                                type="email"
                                name="email"
                                onChange={handleChange}
                                id="email"
                                placeholder="username@gmail.com"
                                className={`form-input ${errors.email ? 'error' : ''}`}
                                disabled={processing || authLoading}
                            />
                            {errors.email && <div className="error-message">{errors.email}</div>}
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="password">
                                <FaLock className="inline mr-2" />
                                Password
                            </label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    value={data.password}
                                    onChange={handleChange}
                                    id="password"
                                    placeholder="Password"
                                    className={`form-input ${errors.password ? 'error' : ''}`}
                                    disabled={processing || authLoading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    disabled={processing || authLoading}
                                >
                                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>
                            {errors.password && <div className="error-message">{errors.password}</div>}
                        </div>
                        
                        <div className="form-options">
                            <label className="remember-me">
                                <input 
                                    type="checkbox" 
                                    name="rememberMe"
                                    checked={data.rememberMe}
                                    onChange={handleChange}
                                    disabled={processing || authLoading}
                                />
                                Remember me
                            </label>
                            <Link to="/forgot-password" className="forgot-password">
                                Forgot Password?
                            </Link>
                        </div>
                        
                        <button 
                            className="login-button" 
                            disabled={processing || authLoading}
                        >
                            {processing || authLoading ? (
                                <>
                                    <FaSpinner className="animate-spin inline mr-2" />
                                    Logging in...
                                </>
                            ) : (
                                'Login'
                            )}
                        </button>
                        
                        {errors.login && <div className="error-message">{errors.login}</div>}
                        
                        <div className="login-divider">or continue with</div>
                        
                        <div className="social-login">
                            <button 
                                type="button" 
                                className="social-button google" 
                                onClick={handleGoogleSignIn}
                                disabled={processing || authLoading}
                                title="Sign in with Google"
                            >
                                <FaGoogle size={24} color="#DB4437" />
                                <span>Google</span>
                            </button>
                        </div>
                        
                        <div className="signup-link">
                            Don't have an account? <Link to="/supabase-signup" className="text-link">Sign Up</Link>
                        </div>
                    </form>
                    
                    <p className="login-footer">
                        By proceeding, you agree to our <Link to="/privacy" className="text-link">Privacy Policy</Link> and <Link to="/terms" className="text-link">Terms of Service</Link>.
                    </p>
                </div>
            </div>
        </div>
    );
}
