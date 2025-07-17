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