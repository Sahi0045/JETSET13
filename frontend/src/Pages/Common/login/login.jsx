import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './login.css';
import { authAPI } from '../../../api'; // Import the authAPI for making API calls
import supabase from '../../../lib/supabase'; // Import Supabase client
import { FaGoogle } from 'react-icons/fa';

export default function Login() {
    const navigate = useNavigate();

    const [data, setData] = useState({
        email: '',
        password: '',
        remember: false,
    });

    const [errors, setErrors] = useState({});
    const [processing, setProcessing] = useState(false);

    // Check for existing Supabase session on mount
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // User is already logged in, store their info and redirect
                localStorage.setItem('isAuthenticated', 'true');
                localStorage.setItem('user', JSON.stringify({
                    id: session.user.id,
                    email: session.user.email,
                    firstName: session.user.user_metadata?.full_name?.split(' ')[0] || '',
                    lastName: session.user.user_metadata?.full_name?.split(' ')[1] || ''
                }));
                navigate('/my-trips');
            }
        };
        
        checkSession();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                localStorage.setItem('isAuthenticated', 'true');
                localStorage.setItem('user', JSON.stringify({
                    id: session.user.id,
                    email: session.user.email,
                    firstName: session.user.user_metadata?.full_name?.split(' ')[0] || '',
                    lastName: session.user.user_metadata?.full_name?.split(' ')[1] || ''
                }));
                navigate('/my-trips');
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate]);

    // Handle Google Sign-In with Supabase
    const handleGoogleSignIn = async () => {
        try {
            setProcessing(true);
            setErrors({});
            
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/login`,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                },
            });

            if (error) throw error;
            
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
    };

    const submit = async (e) => {
        e.preventDefault();
        setProcessing(true);
        setErrors({}); // Clear previous errors
        
        try {
            // Make the login API call using the authAPI
            const response = await authAPI.login({ email: data.email, password: data.password });

            // If login is successful, store the token in localStorage
            localStorage.setItem('token', response.data.token);
            
            // Set authentication status to true in localStorage
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('user', JSON.stringify({
                id: response.data.id,
                email: response.data.email,
                firstName: response.data.firstName,
                lastName: response.data.lastName
            }));

            setProcessing(false);

            // Redirect to My Trips page on successful login
            navigate('/my-trips');
        } catch (error) {
            setProcessing(false);
            
            // Handle error if login failed
            if (error.response && error.response.status === 401) {
                setErrors({ login: 'Invalid credentials. Please try again.' });
            } else {
                setErrors({ login: 'An error occurred. Please try again later.' });
            }
        }
    };

    return (
        <div>
            <div className="login-container">
                <div className="login-wrapper">
                    {/* Image Section */}
                    <div
                        className="login-image-section"
                        style={{
                            backgroundImage: `url('/images/Rectangle 1434 (1).png')`,
                        }}
                    >
                        <div className="image-overlay">
                            <h2 className="image-title">Welcome Back</h2>
                            <p className="image-subtitle">Sign in to access your trips and bookings</p>
                        </div>
                    </div>

                    {/* Login Form Section */}
                    <div className="login-form-section">
                      <div className="login-form-container">
                        <h2 className="login-title">Login</h2>
                        {errors.login && (
                            <div className="error-message mb-4 p-3 bg-red-50 text-red-700 rounded">
                                {errors.login}
                            </div>
                        )}
                        <form className="login-form" onSubmit={submit}>
                            <div className="form-group">
                                <label htmlFor="email">Email</label>
                                <input
                                    value={data.email}
                                    type="email"
                                    name="email"
                                    onChange={handleChange}
                                    id="email"
                                    placeholder="username@gmail.com"
                                    className="form-input"
                                />
                                {errors.email && <div className="error-message">{errors.email}</div>}
                            </div>
                            <div className="form-group">
                                <label htmlFor="password">Password</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={data.password}
                                    onChange={handleChange}
                                    id="password"
                                    placeholder="Password"
                                    className="form-input"
                                />
                                {errors.password && <div className="error-message">{errors.password}</div>}
                            </div>
                            <div className="form-options">
                                <label className="remember-me">
                                    <input 
                                        type="checkbox" 
                                        name="remember"
                                        checked={data.remember}
                                        onChange={handleChange}
                                    />
                                    Remember Me
                                </label>
                                <Link
                                    to="/forgot-password"
                                    className="forgot-password"
                                >
                                    Forgot your password?
                                </Link>
                            </div>
                            <button 
                                className="login-button" 
                                disabled={processing}
                            >
                                {processing ? 'Signing in...' : 'Sign In'}
                            </button>
                            
                            <div className="login-divider">or continue with</div>
                            <div className="social-login">
                                <button 
                                    type="button" 
                                    className="social-button" 
                                    onClick={handleGoogleSignIn}
                                    disabled={processing}
                                    title="Sign in with Google"
                                >
                                    <FaGoogle size={24} color="#DB4437" />
                                </button>
                            </div>
                            <div className="signup-link">
                                Don't have an account? <Link to="/signup" className="text-link">Sign Up</Link>
                            </div>
                        </form>
                        <p className="login-footer">
                            By proceeding, you agree to our <Link to="/privacy" className="text-link">Privacy Policy</Link> and <Link to="/terms" className="text-link">Terms of Service</Link>.
                        </p>
                      </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
