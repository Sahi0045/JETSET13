import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { postAuthDestination } from '../../../utils/postAuthRedirect';
import { FaGoogle, FaApple, FaEye, FaEyeSlash, FaSpinner } from 'react-icons/fa';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import AuthShell from './AuthShell';

export default function SupabaseSignup() {
    const navigate = useNavigate();
    const location = useLocation();
    // Same rule as sign-in: go where they were heading, else home.
    const destination = postAuthDestination(location.state);
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
            navigate(destination, { replace: true });
        }
    }, [user, authLoading, navigate]);

    // Handle Google Sign-Up
    const handleGoogleSignUp = async () => {
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

            sessionStorage.setItem('auth_redirect', destination);

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
                // Keep the destination: someone sent here to book a flight
                // goes back to it once they sign in.
                navigate('/supabase-login', { state: location.state });
            }, 3000);

        } catch (error) {
            setProcessing(false);
            console.error('Signup error:', error);
            setErrors({ signup: 'An error occurred. Please try again later.' });
        }
    };

    const isBusy = processing || authLoading;

    return (
        <AuthShell>
            <header className="jsl-form-head">
                <h2 className="jsl-form-title">Create your account</h2>
                <p className="jsl-form-sub">Book faster and keep every trip in one place.</p>
            </header>

            {authError && (
                <div className="jsl-alert" role="alert">{authError}</div>
            )}
            {errors.signup && (
                <div className="jsl-alert" role="alert">{errors.signup}</div>
            )}
            {successMessage && (
                <div className="jsl-alert is-success" role="status">{successMessage}</div>
            )}

            <form className="jsl-form" onSubmit={submit} noValidate>
                <div className="jsl-row">
                    <div className="jsl-field">
                        <label htmlFor="firstName">First name</label>
                        <input
                            value={data.firstName}
                            type="text"
                            name="firstName"
                            onChange={handleChange}
                            id="firstName"
                            autoComplete="given-name"
                            placeholder="First name"
                            className={`jsl-input ${errors.firstName ? 'has-error' : ''}`}
                            disabled={isBusy}
                        />
                        {errors.firstName && <span className="jsl-field-error">{errors.firstName}</span>}
                    </div>

                    <div className="jsl-field">
                        <label htmlFor="lastName">Last name</label>
                        <input
                            value={data.lastName}
                            type="text"
                            name="lastName"
                            onChange={handleChange}
                            id="lastName"
                            autoComplete="family-name"
                            placeholder="Last name"
                            className={`jsl-input ${errors.lastName ? 'has-error' : ''}`}
                            disabled={isBusy}
                        />
                        {errors.lastName && <span className="jsl-field-error">{errors.lastName}</span>}
                    </div>
                </div>

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
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
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

                <div className="jsl-field">
                    <label htmlFor="confirmPassword">Confirm password</label>
                    <div className="jsl-password">
                        <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            name="confirmPassword"
                            value={data.confirmPassword}
                            onChange={handleChange}
                            id="confirmPassword"
                            autoComplete="new-password"
                            placeholder="Type it again"
                            className={`jsl-input ${errors.confirmPassword ? 'has-error' : ''}`}
                            disabled={isBusy}
                        />
                        <button
                            type="button"
                            className="jsl-password-toggle"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            disabled={isBusy}
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                            {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                    {errors.confirmPassword && <span className="jsl-field-error">{errors.confirmPassword}</span>}
                </div>

                <div className="jsl-field">
                    <label className="jsl-checkbox">
                        <input
                            type="checkbox"
                            name="agreeToTerms"
                            checked={data.agreeToTerms}
                            onChange={handleChange}
                            disabled={isBusy}
                        />
                        <span className="jsl-checkbox-box" aria-hidden="true" />
                        <span>
                            I agree to the <Link to="/terms-conditions" className="jsl-link">Terms of Service</Link> and{' '}
                            <Link to="/privacy-policy" className="jsl-link">Privacy Policy</Link>
                        </span>
                    </label>
                    {errors.agreeToTerms && <span className="jsl-field-error">{errors.agreeToTerms}</span>}
                </div>

                <button type="submit" className="jsl-submit" disabled={isBusy}>
                    {isBusy ? (
                        <>
                            <FaSpinner className="jsl-spin" />
                            Creating account…
                        </>
                    ) : (
                        'Create account'
                    )}
                </button>

                <div className="jsl-divider"><span>or continue with</span></div>

                <div className="jsl-social">
                    <button
                        type="button"
                        className="jsl-social-btn"
                        onClick={handleGoogleSignUp}
                        disabled={isBusy}
                    >
                        <FaGoogle color="#DB4437" />
                        <span>Sign up with Google</span>
                    </button>
                    <button
                        type="button"
                        className="jsl-social-btn"
                        onClick={handleAppleSignUp}
                        disabled={isBusy}
                    >
                        <FaApple color="#000000" size={18} />
                        <span>Sign up with Apple</span>
                    </button>
                </div>

                <p className="jsl-signup">
                    Already have an account?{' '}
                    <Link to="/supabase-login" state={location.state} className="jsl-link strong">Sign in</Link>
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
