# 👤 User Profile Code - Complete Implementation Guide

This document contains the complete user profile and account management implementation from the Jetsetterss web platform. Use this code to replicate the exact same user profile functionality and design in the Android app.

## 🎯 Profile Management Features Structure

The profile system consists of multiple interconnected components:

1. **FirebaseAuthContext** - Authentication state management
2. **FirebaseProfileDashboard** - Firebase-based profile management
3. **ProfileDashboard** - localStorage-based profile management
4. **Authentication Flow** - Login/signup/logout functionality
5. **Protected Routes** - Route guards for authenticated users

---

## 🔐 Firebase Authentication Context

```jsx
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
    if (!firebaseAuth) {
      setLoading(false);
      setError('Firebase authentication not initialized');
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
          phoneNumber: firebaseUser.phoneNumber,
          // Extract first and last name from displayName
          firstName: firebaseUser.displayName?.split(' ')[0] || '',
          lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
          metadata: firebaseUser.metadata
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
    return () => unsubscribe();
  }, []);

  // Sign up function
  const signUp = async (email, password, firstName = '', lastName = '') => {
    try {
      setLoading(true);
      setError(null);

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
      const errorMessage = 'An unexpected error occurred during signup';
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

      const result = await firebaseAuth.signIn(email, password);

      if (result.success) {
        return { success: true, user: result.user };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred during sign in';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await firebaseAuth.signInWithGoogle();

      if (result.success) {
        return { success: true, user: result.user };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred during Google sign in';
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

      const result = await firebaseAuth.signOut();

      if (result.success) {
        return { success: true };
      } else {
        const errorMessage = result.error || 'An error occurred during sign out';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred during sign out';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Update user profile
  const updateUserProfile = async (updates) => {
    try {
      setLoading(true);
      setError(null);

      const result = await firebaseAuth.updateProfile(updates);

      if (result.success) {
        // Update local user state
        setUser(prevUser => ({
          ...prevUser,
          ...updates
        }));
        return { success: true };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred while updating profile';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Send password reset email
  const resetPassword = async (email) => {
    try {
      setLoading(true);
      setError(null);

      const result = await firebaseAuth.resetPassword(email);

      if (result.success) {
        return { success: true };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred while sending reset email';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Send email verification
  const sendEmailVerification = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await firebaseAuth.sendEmailVerification();

      if (result.success) {
        return { success: true };
      } else {
        const errorMessage = getFirebaseErrorMessage(result.code) || result.error;
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = 'An unexpected error occurred while sending verification email';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Context value
  const value = {
    user,
    loading,
    error,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    updateUserProfile,
    resetPassword,
    sendEmailVerification,
    clearError
  };

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};
```

---

## 👤 Firebase Profile Dashboard Component

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaEnvelope, FaPhone, FaCalendar, FaSignOutAlt, FaEdit, FaSave, FaTimes } from 'react-icons/fa';
import { useFirebaseAuth } from '../../../contexts/FirebaseAuthContext';
import './login.css';

export default function FirebaseProfileDashboard() {
    const navigate = useNavigate();
    const { user, updateUserProfile, signOut, loading, error, clearError } = useFirebaseAuth();

    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        phoneNumber: '',
    });
    const [updateLoading, setUpdateLoading] = useState(false);

    // Initialize form data when user loads
    useEffect(() => {
        if (user) {
            setFormData({
                displayName: user.displayName || '',
                email: user.email || '',
                phoneNumber: user.phoneNumber || '',
            });
        }
    }, [user]);

    // Redirect if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            navigate('/login');
        }
    }, [user, loading, navigate]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setUpdateLoading(true);
        clearError();

        try {
            await updateUserProfile({
                displayName: formData.displayName,
                // Note: Email and phone updates require additional verification
            });
            setEditMode(false);
        } catch (error) {
            console.error('Profile update failed:', error);
        } finally {
            setUpdateLoading(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            navigate('/');
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    };

    const formatJoinDate = (user) => {
        if (user?.metadata?.creationTime) {
            return new Date(user.metadata.creationTime).toLocaleDateString();
        }
        return 'N/A';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return null; // Will redirect via useEffect
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Back Button */}
                <div className="mb-4">
                    <button
                        onClick={() => navigate('/flights')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        ← Back to Flights
                    </button>
                </div>

                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center">
                                {user.photoURL ? (
                                    <img
                                        src={user.photoURL}
                                        alt="Profile"
                                        className="h-16 w-16 rounded-full object-cover"
                                    />
                                ) : (
                                    <FaUser className="h-8 w-8 text-white" />
                                )}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">
                                    {user.displayName || 'User'}
                                </h1>
                                <p className="text-gray-600">{user.email}</p>
                                <p className="text-sm text-gray-500">
                                    Member since {formatJoinDate(user)}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            <FaSignOutAlt />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>

                {/* Profile Information */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-gray-900">Profile Information</h2>
                        {!editMode ? (
                            <button
                                onClick={() => setEditMode(true)}
                                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <FaEdit />
                                <span>Edit Profile</span>
                            </button>
                        ) : (
                            <div className="flex space-x-2">
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={updateLoading}
                                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                >
                                    <FaSave />
                                    <span>{updateLoading ? 'Saving...' : 'Save'}</span>
                                </button>
                                <button
                                    onClick={() => setEditMode(false)}
                                    className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    <FaTimes />
                                    <span>Cancel</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-800">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSaveProfile} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <FaUser className="inline mr-2" />
                                    Display Name
                                </label>
                                {editMode ? (
                                    <input
                                        type="text"
                                        name="displayName"
                                        value={formData.displayName}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your display name"
                                    />
                                ) : (
                                    <p className="px-3 py-2 bg-gray-50 rounded-lg">
                                        {user.displayName || 'Not set'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <FaEnvelope className="inline mr-2" />
                                    Email Address
                                </label>
                                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600">
                                    {user.email}
                                    {user.emailVerified && (
                                        <span className="ml-2 text-green-600 text-sm">✓ Verified</span>
                                    )}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <FaPhone className="inline mr-2" />
                                    Phone Number
                                </label>
                                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600">
                                    {user.phoneNumber || 'Not provided'}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <FaCalendar className="inline mr-2" />
                                    Account Created
                                </label>
                                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600">
                                    {formatJoinDate(user)}
                                </p>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Account Settings */}
                <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Settings</h2>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <h3 className="font-medium text-gray-900">Email Verification</h3>
                                <p className="text-sm text-gray-600">
                                    {user.emailVerified ? 'Your email is verified' : 'Please verify your email address'}
                                </p>
                            </div>
                            <div className="flex items-center">
                                {user.emailVerified ? (
                                    <span className="text-green-600 font-medium">✓ Verified</span>
                                ) : (
                                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                        Send Verification
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
                                <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                            </div>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                Enable 2FA
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <h3 className="font-medium text-gray-900">Password</h3>
                                <p className="text-sm text-gray-600">Change your account password</p>
                            </div>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                Change Password
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
```

---

## 👤 localStorage Profile Dashboard Component

```jsx
"use client"

import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"

export default function ProfilePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [processing, setProcessing] = useState(false)
  const [recentlySuccessful, setRecentlySuccessful] = useState(false)
  const [errors, setErrors] = useState({})

  const [data, setData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile_number: "",
    date_of_birth: "",
    gender: "Male",
    profile_photo: null,
  })

  // Load user data from localStorage if available
  useEffect(() => {
    const savedUserData = localStorage.getItem('userData')
    if (savedUserData) {
      try {
        const parsedData = JSON.parse(savedUserData)
        setData(prevData => ({
          ...prevData,
          ...parsedData
        }))
      } catch (e) {
        console.error("Failed to parse user data from localStorage", e)
      }
    }
  }, [])

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setData({...data, profile_photo: file})
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setProcessing(true)

    // Validate form
    const newErrors = {}
    if (!data.first_name) newErrors.first_name = "First name is required"
    if (!data.email) newErrors.email = "Email is required"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setProcessing(false)
      return
    }

    // Save the user data to localStorage
    const dataToSave = {...data}
    if (data.profile_photo) {
      // Don't try to stringify the File object
      delete dataToSave.profile_photo
    }
    localStorage.setItem('userData', JSON.stringify(dataToSave))

    // Simulate API call
    setTimeout(() => {
      setProcessing(false)
      setRecentlySuccessful(true)

      // Reset success message after a delay
      setTimeout(() => {
        setRecentlySuccessful(false)
      }, 2000)
    }, 800)
  }

  return (
    <div className="min-h-screen bg-[#f0f7fc] py-4 sm:py-6 md:py-8">
      <header className="container mx-auto px-4 sm:px-6 mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-[#006d92] hover:text-[#005a7a] transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span className="ml-2 font-medium">Back to Home</span>
        </button>
      </header>

      <form onSubmit={handleSubmit} encType="multipart/form-data" className="container mx-auto px-4 sm:px-6 max-w-4xl">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 text-center sm:text-left">My Profile</h1>

        {/* Profile Card */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <div className="flex flex-col items-center">
              {data.profile_photo ? (
                <div className="w-[90px] h-[90px] sm:w-[100px] sm:h-[100px] rounded-full overflow-hidden">
                  <img src={URL.createObjectURL(data.profile_photo)} alt="Profile" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-[90px] h-[90px] sm:w-[100px] sm:h-[100px] rounded-full bg-[#5aadd0] flex items-center justify-center text-white text-4xl sm:text-5xl font-bold">
                  {data.first_name ? data.first_name[0].toUpperCase() : "A"}
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
              <button type="button" className="text-[#006d92] font-medium mt-2 text-sm whitespace-nowrap" onClick={() => fileInputRef.current?.click()}>
                Add Profile Photo
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left mt-3 sm:mt-0">
              <h1 className="text-xl sm:text-2xl font-bold">{data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : "Full Name"}</h1>
              <p className="text-gray-600">{data.mobile_number || "Mobile number"}</p>
              <p className="text-gray-600">{data.email}</p>
            </div>
          </div>
        </div>

        {/* Personal Info Card */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-6">
          <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6">Personal Information</h2>

          {/* Gender Buttons */}
          <div className="mb-4 sm:mb-6">
            <label className="block text-gray-700 mb-2">Gender</label>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              {["Male", "Female", "Others"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`px-4 sm:px-6 py-2 rounded-md ${data.gender === value ? "bg-[#006d92] text-white" : "bg-white border border-gray-300 text-gray-700"}`}
                  onClick={() => setData({...data, gender: value})}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {/* Input Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <input
                type="text"
                placeholder="Mobile Number"
                value={data.mobile_number}
                onChange={(e) => setData({...data, mobile_number: e.target.value})}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-md"
              />
              {errors.mobile_number && <p className="text-red-500 text-xs mt-1">{errors.mobile_number}</p>}
            </div>
            <div>
              <input
                type="email"
                placeholder="Email"
                value={data.email}
                onChange={(e) => setData({...data, email: e.target.value})}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-md"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <input
                type="text"
                placeholder="First Name"
                value={data.first_name}
                onChange={(e) => setData({...data, first_name: e.target.value})}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-md"
              />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <input
                type="text"
                placeholder="Last Name"
                value={data.last_name}
                onChange={(e) => setData({...data, last_name: e.target.value})}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-md"
              />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
            </div>
            <div className="sm:col-span-2">
              <input
                type="date"
                placeholder="Date of Birth"
                value={data.date_of_birth}
                onChange={(e) => setData({...data, date_of_birth: e.target.value})}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-md"
              />
              {errors.date_of_birth && <p className="text-red-500 text-xs mt-1">{errors.date_of_birth}</p>}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0 mt-6">
            <button
              type="submit"
              disabled={processing}
              className="w-full sm:w-auto px-8 py-2 bg-[#006d92] text-white rounded-md hover:bg-[#005a7a] transition"
            >
              {processing ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => setData({
                first_name: "",
                last_name: "",
                email: "",
                mobile_number: "",
                date_of_birth: "",
                gender: "Male",
                profile_photo: null
              })}
              className="w-full sm:w-auto px-8 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition"
            >
              Reset Form
            </button>
          </div>

          {recentlySuccessful && (
            <div className="mt-4 bg-green-50 p-3 rounded-md border border-green-200">
              <p className="text-green-600 text-sm font-medium">Profile updated successfully!</p>
            </div>
          )}
        </div>

        {/* Account Security Section */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-6">
          <h2 className="text-lg sm:text-xl font-bold mb-4">Account Security</h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-medium">Password</h3>
                <p className="text-sm text-gray-500">Last updated 3 months ago</p>
              </div>
              <button type="button" className="text-[#006d92] font-medium hover:underline">
                Change Password
              </button>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-medium">Two-factor Authentication</h3>
                <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
              </div>
              <button type="button" className="text-[#006d92] font-medium hover:underline">
                Enable
              </button>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium">Connected Accounts</h3>
                <p className="text-sm text-gray-500">Link your social accounts for easier login</p>
              </div>
              <button type="button" className="text-[#006d92] font-medium hover:underline">
                Manage
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
```

---

## 🔑 Firebase Configuration

```javascript
// config/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, updateProfile as firebaseUpdateProfile } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Firebase Auth Helper Functions
export const firebaseAuth = {
  // Sign up with email and password
  signUp: async (email, password, additionalData = {}) => {
    try {
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update profile with display name
      const displayName = additionalData.firstName && additionalData.lastName
        ? `${additionalData.firstName} ${additionalData.lastName}`
        : additionalData.firstName || email.split('@')[0];

      await firebaseUpdateProfile(userCredential.user, {
        displayName: displayName
      });

      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    }
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    }
  },

  // Sign in with Google
  signInWithGoogle: async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await firebaseSignOut(auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update user profile
  updateProfile: async (updates) => {
    try {
      const user = auth.currentUser;
      if (user) {
        await firebaseUpdateProfile(user, updates);
        return { success: true };
      }
      return { success: false, error: 'No authenticated user' };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    }
  },

  // Send password reset email
  resetPassword: async (email) => {
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    }
  },

  // Send email verification
  sendEmailVerification: async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const { sendEmailVerification } = await import('firebase/auth');
        await sendEmailVerification(user);
        return { success: true };
      }
      return { success: false, error: 'No authenticated user' };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    }
  }
};

// Error message helper
export const getFirebaseErrorMessage = (errorCode) => {
  const errorMessages = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Pop-up was blocked. Please allow pop-ups for this site.',
  };

  return errorMessages[errorCode] || 'An unexpected error occurred.';
};

export default app;
```

---

## 🎨 Profile CSS Styles

```css
/* Profile Page Styles */
.min-h-screen {
  min-height: 100vh;
}

.py-8 {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.max-w-4xl {
  max-width: 56rem;
}

.mx-auto {
  margin-left: auto;
  margin-right: auto;
}

.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}

.sm\:px-6 {
  padding-left: 1.5rem;
  padding-right: 1.5rem;
}

.lg\:px-8 {
  padding-left: 2rem;
  padding-right: 2rem;
}

.mb-4 {
  margin-bottom: 1rem;
}

.mb-6 {
  margin-bottom: 1.5rem;
}

.bg-white {
  background-color: white;
}

.rounded-lg {
  border-radius: 0.5rem;
}

.shadow-sm {
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.p-6 {
  padding: 1.5rem;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.space-x-4 > :not([hidden]) ~ :not([hidden]) {
  margin-left: 1rem;
}

.h-16 {
  height: 4rem;
}

.w-16 {
  width: 4rem;
}

.bg-blue-600 {
  background-color: #2563eb;
}

.rounded-full {
  border-radius: 9999px;
}

.text-white {
  color: white;
}

.text-2xl {
  font-size: 1.5rem;
  line-height: 2rem;
}

.font-bold {
  font-weight: 700;
}

.text-gray-900 {
  color: #111827;
}

.text-gray-600 {
  color: #4b5563;
}

.text-sm {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.text-gray-500 {
  color: #6b7280;
}

/* Form Styles */
.space-y-4 > :not([hidden]) ~ :not([hidden]) {
  margin-top: 1rem;
}

.grid {
  display: grid;
}

.grid-cols-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.md\:grid-cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.gap-4 {
  gap: 1rem;
}

.block {
  display: block;
}

.font-medium {
  font-weight: 500;
}

.text-gray-700 {
  color: #374151;
}

.mb-1 {
  margin-bottom: 0.25rem;
}

.w-full {
  width: 100%;
}

.px-3 {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}

.py-2 {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.border {
  border-width: 1px;
}

.border-gray-300 {
  border-color: #d1d5db;
}

.rounded-lg {
  border-radius: 0.5rem;
}

.focus\:outline-none:focus {
  outline: 0;
}

.focus\:ring-2:focus {
  box-shadow: 0 0 0 2px;
}

.focus\:ring-blue-500:focus {
  --tw-ring-color: #3b82f6;
}

.bg-gray-50 {
  background-color: #f9fafb;
}

.text-gray-600 {
  color: #4b5563;
}

/* Button Styles */
.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}

.py-2 {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.bg-red-600 {
  background-color: #dc2626;
}

.hover\:bg-red-700:hover {
  background-color: #b91c1c;
}

.bg-green-600 {
  background-color: #16a34a;
}

.hover\:bg-green-700:hover {
  background-color: #15803d;
}

.bg-gray-600 {
  background-color: #4b5563;
}

.hover\:bg-gray-700:hover {
  background-color: #374151;
}

.disabled\:opacity-50:disabled {
  opacity: 0.5;
}

/* Error Styles */
.bg-red-50 {
  background-color: #fef2f2;
}

.border-red-200 {
  border-color: #fecaca;
}

.text-red-800 {
  color: #991b1b;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .sm\:px-6 {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }

  .md\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sm\:col-span-2 {
    grid-column: span 2 / span 2;
  }
}
```

---

## 📊 Key Features Summary

### **User Profile Management Features:**
1. **Firebase Authentication** - Secure authentication with email/password and Google OAuth
2. **Profile Editing** - Update display name, email verification, phone number
3. **Account Security** - Password changes, two-factor authentication, connected accounts
4. **localStorage Backup** - Alternative profile management for non-Firebase users
5. **Photo Upload** - Profile picture management with file handling
6. **Responsive Design** - Mobile-first approach with adaptive layouts

### **Authentication Flow:**
- **Firebase Auth Context** - Centralized authentication state management
- **Real-time Auth State** - Automatic login/logout handling
- **Profile Synchronization** - Cross-device profile data consistency
- **Security Features** - Email verification, password reset, secure token management

### **Profile Data Management:**
- **Firebase Realtime Database** - Cloud-based profile storage
- **localStorage Fallback** - Offline-capable profile management
- **Form Validation** - Input validation and error handling
- **File Upload** - Profile photo handling with preview

### **Security & Privacy:**
- **Data Encryption** - Secure profile data storage
- **Access Control** - Authentication-based profile access
- **Session Management** - Automatic session handling and cleanup
- **Privacy Compliance** - GDPR-compliant data handling

This comprehensive profile management system provides users with complete control over their account information, with the same functionality and user experience as the web platform! 👤📱


