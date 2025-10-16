import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaEnvelope, FaPhone, FaCalendar, FaSignOutAlt, FaEdit, FaSave, FaTimes, FaChevronLeft, FaCamera, FaLock, FaShieldAlt, FaBell } from 'react-icons/fa';
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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            {/* Mobile-First Header */}
            <div className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
                <div className="px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <button 
                            onClick={() => navigate('/flights')}
                            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm sm:text-base"
                        >
                            <FaChevronLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Back</span>
                        </button>
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Profile</h1>
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-sm sm:text-base"
                        >
                            <FaSignOutAlt className="h-4 w-4" />
                            <span className="hidden sm:inline">Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
                {/* Profile Header Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 mb-6">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                        {/* Profile Photo */}
                        <div className="relative">
                            <div className="h-20 w-20 sm:h-24 sm:w-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                                {user.photoURL ? (
                                    <img 
                                        src={user.photoURL} 
                                        alt="Profile" 
                                        className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover"
                                    />
                                ) : (
                                    <FaUser className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
                                )}
                            </div>
                            {editMode && (
                                <button className="absolute -bottom-1 -right-1 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg transition-colors">
                                    <FaCamera className="h-3 w-3 sm:h-4 sm:w-4" />
                                </button>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 text-center sm:text-left">
                            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
                                {user.displayName || 'User'}
                            </h2>
                            <p className="text-gray-600 mb-2 break-all">{user.email}</p>
                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                    <FaCalendar className="h-3 w-3" />
                                    Member since {formatJoinDate(user)}
                                </span>
                                {user.emailVerified && (
                                    <span className="flex items-center gap-1 text-green-600">
                                        <FaShieldAlt className="h-3 w-3" />
                                        Verified
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Edit Button */}
                        <div className="w-full sm:w-auto">
                            {!editMode ? (
                                <button
                                    onClick={() => setEditMode(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm sm:text-base shadow-sm"
                                >
                                    <FaEdit className="h-4 w-4" />
                                    <span>Edit Profile</span>
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={updateLoading}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 font-medium text-sm sm:text-base shadow-sm"
                                    >
                                        <FaSave className="h-4 w-4" />
                                        <span>{updateLoading ? 'Saving...' : 'Save'}</span>
                                    </button>
                                    <button
                                        onClick={() => setEditMode(false)}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors font-medium text-sm sm:text-base shadow-sm"
                                    >
                                        <FaTimes className="h-4 w-4" />
                                        <span>Cancel</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                        <p className="text-red-800 text-sm">{error}</p>
                    </div>
                )}

                {/* Profile Information */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Profile Information</h3>
                    
                    <form onSubmit={handleSaveProfile} className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <FaUser className="inline mr-2 h-4 w-4" />
                                    Display Name
                                </label>
                                {editMode ? (
                                    <input
                                        type="text"
                                        name="displayName"
                                        value={formData.displayName}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-base"
                                        placeholder="Enter your display name"
                                    />
                                ) : (
                                    <div className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
                                        {user.displayName || 'Not set'}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <FaEnvelope className="inline mr-2 h-4 w-4" />
                                    Email Address
                                </label>
                                <div className="px-4 py-3 bg-gray-50 rounded-xl">
                                    <p className="text-gray-900 break-all">{user.email}</p>
                                    {user.emailVerified && (
                                        <span className="inline-flex items-center gap-1 mt-1 text-green-600 text-sm">
                                            <FaShieldAlt className="h-3 w-3" />
                                            Verified
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <FaPhone className="inline mr-2 h-4 w-4" />
                                    Phone Number
                                </label>
                                <div className="px-4 py-3 bg-gray-50 rounded-xl text-gray-600">
                                    {user.phoneNumber || 'Not provided'}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <FaCalendar className="inline mr-2 h-4 w-4" />
                                    Account Created
                                </label>
                                <div className="px-4 py-3 bg-gray-50 rounded-xl text-gray-600">
                                    {formatJoinDate(user)}
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Account Settings */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Account Settings</h3>
                    
                    <div className="space-y-4">
                        {/* Email Verification */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="mb-3 sm:mb-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <FaEnvelope className="h-4 w-4 text-blue-600" />
                                    <h4 className="font-medium text-gray-900">Email Verification</h4>
                                </div>
                                <p className="text-sm text-gray-600">
                                    {user.emailVerified ? 'Your email is verified and secure' : 'Please verify your email address for security'}
                                </p>
                            </div>
                            <div className="flex items-center">
                                {user.emailVerified ? (
                                    <span className="flex items-center gap-2 text-green-600 font-medium text-sm">
                                        <FaShieldAlt className="h-4 w-4" />
                                        Verified
                                    </span>
                                ) : (
                                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                                        Send Verification
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Two-Factor Authentication */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="mb-3 sm:mb-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <FaShieldAlt className="h-4 w-4 text-blue-600" />
                                    <h4 className="font-medium text-gray-900">Two-Factor Authentication</h4>
                                </div>
                                <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                            </div>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                                Enable 2FA
                            </button>
                        </div>

                        {/* Password */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="mb-3 sm:mb-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <FaLock className="h-4 w-4 text-blue-600" />
                                    <h4 className="font-medium text-gray-900">Password</h4>
                                </div>
                                <p className="text-sm text-gray-600">Change your account password regularly</p>
                            </div>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                                Change Password
                            </button>
                        </div>

                        {/* Notifications */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="mb-3 sm:mb-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <FaBell className="h-4 w-4 text-blue-600" />
                                    <h4 className="font-medium text-gray-900">Notifications</h4>
                                </div>
                                <p className="text-sm text-gray-600">Manage your email and push notifications</p>
                            </div>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                                Manage
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Spacing */}
                <div className="h-6 sm:h-0"></div>
            </div>
        </div>
    );
} 