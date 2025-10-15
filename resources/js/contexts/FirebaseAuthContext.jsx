import React, { createContext, useContext, useEffect, useState } from 'react';
import { firebaseAuth, getFirebaseErrorMessage } from '../config/firebase';

// Create Auth Context
const FirebaseAuthContext = createContext({});

// Custom hook to use the auth context
export const useFirebaseAuth = () => {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
  }
  return context;
};

// Firebase Auth Provider Component
export const FirebaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to auth state changes
  useEffect(() => {
    // Check if firebaseAuth is properly initialized
    if (!firebaseAuth || typeof firebaseAuth.onAuthStateChanged !== 'function') {
      console.warn('Firebase authentication not properly initialized');
      setLoading(false);
      return;
    }

    const unsubscribe = firebaseAuth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
          // Extract first and last name from displayName
          firstName: firebaseUser.displayName?.split(' ')[0] || '',
          lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || ''
        };
        setUser(userData);
        
        // Store in localStorage for compatibility with existing components
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('user', JSON.stringify(userData));
        
        // Get and store Firebase token
        firebaseUser.getIdToken().then(token => {
          localStorage.setItem('token', token);
        });
      } else {
        // User is signed out
        setUser(null);
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Sign up function
  const signUp = async (email, password, firstName = '', lastName = '') => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.signUp !== 'function') {
        throw new Error('Firebase authentication not available');
      }
      
      const result = await firebaseAuth.signUp(email, password, {
        firstName,
        lastName
      });
      
      if (result.success) {
        return { success: true, user: result.user };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during signup';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Sign in function
  const signIn = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.signIn !== 'function') {
        throw new Error('Firebase authentication not available');
      }
      
      const result = await firebaseAuth.signIn(email, password);
      
      if (result.success) {
        return { success: true, user: result.user };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during signin';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Google sign in function
  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.signInWithGoogle !== 'function') {
        throw new Error('Firebase authentication not available');
      }
      
      const result = await firebaseAuth.signInWithGoogle();
      
      if (result.success) {
        return { success: true, user: result.user };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during Google signin';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Facebook sign in function
  const signInWithFacebook = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.signInWithFacebook !== 'function') {
        throw new Error('Firebase authentication not available');
      }
      
      const result = await firebaseAuth.signInWithFacebook();
      
      if (result.success) {
        return { success: true, user: result.user };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during Facebook signin';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.signOut !== 'function') {
        throw new Error('Firebase authentication not available');
      }
      
      const result = await firebaseAuth.signOut();
      
      if (result.success) {
        return { success: true };
      } else {
        setError(result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during signout';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Reset password function
  const resetPassword = async (email) => {
    try {
      setError(null);
      
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.resetPassword !== 'function') {
        throw new Error('Firebase authentication not available');
      }
      
      const result = await firebaseAuth.resetPassword(email);
      
      if (result.success) {
        return { success: true, message: 'Password reset email sent successfully' };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during password reset';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Get user token
  const getUserToken = async () => {
    try {
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.getUserToken !== 'function') {
        return null;
      }
      return await firebaseAuth.getUserToken();
    } catch (error) {
      console.error('Error getting user token:', error);
      return null;
    }
  };

  // Phone Authentication Methods
  const initializeRecaptcha = (containerId) => {
    // Check if firebaseAuth is available
    if (!firebaseAuth || typeof firebaseAuth.initializeRecaptcha !== 'function') {
      console.warn('Firebase authentication not available for phone auth');
      return null;
    }
    return firebaseAuth.initializeRecaptcha(containerId);
  };

  const sendOTP = async (phoneNumber) => {
    setLoading(true);
    setError(null);
    
    try {
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.sendOTP !== 'function') {
        throw new Error('Firebase authentication not available for phone auth');
      }
      
      const result = await firebaseAuth.sendOTP(phoneNumber);
      return result;
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during OTP sending';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (verificationId, otp) => {
    setLoading(true);
    setError(null);
    
    try {
      // Check if firebaseAuth is available
      if (!firebaseAuth || typeof firebaseAuth.verifyOTP !== 'function') {
        throw new Error('Firebase authentication not available for phone auth');
      }
      
      const result = await firebaseAuth.verifyOTP(verificationId, otp);
      return result;
    } catch (error) {
      const errorMessage = error.message || 'An unexpected error occurred during OTP verification';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const clearRecaptcha = () => {
    // Check if firebaseAuth is available
    if (!firebaseAuth || typeof firebaseAuth.clearRecaptcha !== 'function') {
      return;
    }
    return firebaseAuth.clearRecaptcha();
  };

  // Clear error function
  const clearError = () => {
    setError(null);
  };

  // Check if user is authenticated
  const isAuthenticated = !!user;

  // Context value
  const value = {
    // State
    user,
    loading,
    error,
    isAuthenticated,
    
    // Auth functions
    signUp,
    signIn,
    signInWithGoogle,
    signInWithFacebook,
    signOut,
    resetPassword,
    getUserToken,
    clearError,
    
    // Phone authentication methods
    initializeRecaptcha,
    sendOTP,
    verifyOTP,
    clearRecaptcha,
    
    // Compatibility functions for existing components
    login: signIn,
    register: signUp,
    logout: signOut,
    getCurrentUser: () => user,
    
    // Legacy compatibility
    data: user ? {
      id: user.uid,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      token: localStorage.getItem('token')
    } : null
  };

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};

export default FirebaseAuthContext;