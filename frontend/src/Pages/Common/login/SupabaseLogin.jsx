import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    FaGoogle, FaApple, FaEye, FaEyeSlash, FaSpinner,
    FaShieldAlt, FaGlobeAmericas, FaTags, FaArrowLeft
} from 'react-icons/fa';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import supabase from '../../../lib/supabase';
import './loginV2.css';

const LOGO_WEBP = '/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.webp';
const LOGO_PNG = '/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.png';

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

    // Handle Apple Sign-In
    const handleAppleSignIn = async () => {
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
                setErrors({ login: error.message || 'Failed to sign in with Apple. Please try again.' });
                setProcessing(false);
            }
        } catch (error) {
            console.error('Apple login error:', error);
            setProcessing(false);
            setErrors({
                login: error.message || 'Failed to sign in with Apple. Please try again.'
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

            // Check if user has completed profile
            if (authData.user) {
                const userMetadata = authData.user.user_metadata || {};
                const profileCompleted = userMetadata.profile_completed;

                // Check if user exists in database with complete info
                const { data: dbUser } = await supabase.from('users')
                    .select('first_name, last_name')
                    .eq('id', authData.user.id)
                    .single();

                const hasCompleteProfile = dbUser && dbUser.first_name && dbUser.last_name;

                // Wait a moment for auth state to update, then navigate
                setTimeout(() => {
                    if (profileCompleted || hasCompleteProfile) {
                        navigate('/my-trips', { replace: true });
                    } else {
                        navigate('/complete-profile', { replace: true });
                    }
                }, 500);
            }
        } catch (error) {
            setProcessing(false);
            console.error('Login error:', error);
            setErrors({ login: 'An error occurred. Please try again later.' });
        }
    };

    const isBusy = processing || authLoading;

    return (
        <div className="jsl-page">
            <div className="jsl-card">
                {/* ---------- Brand / Hero panel ---------- */}
                <aside className="jsl-hero">
                    <div className="jsl-hero-overlay" />
                    <div className="jsl-hero-content">
                        <Link to="/" className="jsl-hero-brand" aria-label="Jetsetters home">
                            <picture>
                                <source srcSet={LOGO_WEBP} type="image/webp" />
                                <img src={LOGO_PNG} alt="Jetsetters" className="jsl-hero-logo" />
                            </picture>
                        </Link>

                        <h1 className="jsl-hero-title">
                            Your next journey<br />begins here.
                        </h1>
                        <p className="jsl-hero-subtitle">
                            Flights, hotels, cruises and curated holidays — all in one place,
                            tailored to the way you travel.
                        </p>

                        <ul className="jsl-hero-features">
                            <li>
                                <span className="jsl-feature-icon"><FaGlobeAmericas /></span>
                                <span>Explore worldwide destinations with confidence</span>
                            </li>
                            <li>
                                <span className="jsl-feature-icon"><FaTags /></span>
                                <span>Member-only fares and seasonal deals</span>
                            </li>
                            <li>
                                <span className="jsl-feature-icon"><FaShieldAlt /></span>
                                <span>Secure, SSL-encrypted bookings</span>
                            </li>
                        </ul>
                    </div>
                </aside>

                {/* ---------- Form panel ---------- */}
                <main className="jsl-form-panel">
                    <div className="jsl-form-inner">
                        <Link to="/" className="jsl-back">
                            <FaArrowLeft size={12} /> Back to home
                        </Link>

                        {/* Teal brand header for mobile (full hero hidden on small screens) */}
                        <div className="jsl-mobile-hero">
                            <Link to="/" className="jsl-mobile-brand" aria-label="Jetsetters home">
                                <picture>
                                    <source srcSet={LOGO_WEBP} type="image/webp" />
                                    <img src={LOGO_PNG} alt="Jetsetters" />
                                </picture>
                            </Link>
                            <p className="jsl-mobile-tagline">Your next journey begins here.</p>
                        </div>

                        <header className="jsl-form-head">
                            <h2 className="jsl-form-title">Welcome back</h2>
                            <p className="jsl-form-sub">Sign in to manage your trips and bookings.</p>
                        </header>

                        {authError && (
                            <div className="jsl-alert" role="alert">{authError}</div>
                        )}
                        {errors.login && (
                            <div className="jsl-alert" role="alert">{errors.login}</div>
                        )}

                        <form className="jsl-form" onSubmit={submit} noValidate>
                            <div className="jsl-field">
                                <label htmlFor="email">Email address</label>
                                <input
                                    value={data.email}
                                    type="email"
                                    name="email"
                                    onChange={handleChange}
                                    id="email"
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    className={`jsl-input ${errors.email ? 'has-error' : ''}`}
                                    disabled={isBusy}
                                />
                                {errors.email && <span className="jsl-field-error">{errors.email}</span>}
                            </div>

                            <div className="jsl-field">
                                <label htmlFor="password">Password</label>
                                <div className="jsl-password">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={data.password}
                                        onChange={handleChange}
                                        id="password"
                                        autoComplete="current-password"
                                        placeholder="Enter your password"
                                        className={`jsl-input ${errors.password ? 'has-error' : ''}`}
                                        disabled={isBusy}
                                    />
                                    <button
                                        type="button"
                                        className="jsl-password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        disabled={isBusy}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                                    </button>
                                </div>
                                {errors.password && <span className="jsl-field-error">{errors.password}</span>}
                            </div>

                            <div className="jsl-options">
                                <label className="jsl-checkbox">
                                    <input
                                        type="checkbox"
                                        name="rememberMe"
                                        checked={data.rememberMe}
                                        onChange={handleChange}
                                        disabled={isBusy}
                                    />
                                    <span className="jsl-checkbox-box" aria-hidden="true" />
                                    Remember me
                                </label>
                                <Link to="/forgot-password" className="jsl-link">
                                    Forgot password?
                                </Link>
                            </div>

                            <button type="submit" className="jsl-submit" disabled={isBusy}>
                                {isBusy ? (
                                    <>
                                        <FaSpinner className="jsl-spin" />
                                        Signing in…
                                    </>
                                ) : (
                                    'Sign in'
                                )}
                            </button>

                            <div className="jsl-divider"><span>or continue with</span></div>

                            <div className="jsl-social">
                                <button
                                    type="button"
                                    className="jsl-social-btn"
                                    onClick={handleGoogleSignIn}
                                    disabled={isBusy}
                                >
                                    <FaGoogle color="#DB4437" />
                                    <span>Google</span>
                                </button>
                                <button
                                    type="button"
                                    className="jsl-social-btn"
                                    onClick={handleAppleSignIn}
                                    disabled={isBusy}
                                >
                                    <FaApple color="#000000" />
                                    <span>Apple</span>
                                </button>
                            </div>

                            <p className="jsl-signup">
                                Don&apos;t have an account?{' '}
                                <Link to="/supabase-signup" className="jsl-link strong">Create one</Link>
                            </p>
                        </form>

                        <p className="jsl-legal">
                            By continuing, you agree to our{' '}
                            <Link to="/privacy" className="jsl-link">Privacy Policy</Link> and{' '}
                            <Link to="/terms" className="jsl-link">Terms of Service</Link>.
                        </p>
                    </div>
                </main>
            </div>
        </div>
    );
}
