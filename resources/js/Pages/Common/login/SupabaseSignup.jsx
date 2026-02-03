import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGoogle, FaApple, FaGithub, FaEye, FaEyeSlash, FaSpinner, FaUserPlus } from 'react-icons/fa';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import './login.css';

export default function SupabaseSignup() {
    const navigate = useNavigate();
    const { signUp, signInWithOAuth, user, loading: authLoading, error: authError } = useSupabaseAuth();

    const [data, setData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        agreeToTerms: false,
    });

    const [errors, setErrors] = useState({});
    const [processing, setProcessing] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Redirect if already logged in
    useEffect(() => {
        if (user && !authLoading) {
            navigate('/my-trips');
        }
    }, [user, authLoading, navigate]);

    // Handle Google Sign-Up
    const handleGoogleSignUp = async () => {
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
                setErrors({ signup: error.message || 'Failed to sign up with Google. Please try again.' });
                setProcessing(false);
            }
            // OAuth redirect will happen automatically
        } catch (error) {
            console.error('Google signup error:', error);
            setProcessing(false);
            setErrors({
                signup: error.message || 'Failed to sign up with Google. Please try again.'
            });
        }
    };

    // Handle Apple Sign-Up
    const handleAppleSignUp = async () => {
        try {
            setProcessing(true);
            setErrors({});

            sessionStorage.setItem('auth_redirect', '/my-trips');

            const { error } = await signInWithOAuth('apple', {
                queryParams: {
                    response_mode: 'form_post'
                }
            });

            if (error) {
                setErrors({ signup: error.message || 'Failed to sign up with Apple. Please try again.' });
                setProcessing(false);
            }
        } catch (error) {
            console.error('Apple signup error:', error);
            setProcessing(false);
            setErrors({
                signup: error.message || 'Failed to sign up with Apple. Please try again.'
            });
        }
    };

    // Handle GitHub Sign-Up
    const handleGitHubSignUp = async () => {
        try {
            setProcessing(true);
            setErrors({});

            sessionStorage.setItem('auth_redirect', '/my-trips');

            const { error } = await signInWithOAuth('github');

            if (error) {
                setErrors({ signup: error.message || 'Failed to sign up with GitHub. Please try again.' });
                setProcessing(false);
            }
        } catch (error) {
            console.error('GitHub signup error:', error);
            setProcessing(false);
            setErrors({
                signup: error.message || 'Failed to sign up with GitHub. Please try again.'
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

        if (!data.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }

        if (!data.lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }

        if (!data.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(data.email)) {
            newErrors.email = 'Email is invalid';
        }

        if (!data.password) {
            newErrors.password = 'Password is required';
        } else if (data.password.length < 8) {
            newErrors.password = 'Password must be at least 8 characters';
        }

        if (data.password !== data.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }

        if (!data.agreeToTerms) {
            newErrors.agreeToTerms = 'You must agree to the terms and conditions';
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
        setSuccessMessage('');

        try {
            const { data: authData, error } = await signUp(
                data.email,
                data.password,
                {
                    first_name: data.firstName,
                    last_name: data.lastName,
                    full_name: `${data.firstName} ${data.lastName}`
                }
            );

            if (error) {
                setErrors({ signup: error.message || 'Failed to create account. Please try again.' });
                setProcessing(false);
                return;
            }

            console.log('Signup successful:', authData);

            // Show success message
            setSuccessMessage('Account created successfully! Please check your email to verify your account.');

            // Optionally redirect after a delay
            setTimeout(() => {
                navigate('/supabase-login');
            }, 3000);

        } catch (error) {
            setProcessing(false);
            console.error('Signup error:', error);
            setErrors({ signup: 'An error occurred. Please try again later.' });
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

                {/* Signup Form Section */}
                <div className="login-content">
                    <h2 className="login-title">
                        <FaUserPlus className="inline mr-2" />
                        Sign Up with Supabase
                    </h2>

                    {authError && (
                        <div className="error-message mb-4">
                            {authError}
                        </div>
                    )}

                    {successMessage && (
                        <div className="success-message mb-4">
                            {successMessage}
                        </div>
                    )}

                    <form className="login-form" onSubmit={submit}>
                        <div className="form-group">
                            <label htmlFor="firstName">First Name</label>
                            <input
                                value={data.firstName}
                                type="text"
                                name="firstName"
                                onChange={handleChange}
                                id="firstName"
                                placeholder="First Name"
                                className={`form-input ${errors.firstName ? 'error' : ''}`}
                                disabled={processing || authLoading}
                            />
                            {errors.firstName && <div className="error-message">{errors.firstName}</div>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="lastName">Last Name</label>
                            <input
                                value={data.lastName}
                                type="text"
                                name="lastName"
                                onChange={handleChange}
                                id="lastName"
                                placeholder="Last Name"
                                className={`form-input ${errors.lastName ? 'error' : ''}`}
                                disabled={processing || authLoading}
                            />
                            {errors.lastName && <div className="error-message">{errors.lastName}</div>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="email">Email</label>
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
                            <label htmlFor="password">Password</label>
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

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    name="confirmPassword"
                                    value={data.confirmPassword}
                                    onChange={handleChange}
                                    id="confirmPassword"
                                    placeholder="Confirm Password"
                                    className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                                    disabled={processing || authLoading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    disabled={processing || authLoading}
                                >
                                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>
                            {errors.confirmPassword && <div className="error-message">{errors.confirmPassword}</div>}
                        </div>

                        <div className="form-options">
                            <label className="remember-me">
                                <input
                                    type="checkbox"
                                    name="agreeToTerms"
                                    checked={data.agreeToTerms}
                                    onChange={handleChange}
                                    disabled={processing || authLoading}
                                />
                                I agree to the <Link to="/terms" className="text-link">Terms of Service</Link> and <Link to="/privacy" className="text-link">Privacy Policy</Link>
                            </label>
                        </div>
                        {errors.agreeToTerms && <div className="error-message">{errors.agreeToTerms}</div>}

                        <button
                            className="login-button"
                            disabled={processing || authLoading}
                        >
                            {processing || authLoading ? (
                                <>
                                    <FaSpinner className="animate-spin inline mr-2" />
                                    Creating Account...
                                </>
                            ) : (
                                'Create Account'
                            )}
                        </button>

                        {errors.signup && <div className="error-message">{errors.signup}</div>}

                        <div className="login-divider">or continue with</div>

                        <div className="social-login">
                            <button
                                type="button"
                                className="social-button google"
                                onClick={handleGoogleSignUp}
                                disabled={processing || authLoading}
                                title="Sign up with Google"
                            >
                                <FaGoogle size={22} color="#DB4437" />
                                <span>Google</span>
                            </button>
                            <button
                                type="button"
                                className="social-button apple"
                                onClick={handleAppleSignUp}
                                disabled={processing || authLoading}
                                title="Sign up with Apple"
                            >
                                <FaApple size={22} color="#000000" />
                                <span>Apple</span>
                            </button>
                            <button
                                type="button"
                                className="social-button github"
                                onClick={handleGitHubSignUp}
                                disabled={processing || authLoading}
                                title="Sign up with GitHub"
                            >
                                <FaGithub size={22} color="#333333" />
                                <span>GitHub</span>
                            </button>
                        </div>

                        <div className="signup-link">
                            Already have an account? <Link to="/supabase-login" className="text-link">Login</Link>
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
