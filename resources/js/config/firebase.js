// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  connectAuthEmulator,
  GoogleAuthProvider,
  FacebookAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signInWithPhoneNumber
} from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate Firebase configuration
const validateFirebaseConfig = () => {
  const requiredFields = ['apiKey', 'authDomain', 'projectId'];
  const missingFields = requiredFields.filter(field => !firebaseConfig[field]);
  
  if (missingFields.length > 0) {
    console.error('Missing Firebase configuration:', missingFields);
    throw new Error(`Missing Firebase configuration: ${missingFields.join(', ')}`);
  }
};

// Initialize Firebase
let app;
let auth;
let analytics;

try {
  validateFirebaseConfig();
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  
  // Initialize Analytics only in production
  if (import.meta.env.PROD && firebaseConfig.measurementId) {
    analytics = getAnalytics(app);
  }
  
  // Connect to Auth emulator in development (only if enabled)
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    try {
      connectAuthEmulator(auth, `http://${import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost'}:${import.meta.env.VITE_FIREBASE_EMULATOR_PORT || 9099}`);
      console.log('🔧 Connected to Firebase Auth emulator');
    } catch (error) {
      console.log('⚠️ Firebase emulator connection failed:', error.message);
    }
  }
  
  console.log('🔥 Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
}

// Configure providers
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope('email');

// Auth functions
export const firebaseAuth = {
  // Sign up with email and password
  signUp: async (email, password, userData = {}) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update user profile with additional information
      if (userData.firstName || userData.lastName) {
        await updateProfile(user, {
          displayName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
        });
      }
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          photoURL: user.photoURL,
          ...userData
        }
      };
    } catch (error) {
      console.error('Firebase signup error:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          photoURL: user.photoURL
        }
      };
    } catch (error) {
      console.error('Firebase signin error:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  },

  // Sign in with Google
  signInWithGoogle: async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          photoURL: user.photoURL,
          provider: 'google'
        }
      };
    } catch (error) {
      console.error('Firebase Google signin error:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  },

  // Sign in with Facebook
  signInWithFacebook: async () => {
    try {
      const result = await signInWithPopup(auth, facebookProvider);
      const user = result.user;
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          photoURL: user.photoURL,
          provider: 'facebook'
        }
      };
    } catch (error) {
      console.error('Firebase Facebook signin error:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Firebase signout error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Reset password
  resetPassword: async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      console.error('Firebase password reset error:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthStateChanged: (callback) => {
    return onAuthStateChanged(auth, callback);
  },

  // Get user token
  getUserToken: async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        return await user.getIdToken();
      } catch (error) {
        console.error('Error getting user token:', error);
        return null;
      }
    }
    return null;
  },

  // Phone Authentication Methods
  
  // Initialize reCAPTCHA for phone authentication
  initializeRecaptcha: (containerId = 'recaptcha-container') => {
    try {
      // Clear any existing reCAPTCHA
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {
          console.log('Could not clear existing reCAPTCHA:', e);
        }
        window.recaptchaVerifier = null;
      }

      // Ensure container exists and is empty
      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error(`reCAPTCHA container '${containerId}' not found`);
      }
      container.innerHTML = '';

      // Create new reCAPTCHA verifier with proper configuration
      console.log('Creating reCAPTCHA verifier...');
      window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: 'normal',
        callback: (response) => {
          console.log('✅ reCAPTCHA verified successfully');
        },
        'expired-callback': () => {
          console.log('⚠️ reCAPTCHA expired, user needs to verify again');
        },
        'error-callback': (error) => {
          console.error('❌ reCAPTCHA error:', error);
        }
      });

      // Render and return the verifier
      window.recaptchaVerifier.render().then((widgetId) => {
        console.log('✅ reCAPTCHA rendered successfully with widget ID:', widgetId);
      }).catch((error) => {
        console.error('❌ Error rendering reCAPTCHA:', error);
      });
      
      return window.recaptchaVerifier;
    } catch (error) {
      console.error('❌ Error initializing reCAPTCHA:', error);
      return null;
    }
  },

  // Send OTP to phone number (Fixed according to Firebase docs)
  sendOTP: async (phoneNumber) => {
    try {
      // Check current domain for debugging
      const currentDomain = window.location.hostname;
      console.log('🌐 Current domain:', currentDomain);
      console.log('🔗 Full URL:', window.location.href);
      
      // Validate phone number format (must include country code)
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new Error('Please enter a valid phone number with country code (e.g., +1234567890)');
      }

      // Ensure phone number starts with + for international format
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      console.log('📱 Starting OTP process for:', formattedPhone);

      // Initialize fresh reCAPTCHA for each request (as per Firebase docs)
      console.log('🔄 Initializing fresh reCAPTCHA verifier...');
      
      // Clear existing verifier
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {
          console.log('Could not clear existing reCAPTCHA:', e);
        }
        window.recaptchaVerifier = null;
      }

      // Ensure container exists
      const container = document.getElementById('recaptcha-container');
      if (!container) {
        throw new Error('reCAPTCHA container not found. Please refresh the page.');
      }
      container.innerHTML = '';

      // Wait for DOM cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create fresh reCAPTCHA verifier for this request
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'normal',
          callback: (response) => {
            console.log('✅ reCAPTCHA solved:', response);
          },
          'expired-callback': () => {
            console.log('⚠️ reCAPTCHA expired');
          }
        });
        console.log('✅ reCAPTCHA verifier created successfully');
      } catch (recaptchaError) {
        console.error('❌ reCAPTCHA verifier creation failed:', recaptchaError);
        
        // Check if it's a domain authorization issue
        if (recaptchaError.code === 'auth/argument-error' || recaptchaError.message.includes('argument')) {
          throw new Error('Domain not authorized in Firebase Console. Please add this domain to authorized domains and wait 2-5 minutes.');
        }
        
        throw recaptchaError;
      }

      // Render reCAPTCHA and wait for completion
      console.log('🎯 Rendering reCAPTCHA...');
      await window.recaptchaVerifier.render();
      console.log('✅ reCAPTCHA rendered successfully');

      // Allow time for reCAPTCHA to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Send OTP using signInWithPhoneNumber (as per Firebase docs)
      console.log('📤 Sending OTP to:', formattedPhone);
      
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      
      console.log('✅ OTP sent successfully!');
      
      return {
        success: true,
        verificationId: confirmationResult.verificationId,
        confirmationResult,
        message: `OTP sent to ${formattedPhone}`
      };
    } catch (error) {
      console.error('❌ Error sending OTP:', error);
      console.error('❌ Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      
      // Clear failed reCAPTCHA
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        } catch (e) {
          console.log('Could not clear failed reCAPTCHA:', e);
        }
      }
      
      // Handle specific Firebase errors with user-friendly messages
      let errorMessage = error.message;
      
      switch (error.code) {
        case 'auth/invalid-phone-number':
          errorMessage = 'Invalid phone number. Please enter with country code (e.g., +1234567890)';
          break;
        case 'auth/quota-exceeded':
          errorMessage = 'SMS quota exceeded. Please try again later.';
          break;
        case 'auth/captcha-check-failed':
          errorMessage = 'reCAPTCHA verification failed. Please try again.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many requests. Please wait before trying again.';
          break;
        case 'auth/argument-error':
          errorMessage = 'Domain not authorized. Please add this domain to Firebase Console authorized domains and wait 2-5 minutes.';
          break;
        case 'auth/internal-error':
          errorMessage = 'Phone verification failed. Please refresh and try again.';
          break;
        default:
          if (error.message.includes('reCAPTCHA')) {
            errorMessage = 'reCAPTCHA failed. Please refresh the page and try again.';
          }
      }
      
      return {
        success: false,
        error: errorMessage,
        code: error.code
      };
    }
  },

  // Verify OTP and complete sign-in (Updated method)
  verifyOTP: async (confirmationResult, otp) => {
    try {
      console.log('🔍 Verifying OTP:', otp);
      
      // Use confirmationResult.confirm() method as per Firebase docs
      const userCredential = await confirmationResult.confirm(otp);
      const user = userCredential.user;
      
      console.log('✅ Phone authentication successful!');
      
      return {
        success: true,
        user: {
          uid: user.uid,
          phoneNumber: user.phoneNumber,
          displayName: user.displayName,
          photoURL: user.photoURL,
          email: user.email
        },
        message: 'Phone authentication successful!'
      };
    } catch (error) {
      console.error('❌ Error verifying OTP:', error);
      
      let errorMessage = error.message;
      
      switch (error.code) {
        case 'auth/invalid-verification-code':
          errorMessage = 'Invalid OTP. Please check and try again.';
          break;
        case 'auth/code-expired':
          errorMessage = 'OTP expired. Please request a new one.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
        default:
          errorMessage = 'OTP verification failed. Please try again.';
      }
      
      return {
        success: false,
        error: errorMessage,
        code: error.code
      };
    }
  },

  // Clear reCAPTCHA
  clearRecaptcha: () => {
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }
  }
};

// Error code mappings for better user experience
export const getFirebaseErrorMessage = (errorCode) => {
  const errorMessages = {
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters long.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed before completion.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Sign-in popup was blocked by your browser.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled.',
    'auth/invalid-credential': 'The provided credentials are invalid.',
    'auth/account-exists-with-different-credential': 'An account already exists with the same email but different sign-in credentials.',
  };
  
  return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
};

export { auth, analytics };
export default app; 