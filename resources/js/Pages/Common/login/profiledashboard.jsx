"use client"

import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext"
import supabase from "../../../lib/supabase"
import PhoneInputWithCountry from "../components/PhoneInputWithCountry"
import './profile.css'

export default function ProfilePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const { user, loading: authLoading, isAuthenticated, updateProfile, updatePassword } = useSupabaseAuth()

  const [processing, setProcessing] = useState(false)
  const [recentlySuccessful, setRecentlySuccessful] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('profile')

  // Account Security states
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false)
  const [showConnectedAccountsModal, setShowConnectedAccountsModal] = useState(false)
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordUpdatedAt, setPasswordUpdatedAt] = useState(null)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorLoading, setTwoFactorLoading] = useState(false)
  const [twoFactorQR, setTwoFactorQR] = useState(null)
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorFactorId, setTwoFactorFactorId] = useState(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [twoFactorError, setTwoFactorError] = useState('')
  const [twoFactorSuccess, setTwoFactorSuccess] = useState('')
  const [connectedAccounts, setConnectedAccounts] = useState([])

  const [data, setData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile_number: "",
    date_of_birth: "",
    gender: "Male",
    profile_photo: null,
  })

  // Check and refresh session if needed
  useEffect(() => {
    const checkAndRefreshSession = async () => {
      if (!authLoading && !user) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession()
          if (error || !session) {
            console.log('No valid session, redirecting to login')
            navigate('/supabase-login', { replace: true })
          }
        } catch (err) {
          console.error('Error checking session:', err)
          navigate('/supabase-login', { replace: true })
        }
      }
    }
    checkAndRefreshSession()
  }, [authLoading, user, navigate])

  // Fetch user data and security info
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const userMetadata = user.user_metadata || {}

        // Get password last updated timestamp
        if (userMetadata.password_updated_at) {
          setPasswordUpdatedAt(new Date(userMetadata.password_updated_at))
        } else if (user.updated_at) {
          setPasswordUpdatedAt(new Date(user.updated_at))
        }

        // Check connected accounts (OAuth identities)
        if (user.identities && user.identities.length > 0) {
          const accounts = user.identities.map(identity => ({
            provider: identity.provider,
            email: identity.identity_data?.email || user.email,
            created_at: identity.created_at,
            last_sign_in: identity.last_sign_in_at,
            avatar: identity.identity_data?.avatar_url || identity.identity_data?.picture
          }))
          setConnectedAccounts(accounts)
        }

        // Check MFA status
        try {
          const { data: factors, error: mfaError } = await supabase.auth.mfa.listFactors()
          if (!mfaError && factors && factors.totp && factors.totp.length > 0) {
            const verifiedFactor = factors.totp.find(f => f.status === 'verified')
            if (verifiedFactor) {
              setTwoFactorEnabled(true)
              setTwoFactorFactorId(verifiedFactor.id)
            }
          }
        } catch (mfaErr) {
          console.log('MFA check skipped:', mfaErr.message)
        }

        const savedUserData = localStorage.getItem('userData')
        let parsedSavedData = {}

        if (savedUserData) {
          try {
            parsedSavedData = JSON.parse(savedUserData)
          } catch (e) {
            console.error("Failed to parse user data from localStorage", e)
          }
        }

        // Try to fetch from database users table
        let dbUserData = {}
        try {
          let { data: dbUser, error: dbError } = await supabase
            .from('users')
            .select('id, email, first_name, last_name, name')
            .eq('id', user.id)
            .single()

          if (dbError && dbError.code === 'PGRST116') {
            const { data: dbUserByEmail, error: emailError } = await supabase
              .from('users')
              .select('id, email, first_name, last_name, name')
              .eq('email', user.email)
              .single()

            if (!emailError && dbUserByEmail) {
              dbUser = dbUserByEmail
              dbError = null
            } else {
              const newUserData = {
                id: user.id,
                email: user.email,
                name: userMetadata.full_name || `${userMetadata.first_name || ''} ${userMetadata.last_name || ''}`.trim() || user.email,
                first_name: userMetadata.first_name || userMetadata.full_name?.split(' ')[0] || '',
                last_name: userMetadata.last_name || userMetadata.full_name?.split(' ')[1] || '',
                role: userMetadata.role || 'user',
              }

              const { data: createdUser, error: createError } = await supabase
                .from('users')
                .insert(newUserData)
                .select()
                .single()

              if (!createError && createdUser) {
                dbUser = createdUser
              }
            }
          }

          if (!dbError && dbUser) {
            dbUserData = {
              first_name: dbUser.first_name || dbUser.name?.split(' ')[0] || '',
              last_name: dbUser.last_name || dbUser.name?.split(' ')[1] || '',
              email: dbUser.email || user.email || '',
            }
          }
        } catch (dbErr) {
          console.error('Database fetch exception:', dbErr)
        }

        const localStorageUser = localStorage.getItem('user')
        let parsedLocalUser = {}
        if (localStorageUser) {
          try {
            parsedLocalUser = JSON.parse(localStorageUser)
          } catch (e) { }
        }

        const mergedData = {
          first_name: dbUserData.first_name || userMetadata.first_name || parsedLocalUser.firstName || parsedSavedData.first_name || userMetadata.full_name?.split(' ')[0] || '',
          last_name: dbUserData.last_name || userMetadata.last_name || parsedLocalUser.lastName || parsedSavedData.last_name || userMetadata.full_name?.split(' ')[1] || '',
          email: dbUserData.email || user.email || parsedLocalUser.email || '',
          mobile_number: userMetadata.phone || user.phone || parsedSavedData.mobile_number || '',
          date_of_birth: userMetadata.date_of_birth || parsedSavedData.date_of_birth || '',
          gender: userMetadata.gender || parsedSavedData.gender || 'Male',
          profile_photo: parsedSavedData.profile_photo || null,
        }

        setData(mergedData)
      } catch (error) {
        console.error('Error fetching user data:', error)
        setErrors({ fetch: 'Failed to load profile data. Please refresh the page.' })
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchUserData()
    } else if (!authLoading) {
      setLoading(false)
    }
  }, [user, authLoading])

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setData({ ...data, profile_photo: file })
    }
  }

  const handlePhoneChange = (phoneNumber) => {
    setData({ ...data, mobile_number: phoneNumber })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setProcessing(true)
    setErrors({})

    const newErrors = {}
    if (!data.first_name) newErrors.first_name = "First name is required"
    if (!data.email) newErrors.email = "Email is required"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setProcessing(false)
      return
    }

    try {
      const metadataUpdates = {
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name} ${data.last_name}`,
        phone: data.mobile_number,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
      }

      const { error: updateError } = await updateProfile(metadataUpdates)
      if (updateError) throw updateError

      if (user?.id) {
        await supabase.from('users').upsert({
          id: user.id,
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          name: `${data.first_name} ${data.last_name}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      }

      const dataToSave = { ...data }
      delete dataToSave.profile_photo
      localStorage.setItem('userData', JSON.stringify(dataToSave))

      setProcessing(false)
      setRecentlySuccessful(true)
      setTimeout(() => setRecentlySuccessful(false), 3000)
    } catch (error) {
      setErrors({ submit: error.message || 'Failed to update profile.' })
      setProcessing(false)
    }
  }

  // Password handlers
  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (passwordData.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (!/[A-Z]/.test(passwordData.newPassword)) {
      setPasswordError('Password must contain at least one uppercase letter')
      return
    }
    if (!/[0-9]/.test(passwordData.newPassword)) {
      setPasswordError('Password must contain at least one number')
      return
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setProcessing(true)

    try {
      const { error } = await updatePassword(passwordData.newPassword)
      if (error) {
        setPasswordError(error.message || 'Failed to update password')
        setProcessing(false)
        return
      }

      await updateProfile({ password_updated_at: new Date().toISOString() })
      setPasswordSuccess('Password updated successfully!')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordUpdatedAt(new Date())

      setTimeout(() => {
        setShowPasswordModal(false)
        setPasswordSuccess('')
      }, 2000)
    } catch (error) {
      setPasswordError('An error occurred while updating your password')
    } finally {
      setProcessing(false)
    }
  }

  // 2FA handlers with backend validation
  const handleEnableTwoFactor = async () => {
    setTwoFactorLoading(true)
    setTwoFactorError('')
    setTwoFactorSuccess('')
    setVerificationCode('')

    try {
      console.log('Starting MFA enrollment...')

      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App'
      })

      if (enrollError) {
        console.error('MFA enrollment error:', enrollError)
        throw enrollError
      }

      console.log('MFA enrollment successful:', {
        factorId: enrollData.id,
        hasQrCode: !!enrollData.totp?.qr_code,
        hasSecret: !!enrollData.totp?.secret
      })

      if (!enrollData.totp?.qr_code) {
        throw new Error('QR code not generated. Please try again.')
      }

      setTwoFactorQR(enrollData.totp.qr_code)
      setTwoFactorSecret(enrollData.totp.secret)
      setTwoFactorFactorId(enrollData.id)

      console.log('Factor ID saved:', enrollData.id)
    } catch (error) {
      console.error('MFA enrollment error:', error)
      setTwoFactorError(error.message || 'Two-factor authentication is not available. Please contact support.')
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const handleVerifyTwoFactor = async () => {
    if (verificationCode.length !== 6) {
      setTwoFactorError('Please enter a 6-digit verification code')
      return
    }

    if (!twoFactorFactorId) {
      setTwoFactorError('No factor ID found. Please try enabling 2FA again.')
      return
    }

    setTwoFactorLoading(true)
    setTwoFactorError('')

    try {
      console.log('Starting 2FA verification with factorId:', twoFactorFactorId)

      // Step 1: Create a challenge for the enrolled factor
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: twoFactorFactorId
      })

      if (challengeError) {
        console.error('Challenge error:', challengeError)
        throw new Error(challengeError.message || 'Failed to create verification challenge')
      }

      console.log('Challenge created:', challengeData.id)

      // Step 2: Verify the TOTP code against the challenge
      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId: twoFactorFactorId,
        challengeId: challengeData.id,
        code: verificationCode
      })

      if (verifyError) {
        console.error('Verify error:', verifyError)
        // Provide more helpful error messages
        if (verifyError.message.includes('invalid') || verifyError.message.includes('expired')) {
          throw new Error('Invalid or expired code. Please enter the current code from your authenticator app.')
        }
        throw new Error(verifyError.message || 'Verification failed')
      }

      console.log('2FA verification successful:', verifyData)

      // Update user metadata to track 2FA status
      try {
        await updateProfile({
          mfa_enabled: true,
          mfa_enabled_at: new Date().toISOString()
        })
      } catch (profileError) {
        console.warn('Could not update profile metadata:', profileError)
        // Don't fail if metadata update fails - 2FA is still enabled
      }

      setTwoFactorEnabled(true)
      setTwoFactorQR(null)
      setTwoFactorSecret('')
      setVerificationCode('')
      setTwoFactorSuccess('Two-factor authentication enabled successfully!')

      setTimeout(() => {
        setShowTwoFactorModal(false)
        setTwoFactorSuccess('')
      }, 2500)
    } catch (error) {
      console.error('2FA verification error:', error)
      setTwoFactorError(error.message || 'Invalid verification code. Please try again.')
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const handleDisableTwoFactor = async () => {
    setTwoFactorLoading(true)
    setTwoFactorError('')

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (factors && factors.totp && factors.totp.length > 0) {
        const factorId = factors.totp[0].id
        const { error } = await supabase.auth.mfa.unenroll({ factorId })

        if (error) throw error

        await updateProfile({ mfa_enabled: false })
        setTwoFactorEnabled(false)
        setTwoFactorSuccess('Two-factor authentication disabled successfully!')

        setTimeout(() => {
          setShowTwoFactorModal(false)
          setTwoFactorSuccess('')
        }, 2000)
      }
    } catch (error) {
      setTwoFactorError(error.message || 'Failed to disable 2FA')
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const formatTimeAgo = (date) => {
    if (!date) return 'Never updated'
    const now = new Date()
    const diff = now - new Date(date)
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const months = Math.floor(days / 30)
    const years = Math.floor(months / 12)

    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    return 'Just now'
  }

  const getProviderIcon = (provider) => {
    if (provider === 'google') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      )
    }
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    )
  }

  if (authLoading || loading) {
    return (
      <div className="profile-loading-container">
        <div className="profile-loading-spinner">
          <div className="spinner-ring"></div>
          <p>Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  const sidebarItems = [
    { id: 'profile', label: 'Personal Information', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
    { id: 'security', label: 'Account Security', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4' },
    { id: 'preferences', label: 'Preferences', icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' },
  ]

  return (
    <div className="profile-dashboard">
      {/* Header */}
      <header className="profile-header">
        <div className="header-content">
          <button onClick={() => navigate('/')} className="back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Home</span>
          </button>
          <div className="header-title">
            <h1>Account Settings</h1>
            <p>Manage your profile and security preferences</p>
          </div>
        </div>
      </header>

      <div className="profile-main">
        {/* Sidebar */}
        <aside className="profile-sidebar">
          <div className="sidebar-profile-card">
            <div className="profile-avatar-container">
              {data.profile_photo ? (
                <img src={URL.createObjectURL(data.profile_photo)} alt="Profile" className="profile-avatar" />
              ) : (
                <div className="profile-avatar-placeholder">
                  {data.first_name ? data.first_name[0].toUpperCase() : user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <button className="avatar-edit-btn" onClick={() => fileInputRef.current?.click()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
            </div>
            <h3 className="profile-name">{data.first_name} {data.last_name || ''}</h3>
            <p className="profile-email">{data.email}</p>
            <div className="profile-status">
              <span className="status-badge verified">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified Account
              </span>
            </div>
          </div>

          <nav className="sidebar-nav">
            {sidebarItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="profile-content">
          {/* Personal Information Section */}
          {activeSection === 'profile' && (
            <form onSubmit={handleSubmit} className="content-section">
              <div className="section-header">
                <div className="section-title-group">
                  <h2>Personal Information</h2>
                  <p>Update your personal details and contact information</p>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>First Name <span className="required">*</span></label>
                  <input
                    type="text"
                    value={data.first_name}
                    onChange={(e) => setData({ ...data, first_name: e.target.value })}
                    placeholder="Enter first name"
                    className={errors.first_name ? 'error' : ''}
                  />
                  {errors.first_name && <span className="error-text">{errors.first_name}</span>}
                </div>

                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={data.last_name}
                    onChange={(e) => setData({ ...data, last_name: e.target.value })}
                    placeholder="Enter last name"
                  />
                </div>

                <div className="form-group">
                  <label>Email Address <span className="required">*</span></label>
                  <input
                    type="email"
                    value={data.email}
                    onChange={(e) => setData({ ...data, email: e.target.value })}
                    placeholder="Enter email"
                    className={errors.email ? 'error' : ''}
                  />
                  {errors.email && <span className="error-text">{errors.email}</span>}
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <PhoneInputWithCountry
                    value={data.mobile_number}
                    onChange={handlePhoneChange}
                    placeholder="Enter phone number"
                    error={errors.mobile_number}
                  />
                </div>

                <div className="form-group">
                  <label>Date of Birth</label>
                  <input
                    type="date"
                    value={data.date_of_birth}
                    onChange={(e) => setData({ ...data, date_of_birth: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Gender</label>
                  <div className="gender-selector">
                    {['Male', 'Female', 'Other'].map(gender => (
                      <button
                        key={gender}
                        type="button"
                        className={`gender-btn ${data.gender === gender ? 'active' : ''}`}
                        onClick={() => setData({ ...data, gender })}
                      >
                        {gender}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {recentlySuccessful && (
                <div className="alert success">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Profile updated successfully!
                </div>
              )}

              {errors.submit && (
                <div className="alert error">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {errors.submit}
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={processing}>
                  {processing ? (
                    <>
                      <span className="btn-spinner"></span>
                      Saving...
                    </>
                  ) : 'Save Changes'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <div className="content-section">
              <div className="section-header">
                <div className="section-title-group">
                  <h2>Account Security</h2>
                  <p>Manage your password and security settings</p>
                </div>
              </div>

              <div className="security-cards">
                {/* Password Card */}
                <div className="security-card">
                  <div className="security-card-icon password">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="security-card-content">
                    <h3>Password</h3>
                    <p className="security-meta">Last updated {formatTimeAgo(passwordUpdatedAt)}</p>
                    <p className="security-desc">Keep your account secure with a strong password</p>
                  </div>
                  <button className="btn-action" onClick={() => setShowPasswordModal(true)}>
                    Change Password
                  </button>
                </div>

                {/* 2FA Card */}
                <div className="security-card">
                  <div className={`security-card-icon ${twoFactorEnabled ? 'enabled' : 'disabled'}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      {twoFactorEnabled && <polyline points="9 12 12 15 16 10" />}
                    </svg>
                  </div>
                  <div className="security-card-content">
                    <h3>Two-Factor Authentication</h3>
                    <p className="security-meta">
                      Status: <span className={twoFactorEnabled ? 'status-on' : 'status-off'}>
                        {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </p>
                    <p className="security-desc">Add an extra layer of security using an authenticator app</p>
                  </div>
                  <button className={`btn-action ${twoFactorEnabled ? 'manage' : 'enable'}`} onClick={() => setShowTwoFactorModal(true)}>
                    {twoFactorEnabled ? 'Manage' : 'Enable'}
                  </button>
                </div>

                {/* Connected Accounts Card */}
                <div className="security-card">
                  <div className="security-card-icon accounts">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="security-card-content">
                    <h3>Connected Accounts</h3>
                    <p className="security-meta">{connectedAccounts.length} account{connectedAccounts.length !== 1 ? 's' : ''} linked</p>
                    <p className="security-desc">Manage your social login connections</p>
                  </div>
                  <button className="btn-action" onClick={() => setShowConnectedAccountsModal(true)}>
                    Manage
                  </button>
                </div>
              </div>

              {/* Security Tips */}
              <div className="security-tips">
                <h4>Security Recommendations</h4>
                <ul>
                  <li className={passwordUpdatedAt && (new Date() - passwordUpdatedAt) < 90 * 24 * 60 * 60 * 1000 ? 'checked' : ''}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Update your password regularly (every 90 days)
                  </li>
                  <li className={twoFactorEnabled ? 'checked' : ''}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Enable two-factor authentication
                  </li>
                  <li className="checked">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Use a unique password for this account
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Preferences Section */}
          {activeSection === 'preferences' && (
            <div className="content-section">
              <div className="section-header">
                <div className="section-title-group">
                  <h2>Preferences</h2>
                  <p>Customize your experience and notifications</p>
                </div>
              </div>

              <div className="preferences-grid">
                <div className="preference-card">
                  <h4>Email Notifications</h4>
                  <p>Receive updates about your bookings and offers</p>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="preference-card">
                  <h4>SMS Notifications</h4>
                  <p>Get important alerts via text message</p>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="preference-card">
                  <h4>Marketing Emails</h4>
                  <p>Receive promotional offers and deals</p>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Password</h3>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="modal-body">
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="Enter new password"
                />
                <small className="input-hint">Min 8 characters, 1 uppercase, 1 number</small>
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                />
              </div>

              {passwordError && <div className="alert error">{passwordError}</div>}
              {passwordSuccess && <div className="alert success">{passwordSuccess}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={processing}>
                  {processing ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA Modal */}
      {showTwoFactorModal && (
        <div className="modal-overlay" onClick={() => setShowTwoFactorModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Two-Factor Authentication</h3>
              <button className="modal-close" onClick={() => setShowTwoFactorModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {twoFactorEnabled ? (
                <div className="two-factor-enabled">
                  <div className="success-icon-large">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <polyline points="9 12 12 15 16 10" />
                    </svg>
                  </div>
                  <h4>2FA is Enabled</h4>
                  <p>Your account is protected with two-factor authentication.</p>

                  {twoFactorSuccess && <div className="alert success">{twoFactorSuccess}</div>}
                  {twoFactorError && <div className="alert error">{twoFactorError}</div>}

                  <button className="btn-danger" onClick={handleDisableTwoFactor} disabled={twoFactorLoading}>
                    {twoFactorLoading ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                </div>
              ) : twoFactorQR ? (
                <div className="two-factor-setup">
                  <div className="setup-steps">
                    <div className="step">
                      <span className="step-number">1</span>
                      <p>Download an authenticator app like Google Authenticator or Authy</p>
                    </div>
                    <div className="step">
                      <span className="step-number">2</span>
                      <p>Scan the QR code below with your authenticator app</p>
                    </div>
                  </div>

                  <div className="qr-container">
                    <img src={twoFactorQR} alt="2FA QR Code" className="qr-code" />
                    <p className="secret-code">Secret: <code>{twoFactorSecret}</code></p>
                  </div>

                  <div className="step">
                    <span className="step-number">3</span>
                    <p>Enter the 6-digit code from your app to verify</p>
                  </div>

                  <div className="verification-input">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="code-input"
                    />
                  </div>

                  {twoFactorError && <div className="alert error">{twoFactorError}</div>}
                  {twoFactorSuccess && <div className="alert success">{twoFactorSuccess}</div>}

                  <div className="modal-actions">
                    <button className="btn-secondary" onClick={() => { setTwoFactorQR(null); setVerificationCode(''); }}>
                      Back
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleVerifyTwoFactor}
                      disabled={twoFactorLoading || verificationCode.length !== 6}
                    >
                      {twoFactorLoading ? 'Verifying...' : 'Verify & Enable'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="two-factor-intro">
                  <div className="intro-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <h4>Protect Your Account</h4>
                  <p>Two-factor authentication adds an extra layer of security to your account. You'll need to enter a code from your authenticator app each time you sign in.</p>

                  <div className="benefits">
                    <div className="benefit">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Prevent unauthorized access</span>
                    </div>
                    <div className="benefit">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Secure your bookings and payments</span>
                    </div>
                    <div className="benefit">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Industry-standard security</span>
                    </div>
                  </div>

                  {twoFactorError && <div className="alert error">{twoFactorError}</div>}

                  <button className="btn-primary btn-large" onClick={handleEnableTwoFactor} disabled={twoFactorLoading}>
                    {twoFactorLoading ? 'Setting up...' : 'Set Up Two-Factor Authentication'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connected Accounts Modal */}
      {showConnectedAccountsModal && (
        <div className="modal-overlay" onClick={() => setShowConnectedAccountsModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Connected Accounts</h3>
              <button className="modal-close" onClick={() => setShowConnectedAccountsModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {connectedAccounts.length > 0 ? (
                <div className="connected-accounts-list">
                  {connectedAccounts.map((account, index) => (
                    <div key={index} className="connected-account">
                      <div className="account-provider">
                        {getProviderIcon(account.provider)}
                      </div>
                      <div className="account-info">
                        <h4 className="capitalize">{account.provider}</h4>
                        <p>{account.email}</p>
                      </div>
                      <span className="connected-badge">Connected</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-accounts">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <h4>No Connected Accounts</h4>
                  <p>You haven't linked any social accounts yet. Sign in with Google to link your account.</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowConnectedAccountsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}