import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaEnvelope, FaCalendar, FaSignOutAlt, FaEdit, FaSave, FaTimes, FaChevronLeft, FaLock, FaShieldAlt } from 'react-icons/fa';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import withPageElements from '../PageWrapper';
import './login.css';

function SupabaseProfileDashboard() {
    const navigate = useNavigate();
    const { user, loading, signOut, updateProfile, updatePassword, error: authError } = useSupabaseAuth();
    
    const [isEditing, setIsEditing] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    
    const [profileData, setProfileData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
    });

    const [passwordData, setPasswordData] = useState({
        newPassword: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (!loading && !user) {
            navigate('/supabase-login');
        }
        
        if (user) {
            setProfileData({
                firstName: user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
                lastName: user.user_metadata?.last_name || user.user_metadata?.full_name?.split(' ')[1] || '',
                email: user.email || '',
                phone: user.user_metadata?.phone || user.phone || '',
            });
        }
    }, [user, loading, navigate]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfileData({ ...profileData, [name]: value });
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData({ ...passwordData, [name]: value });
    };

    const handleEdit = () => {
        setIsEditing(true);
        setSuccessMessage('');
        setErrorMessage('');
    };

    const handleCancel = () => {
        setIsEditing(false);
        setShowPasswordChange(false);
        // Reset to original values
        if (user) {
            setProfileData({
                firstName: user.user_metadata?.first_name || '',
                lastName: user.user_metadata?.last_name || '',
                email: user.email || '',
                phone: user.user_metadata?.phone || user.phone || '',
            });
        }
        setPasswordData({ newPassword: '', confirmPassword: '' });
    };

    const handleSave = async () => {
        setProcessing(true);
        setSuccessMessage('');
        setErrorMessage('');

        try {
            const updates = {
                first_name: profileData.firstName,
                last_name: profileData.lastName,
                full_name: `${profileData.firstName} ${profileData.lastName}`,
                phone: profileData.phone
            };

            const { error } = await updateProfile(updates);

            if (error) {
                setErrorMessage(error.message || 'Failed to update profile');
                setProcessing(false);
                return;
            }

            setSuccessMessage('Profile updated successfully!');
            setIsEditing(false);
            
            // Update localStorage
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            localStorage.setItem('user', JSON.stringify({
                ...storedUser,
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                phone: profileData.phone
            }));
            
        } catch (error) {
            console.error('Profile update error:', error);
            setErrorMessage('An error occurred while updating your profile');
        } finally {
            setProcessing(false);
        }
    };

    const handlePasswordUpdate = async () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setErrorMessage('Passwords do not match');
            return;
        }

        if (passwordData.newPassword.length < 8) {
            setErrorMessage('Password must be at least 8 characters');
            return;
        }

        setProcessing(true);
        setSuccessMessage('');
        setErrorMessage('');

        try {
            const { error } = await updatePassword(passwordData.newPassword);

            if (error) {
                setErrorMessage(error.message || 'Failed to update password');
                setProcessing(false);
                return;
            }

            setSuccessMessage('Password updated successfully!');
            setShowPasswordChange(false);
            setPasswordData({ newPassword: '', confirmPassword: '' });
        } catch (error) {
            console.error('Password update error:', error);
            setErrorMessage('An error occurred while updating your password');
        } finally {
            setProcessing(false);
        }
    };

    const handleLogout = async () => {
        try {
            setProcessing(true);
            await signOut();
            navigate('/');
        } catch (error) {
            console.error('Logout error:', error);
            setErrorMessage('Failed to logout. Please try again.');
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="profile-loading">
                <div className="spinner"></div>
                <p>Loading profile...</p>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    };

    return (
        <div className="profile-dashboard-container">
            <div className="profile-dashboard">
                <div className="profile-header">
                    <button className="back-button" onClick={() => navigate('/my-trips')}>
                        <FaChevronLeft /> Back to My Trips
                    </button>
                    <h1 className="profile-title">
                        <FaUser className="inline mr-2" />
                        Profile Dashboard
                    </h1>
                    <p className="profile-subtitle">Manage your Supabase account information</p>
                </div>

                {authError && (
                    <div className="alert alert-danger">
                        {authError}
                    </div>
                )}

                {successMessage && (
                    <div className="alert alert-success">
                        {successMessage}
                    </div>
                )}

                {errorMessage && (
                    <div className="alert alert-danger">
                        {errorMessage}
                    </div>
                )}

                <div className="profile-content">
                    <div className="profile-card">
                        <div className="profile-card-header">
                            <h2><FaUser className="inline mr-2" />Personal Information</h2>
                            {!isEditing && (
                                <button className="edit-button" onClick={handleEdit}>
                                    <FaEdit /> Edit
                                </button>
                            )}
                        </div>

                        <div className="profile-info-grid">
                            <div className="profile-info-item">
                                <label>First Name</label>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        name="firstName"
                                        value={profileData.firstName}
                                        onChange={handleChange}
                                        className="profile-input"
                                        disabled={processing}
                                    />
                                ) : (
                                    <p>{profileData.firstName || 'Not set'}</p>
                                )}
                            </div>

                            <div className="profile-info-item">
                                <label>Last Name</label>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        name="lastName"
                                        value={profileData.lastName}
                                        onChange={handleChange}
                                        className="profile-input"
                                        disabled={processing}
                                    />
                                ) : (
                                    <p>{profileData.lastName || 'Not set'}</p>
                                )}
                            </div>

                            <div className="profile-info-item">
                                <label><FaEnvelope className="inline mr-2" />Email</label>
                                <p>{profileData.email}</p>
                                <small className="text-muted">Email cannot be changed</small>
                            </div>

                            <div className="profile-info-item">
                                <label>Phone Number</label>
                                {isEditing ? (
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={profileData.phone}
                                        onChange={handleChange}
                                        className="profile-input"
                                        placeholder="+1 (234) 567-8900"
                                        disabled={processing}
                                    />
                                ) : (
                                    <p>{profileData.phone || 'Not set'}</p>
                                )}
                            </div>

                            <div className="profile-info-item">
                                <label><FaCalendar className="inline mr-2" />Member Since</label>
                                <p>{formatDate(user.created_at)}</p>
                            </div>

                            <div className="profile-info-item">
                                <label><FaShieldAlt className="inline mr-2" />Email Verified</label>
                                <p className={user.email_confirmed_at ? 'text-success' : 'text-warning'}>
                                    {user.email_confirmed_at ? '✓ Verified' : '⚠ Not verified'}
                                </p>
                            </div>
                        </div>

                        {isEditing && (
                            <div className="profile-actions">
                                <button 
                                    className="save-button" 
                                    onClick={handleSave}
                                    disabled={processing}
                                >
                                    <FaSave className="inline mr-2" />
                                    {processing ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button 
                                    className="cancel-button" 
                                    onClick={handleCancel}
                                    disabled={processing}
                                >
                                    <FaTimes className="inline mr-2" />
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="profile-card">
                        <div className="profile-card-header">
                            <h2><FaLock className="inline mr-2" />Security</h2>
                        </div>

                        {!showPasswordChange ? (
                            <button 
                                className="change-password-button"
                                onClick={() => setShowPasswordChange(true)}
                            >
                                Change Password
                            </button>
                        ) : (
                            <div className="password-change-form">
                                <div className="form-group">
                                    <label>New Password</label>
                                    <input
                                        type="password"
                                        name="newPassword"
                                        value={passwordData.newPassword}
                                        onChange={handlePasswordChange}
                                        className="profile-input"
                                        placeholder="Enter new password"
                                        disabled={processing}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Confirm Password</label>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={passwordData.confirmPassword}
                                        onChange={handlePasswordChange}
                                        className="profile-input"
                                        placeholder="Confirm new password"
                                        disabled={processing}
                                    />
                                </div>
                                <div className="profile-actions">
                                    <button 
                                        className="save-button"
                                        onClick={handlePasswordUpdate}
                                        disabled={processing}
                                    >
                                        <FaSave className="inline mr-2" />
                                        {processing ? 'Updating...' : 'Update Password'}
                                    </button>
                                    <button 
                                        className="cancel-button"
                                        onClick={() => {
                                            setShowPasswordChange(false);
                                            setPasswordData({ newPassword: '', confirmPassword: '' });
                                        }}
                                        disabled={processing}
                                    >
                                        <FaTimes className="inline mr-2" />
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="profile-card danger-zone">
                        <div className="profile-card-header">
                            <h2><FaSignOutAlt className="inline mr-2" />Account Actions</h2>
                        </div>
                        <button 
                            className="logout-button"
                            onClick={handleLogout}
                            disabled={processing}
                        >
                            <FaSignOutAlt className="inline mr-2" />
                            {processing ? 'Logging out...' : 'Logout'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default withPageElements(SupabaseProfileDashboard);
