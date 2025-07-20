import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaPhone, FaArrowLeft, FaSpinner } from 'react-icons/fa';
import { useFirebaseAuth } from '../../../contexts/FirebaseAuthContext';
import './login.css';

export default function PhoneLogin() {
    const navigate = useNavigate();
    const { 
        initializeRecaptcha,
        sendOTP, 
        verifyOTP, 
        clearRecaptcha,
        loading, 
        error, 
        clearError,
        isAuthenticated 
    } = useFirebaseAuth();

    const [step, setStep] = useState('phone'); // 'phone' or 'otp'
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [confirmationResult, setConfirmationResult] = useState(null);
    const [formErrors, setFormErrors] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);
    const [countryCode, setCountryCode] = useState('+91');

    // Debug phone number changes
    useEffect(() => {
        console.log('Phone number changed:', phoneNumber);
    }, [phoneNumber]);

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/my-trips');
        }
    }, [isAuthenticated, navigate]);

    // Clean up reCAPTCHA when component unmounts or step changes
    useEffect(() => {
        return () => {
            try {
                clearRecaptcha();
            } catch (error) {
                console.error('Error clearing reCAPTCHA on cleanup:', error);
            }
        };
    }, [clearRecaptcha]);

    // Clear reCAPTCHA container when switching to phone step
    useEffect(() => {
        if (step === 'phone') {
            const container = document.getElementById('recaptcha-container');
            if (container) {
                container.innerHTML = '';
                console.log('Cleared reCAPTCHA container for fresh start');
            }
        }
    }, [step]);

    // Clear errors when form data changes
    useEffect(() => {
        if (error) {
            clearError();
        }
        setFormErrors({});
    }, [phoneNumber, otp, clearError, error]);

    // Resend timer
    useEffect(() => {
        let interval;
        if (resendTimer > 0) {
            interval = setInterval(() => {
                setResendTimer(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer]);

    // Format phone number for display
    const formatPhoneNumber = (phone) => {
        return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    };

    // Validate phone number
    const validatePhoneNumber = (phone) => {
        const phoneRegex = /^[6-9]\d{9}$/; // Indian mobile number
        return phoneRegex.test(phone);
    };

    // Handle phone number submission
    const handlePhoneSubmit = async (e) => {
        e.preventDefault();
        
        if (!phoneNumber) {
            setFormErrors({ phone: 'Phone number is required' });
            return;
        }

        if (!validatePhoneNumber(phoneNumber)) {
            setFormErrors({ phone: 'Please enter a valid 10-digit mobile number' });
            return;
        }

        setIsProcessing(true);
        setFormErrors({}); // Clear any previous errors
        
        try {
            const fullPhoneNumber = `${countryCode}${phoneNumber}`;
            console.log('Submitting phone verification for:', fullPhoneNumber);
            
            const result = await sendOTP(fullPhoneNumber);
            
            if (result.success) {
                setConfirmationResult(result.confirmationResult);
                setStep('otp');
                setResendTimer(60); // 60 seconds resend timer
                console.log('OTP sent successfully, moving to verification step');
            } else {
                console.error('OTP sending failed:', result.error);
                let errorMessage = result.error;
                
                // Add helpful context for common errors
                if (result.code === 'auth/argument-error') {
                    errorMessage = 'Phone authentication is not properly configured. Please contact support.';
                } else if (result.code === 'auth/invalid-phone-number') {
                    errorMessage = 'Invalid phone number. Please check the number and country code.';
                }
                
                setFormErrors({ phone: errorMessage });
            }
        } catch (error) {
            console.error('Phone verification error:', error);
            setFormErrors({ phone: 'Failed to send OTP. Please refresh the page and try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle OTP verification
    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        
        if (!otp) {
            setFormErrors({ otp: 'OTP is required' });
            return;
        }

        if (otp.length !== 6) {
            setFormErrors({ otp: 'Please enter a valid 6-digit OTP' });
            return;
        }

        setIsProcessing(true);
        
        try {
            const result = await verifyOTP(confirmationResult, otp);
            
            if (result.success) {
                console.log('Phone login successful:', result.user);
                navigate('/my-trips');
            } else {
                setFormErrors({ otp: result.error });
            }
        } catch (error) {
            console.error('OTP verification error:', error);
            setFormErrors({ otp: 'Invalid OTP. Please try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle resend OTP
    const handleResendOtp = async () => {
        if (resendTimer > 0) return;
        
        setIsProcessing(true);
        
        try {
            const fullPhoneNumber = `${countryCode}${phoneNumber}`;
            const result = await sendOTP(fullPhoneNumber);
            
            if (result.success) {
                setConfirmationResult(result.confirmationResult);
                setResendTimer(60);
                setFormErrors({});
                console.log('OTP resent successfully');
            } else {
                setFormErrors({ otp: result.error });
            }
        } catch (error) {
            console.error('Resend OTP error:', error);
            setFormErrors({ otp: 'Failed to resend OTP. Please try again.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Go back to phone step
    const goBack = () => {
        setStep('phone');
        setOtp('');
        setVerificationId('');
        setFormErrors({});
        clearRecaptcha();
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
                    {step === 'phone' ? (
                        <>
                            <h1 className="login-title">
                                <FaPhone className="mr-2" />
                                Phone Login
                            </h1>
                            <p className="text-gray-600 mb-6">
                                Enter your mobile number to receive an OTP
                            </p>
                            
                            {/* Phone Form */}
                            <form onSubmit={handlePhoneSubmit} className="login-form">
                                {/* General Error Message */}
                                {(formErrors.phone || error) && (
                                    <div className="error-message mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
                                        {formErrors.phone || error}
                                    </div>
                                )}
                                
                                {/* Phone Number Field */}
                                <div className="form-group">
                                    <label htmlFor="phone">Mobile Number</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select
                                            value={countryCode}
                                            onChange={(e) => {
                                                console.log('Country code changed:', e.target.value);
                                                setCountryCode(e.target.value);
                                            }}
                                            className="form-input"
                                            style={{ width: '80px', flexShrink: 0 }}
                                        >
                                            <option value="+91">+91</option>
                                            <option value="+1">+1</option>
                                            <option value="+44">+44</option>
                                            <option value="+61">+61</option>
                                        </select>
                                        <input
                                            id="phone"
                                            name="phone"
                                            type="tel"
                                            value={phoneNumber}
                                            onChange={(e) => {
                                                console.log('Input onChange triggered:', e.target.value);
                                                const value = e.target.value.replace(/\D/g, '');
                                                console.log('Cleaned value:', value);
                                                if (value.length <= 10) {
                                                    setPhoneNumber(value);
                                                }
                                            }}
                                            onFocus={() => console.log('Phone input focused')}
                                            onBlur={() => console.log('Phone input blurred')}
                                            onClick={() => console.log('Phone input clicked')}
                                            placeholder="Enter 10-digit mobile number"
                                            className="form-input"
                                            style={{ flex: 1 }}
                                            maxLength="10"
                                            autoComplete="tel"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* reCAPTCHA Container */}
                                <div className="mb-4">
                                    <div id="recaptcha-container"></div>
                                    <p className="text-sm text-gray-600 mt-2">
                                        Security verification will appear when you click "Send OTP"
                                    </p>
                                    {formErrors.phone && formErrors.phone.includes('verification') && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormErrors({});
                                                const container = document.getElementById('recaptcha-container');
                                                if (container) {
                                                    container.innerHTML = '';
                                                }
                                            }}
                                            className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                                        >
                                            Clear and Retry
                                        </button>
                                    )}
                                </div>
                                
                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={isProcessing || loading}
                                    className="login-button"
                                >
                                    {isProcessing || loading ? (
                                        <>
                                            <FaSpinner className="animate-spin mr-2" />
                                            Sending OTP...
                                        </>
                                    ) : (
                                        'Send OTP'
                                    )}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <h1 className="login-title">
                                <FaPhone className="mr-2" />
                                Verify OTP
                            </h1>
                            <p className="text-gray-600 mb-6">
                                Enter the 6-digit OTP sent to {countryCode} {formatPhoneNumber(phoneNumber)}
                            </p>
                            
                            {/* OTP Form */}
                            <form onSubmit={handleOtpSubmit} className="login-form">
                                {/* General Error Message */}
                                {(formErrors.otp || error) && (
                                    <div className="error-message mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
                                        {formErrors.otp || error}
                                    </div>
                                )}
                                
                                {/* OTP Field */}
                                <div className="form-group">
                                    <label htmlFor="otp">Enter OTP</label>
                                    <input
                                        id="otp"
                                        name="otp"
                                        type="text"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                        className="form-input text-center text-2xl tracking-widest"
                                        maxLength="6"
                                        required
                                    />
                                </div>
                                
                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={isProcessing || loading}
                                    className="login-button"
                                >
                                    {isProcessing || loading ? (
                                        <>
                                            <FaSpinner className="animate-spin mr-2" />
                                            Verifying...
                                        </>
                                    ) : (
                                        'Verify OTP'
                                    )}
                                </button>
                                
                                {/* Resend OTP */}
                                <div className="text-center mt-4">
                                    {resendTimer > 0 ? (
                                        <p className="text-gray-600">
                                            Resend OTP in {resendTimer} seconds
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleResendOtp}
                                            disabled={isProcessing}
                                            className="text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            Resend OTP
                                        </button>
                                    )}
                                </div>
                                
                                {/* Back Button */}
                                <button
                                    type="button"
                                    onClick={goBack}
                                    className="w-full mt-2 flex items-center justify-center text-gray-600 hover:text-gray-800"
                                >
                                    <FaArrowLeft className="mr-2" />
                                    Change Number
                                </button>
                            </form>
                        </>
                    )}
                    
                    {/* Alternative Login Options */}
                    <div className="login-divider">
                        <span>Or continue with</span>
                    </div>
                    
                    <div className="alternative-login">
                        <Link 
                            to="/firebase-login" 
                            className="alternative-button"
                        >
                            Email & Password
                        </Link>
                    </div>
                    
                    {/* Sign Up Link */}
                    <div className="signup-link">
                        <span>Don't have an account? </span>
                        <Link to="/firebase-signup">Sign up</Link>
                    </div>
                </div>
            </div>
        </div>
    );
} 