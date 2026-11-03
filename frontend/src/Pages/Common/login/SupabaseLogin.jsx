import React, { useState, useEffect, useRef} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaGoogle, FaApple, FaEye, FaEyeSlash, FaSpinner } from 'react-icons/fa';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import supabase from '../../../lib/supabase';
import { postAuthDestination } from '../../../utils/postAuthRedirect';
import AuthShell from './AuthShell';
import { renderGoogleButton, exchangeGoogleCredential } from '../../../utils/googleIdentity';

export default function SupabaseLogin() {
    const navigate = useNavigate();
    const location = useLocation();
    // Where the visitor was actually heading. Home is the fallback, not My
    // Trips: signing in is not a request to see your bookings, and two callers
    // (ProtectedRoute, Membership) already pass a destination that was ignored.
    const destination = postAuthDestination(location.state);
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
            navigate(destination, { replace: true });
        }
    }, [user, authLoading, navigate, destination]);

    // Google's own rendered button.
    //
    // signInWithOAuth redirects to <project>.supabase.co, so Google names THAT
    // host on the consent screen ("to continue to qqmagqwumjipdqvxbiqu...").
    // An ID token obtained in-page and exchanged via signInWithIdToken skips
    // the redirect entirely, so there is no third-party domain to display.
    //
    // It must be Google's own button rather than ours: One Tap is suppressed
    // wherever third-party cookies are restricted, but a real click on their
    // element still works. When their script cannot load at all - Brave blocks
    // it outright - we fall back to our button and the redirect below.
    const googleButtonRef = useRef(null);
    const [googleButtonReady, setGoogleButtonReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        // Google renders at a fixed pixel width, so it has to be told the size
        // of its grid cell or it overflows the row. The container itself is
        // hidden until the button exists (and so measures 0), so measure the
        // row instead: two equal columns with a 0.75rem gap.
        const row = googleButtonRef.current?.parentElement;
        const cellWidth = row ? Math.max(180, Math.floor((row.clientWidth - 12) / 2)) : 240;

        renderGoogleButton(googleButtonRef.current, async ({ credential, nonce }) => {
            const { error } = await exchangeGoogleCredential(supabase, { credential, nonce });
            if (error) setErrors({ login: error.message || 'Google sign-in failed. Please try again.' });
        }, { width: cellWidth }).then((ok) => { if (!cancelled) setGoogleButtonReady(ok); });

        return () => { cancelled = true; };
    }, []);

    // Handle Google Sign-In
    const handleGoogleSignIn = async () => {
        try {
            setProcessing(true);
            setErrors({});

            // Store intended destination for after auth
            sessionStorage.setItem('auth_redirect', destination);

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

            sessionStorage.setItem('auth_redirect', destination);

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
                        navigate(destination, { replace: true });
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
        <AuthShell>
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
                    <div
                        ref={googleButtonRef}
                        className="jsl-google-gis"
                        style={{ display: googleButtonReady ? 'flex' : 'none' }}
                    />
                    {!googleButtonReady && (
                        <button
                            type="button"
                            className="jsl-social-btn"
                            onClick={handleGoogleSignIn}
                            disabled={isBusy}
                        >
                            <FaGoogle color="#DB4437" />
                            <span>Google</span>
                        </button>
                    )}
                    <button
                        type="button"
                        className="jsl-social-btn"
                        onClick={handleAppleSignIn}
                        disabled={isBusy}
                    >
                        <FaApple color="#000000" size={18} />
                        <span>Sign in with Apple</span>
                    </button>
                </div>

                <p className="jsl-signup">
                    Don&apos;t have an account?{' '}
                    {/* The destination rides along, so someone sent here
                        to book a flight gets back to it after signing up. */}
                    <Link to="/supabase-signup" state={location.state} className="jsl-link strong">Create one</Link>
                </p>
            </form>

            <p className="jsl-legal">
                By continuing, you agree to our{' '}
                <Link to="/privacy-policy" className="jsl-link">Privacy Policy</Link> and{' '}
                <Link to="/terms-conditions" className="jsl-link">Terms of Service</Link>.
            </p>
        </AuthShell>
    );
}
