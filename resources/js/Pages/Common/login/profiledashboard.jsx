"use client"

import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext"
import supabase from "../../../lib/supabase"
import PhoneInputWithCountry from "../components/PhoneInputWithCountry"

export default function ProfilePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const { user, loading: authLoading, isAuthenticated, updateProfile, updatePassword } = useSupabaseAuth()

  const [processing, setProcessing] = useState(false)
  const [recentlySuccessful, setRecentlySuccessful] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)

  // Account Security states
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false)
  const [showConnectedAccountsModal, setShowConnectedAccountsModal] = useState(false)
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordUpdatedAt, setPasswordUpdatedAt] = useState(null)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorLoading, setTwoFactorLoading] = useState(false)
  const [twoFactorQR, setTwoFactorQR] = useState(null)
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [twoFactorError, setTwoFactorError] = useState('')
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
          } else {
            console.log('Session found on profile mount:', session.user.email)
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
        console.log('ProfilePage: No user found, waiting...')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        console.log('ProfilePage: Fetching user data for:', user.id, user.email)

        // Get data from Supabase auth user metadata
        const userMetadata = user.user_metadata || {}
        console.log('ProfilePage: User metadata:', userMetadata)

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
            last_sign_in: identity.last_sign_in_at
          }))
          setConnectedAccounts(accounts)
        }

        // Check MFA status
        try {
          const { data: factors, error: mfaError } = await supabase.auth.mfa.listFactors()
          if (!mfaError && factors && factors.totp && factors.totp.length > 0) {
            const verifiedFactor = factors.totp.find(f => f.status === 'verified')
            setTwoFactorEnabled(!!verifiedFactor)
          }
        } catch (mfaErr) {
          console.log('MFA check skipped:', mfaErr.message)
        }

        const savedUserData = localStorage.getItem('userData')
        let parsedSavedData = {}

        if (savedUserData) {
          try {
            parsedSavedData = JSON.parse(savedUserData)
            console.log('ProfilePage: Parsed localStorage data:', parsedSavedData)
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
            console.log('ProfilePage: User not found by ID, trying by email...')
            const { data: dbUserByEmail, error: emailError } = await supabase
              .from('users')
              .select('id, email, first_name, last_name, name')
              .eq('email', user.email)
              .single()

            if (!emailError && dbUserByEmail) {
              dbUser = dbUserByEmail
              dbError = null
            } else {
              console.log('ProfilePage: User not in database, creating...')
              const newUserData = {
                id: user.id,
                email: user.email,
                name: userMetadata.full_name || userMetadata.name || `${userMetadata.first_name || ''} ${userMetadata.last_name || ''}`.trim() || user.email,
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
                dbError = null
                console.log('ProfilePage: User created in database:', createdUser)
              } else {
                console.error('ProfilePage: Failed to create user in database:', createError)
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
          console.error('ProfilePage: Database fetch exception:', dbErr)
        }

        // Get localStorage user data
        const localStorageUser = localStorage.getItem('user')
        let parsedLocalUser = {}
        if (localStorageUser) {
          try {
            parsedLocalUser = JSON.parse(localStorageUser)
          } catch (e) {
            console.error('Failed to parse localStorage user:', e)
          }
        }

        // Merge data
        const mergedData = {
          first_name: dbUserData.first_name ||
            userMetadata.first_name ||
            parsedLocalUser.firstName ||
            parsedSavedData.first_name ||
            userMetadata.full_name?.split(' ')[0] ||
            '',
          last_name: dbUserData.last_name ||
            userMetadata.last_name ||
            parsedLocalUser.lastName ||
            parsedSavedData.last_name ||
            userMetadata.full_name?.split(' ')[1] ||
            '',
          email: dbUserData.email || user.email || parsedLocalUser.email || '',
          mobile_number: userMetadata.phone ||
            user.phone ||
            parsedSavedData.mobile_number ||
            '',
          date_of_birth: userMetadata.date_of_birth ||
            parsedSavedData.date_of_birth ||
            '',
          gender: userMetadata.gender ||
            parsedSavedData.gender ||
            'Male',
          profile_photo: parsedSavedData.profile_photo || null,
        }

        console.log('ProfilePage: Final merged data:', mergedData)
        setData(mergedData)
      } catch (error) {
        console.error('ProfilePage: Error fetching user data:', error)
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

      if (updateError) {
        throw updateError
      }

      // Update database users table
      if (user?.id) {
        const { error: dbError } = await supabase
          .from('users')
          .upsert({
            id: user.id,
            email: data.email,
            first_name: data.first_name,
            last_name: data.last_name,
            name: `${data.first_name} ${data.last_name}`,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'id'
          })

        if (dbError) {
          console.error('Database update error:', dbError)
        }
      }

      // Save to localStorage
      const dataToSave = { ...data }
      if (data.profile_photo) {
        delete dataToSave.profile_photo
      }
      localStorage.setItem('userData', JSON.stringify(dataToSave))

      setProcessing(false)
      setRecentlySuccessful(true)

      setTimeout(() => {
        setRecentlySuccessful(false)
      }, 3000)
    } catch (error) {
      console.error('Error updating profile:', error)
      setErrors({ submit: error.message || 'Failed to update profile. Please try again.' })
      setProcessing(false)
    }
  }

  // Password change handlers
  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (passwordData.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
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

      // Update password timestamp in user metadata
      await updateProfile({ password_updated_at: new Date().toISOString() })

      setPasswordSuccess('Password updated successfully!')
      setPasswordData({ newPassword: '', confirmPassword: '' })
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

  // 2FA handlers
  const handleEnableTwoFactor = async () => {
    setTwoFactorLoading(true)
    setTwoFactorError('')

    try {
      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App'
      })

      if (enrollError) {
        throw enrollError
      }

      setTwoFactorQR(enrollData.totp.qr_code)
      setTwoFactorSecret(enrollData.totp.secret)
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

    setTwoFactorLoading(true)
    setTwoFactorError('')

    try {
      // Get the current challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: twoFactorSecret
      })

      if (challengeError) {
        throw challengeError
      }

      // Verify the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: twoFactorSecret,
        challengeId: challengeData.id,
        code: verificationCode
      })

      if (verifyError) {
        throw verifyError
      }

      setTwoFactorEnabled(true)
      setTwoFactorQR(null)
      setVerificationCode('')
      setShowTwoFactorModal(false)
    } catch (error) {
      setTwoFactorError(error.message || 'Failed to verify code. Please try again.')
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

        if (error) {
          throw error
        }

        setTwoFactorEnabled(false)
        setShowTwoFactorModal(false)
      }
    } catch (error) {
      setTwoFactorError(error.message || 'Failed to disable 2FA')
    } finally {
      setTwoFactorLoading(false)
    }
  }

  // Helper function to format time ago
  const formatTimeAgo = (date) => {
    if (!date) return 'Never'
    const now = new Date()
    const diff = now - new Date(date)
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const months = Math.floor(days / 30)
    const years = Math.floor(months / 12)

    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
    return 'Today'
  }

  // Get provider icon
  const getProviderIcon = (provider) => {
    switch (provider) {
      case 'google':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        )
      default:
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f0f7fc] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#006d92]"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#f0f7fc] py-4 sm:py-6 md:py-8">
      <header className="container mx-auto px-4 sm:px-6 mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-[#006d92] hover:text-[#005a7a] transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="ml-2 font-medium">Back to Home</span>
        </button>
      </header>

      <form onSubmit={handleSubmit} encType="multipart/form-data" className="container mx-auto px-4 sm:px-6 max-w-4xl">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-8 text-center">My Profile</h1>

        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-100">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="flex flex-col items-center">
              {data.profile_photo ? (
                <div className="w-[100px] h-[100px] rounded-full overflow-hidden ring-4 ring-[#5aadd0]/20">
                  <img src={URL.createObjectURL(data.profile_photo)} alt="Profile" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-[100px] h-[100px] rounded-full bg-[#5aadd0] flex items-center justify-center text-white text-5xl font-semibold ring-4 ring-[#5aadd0]/20">
                  {data.first_name ? data.first_name[0].toUpperCase() : "S"}
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
              <button type="button" className="text-[#006d92] font-medium mt-3 text-sm hover:underline" onClick={() => fileInputRef.current?.click()}>
                Add Profile Photo
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : "Full Name"}</h2>
              <p className="text-gray-500 mt-1">{data.mobile_number || "+91XXXXXXXXXX"}</p>
              <p className="text-[#006d92] hover:underline cursor-pointer">{data.email || "email@example.com"}</p>
            </div>
          </div>
        </div>

        {/* Personal Info Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-100">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-6">Personal Information</h2>

          {/* Gender Buttons */}
          <div className="mb-6">
            <label className="block text-gray-600 text-sm mb-2">Gender</label>
            <div className="flex gap-3">
              {["Male", "Female", "Others"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${data.gender === value
                    ? "bg-[#006d92] text-white shadow-sm"
                    : "bg-white border border-gray-300 text-gray-600 hover:border-[#006d92] hover:text-[#006d92]"
                    }`}
                  onClick={() => setData({ ...data, gender: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {/* Input Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-gray-600 text-sm mb-2">Phone Number</label>
              <PhoneInputWithCountry
                value={data.mobile_number}
                onChange={handlePhoneChange}
                placeholder="Enter phone number"
                error={errors.mobile_number}
              />
            </div>
            <div>
              <label className="block text-gray-600 text-sm mb-2">Email</label>
              <input
                type="email"
                placeholder="email@example.com"
                value={data.email}
                onChange={(e) => setData({ ...data, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-[#006d92] focus:ring-1 focus:ring-[#006d92] outline-none transition-all"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-gray-600 text-sm mb-2">First Name</label>
              <input
                type="text"
                placeholder="First Name"
                value={data.first_name}
                onChange={(e) => setData({ ...data, first_name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-[#006d92] focus:ring-1 focus:ring-[#006d92] outline-none transition-all"
              />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="block text-gray-600 text-sm mb-2">Last Name</label>
              <input
                type="text"
                placeholder="Last Name"
                value={data.last_name}
                onChange={(e) => setData({ ...data, last_name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-[#006d92] focus:ring-1 focus:ring-[#006d92] outline-none transition-all"
              />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-gray-600 text-sm mb-2">Date of Birth</label>
              <input
                type="date"
                placeholder="Date of Birth"
                value={data.date_of_birth}
                onChange={(e) => setData({ ...data, date_of_birth: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-[#006d92] focus:ring-1 focus:ring-[#006d92] outline-none transition-all"
              />
              {errors.date_of_birth && <p className="text-red-500 text-xs mt-1">{errors.date_of_birth}</p>}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              type="submit"
              disabled={processing}
              className="px-8 py-2.5 bg-[#006d92] text-white rounded-lg font-medium hover:bg-[#005a7a] transition-all disabled:opacity-50 shadow-sm"
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
              className="px-8 py-2.5 bg-white border border-gray-300 text-[#006d92] rounded-lg font-medium hover:bg-gray-50 transition-all"
            >
              Reset Form
            </button>
          </div>

          {recentlySuccessful && (
            <div className="mt-4 bg-green-50 p-3 rounded-lg border border-green-200">
              <p className="text-green-600 text-sm font-medium">Profile updated successfully!</p>
            </div>
          )}
          {errors.submit && (
            <div className="mt-4 bg-red-50 p-3 rounded-lg border border-red-200">
              <p className="text-red-600 text-sm font-medium">{errors.submit}</p>
            </div>
          )}
        </div>

        {/* Account Security Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-100">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-5">Account Security</h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <div>
                <h3 className="font-medium text-gray-800">Password</h3>
                <p className="text-sm text-gray-500">Last updated {formatTimeAgo(passwordUpdatedAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="text-[#006d92] font-medium hover:underline text-sm"
              >
                Change Password
              </button>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <div>
                <h3 className="font-medium text-gray-800">Two-factor Authentication</h3>
                <p className="text-sm text-gray-500">
                  {twoFactorEnabled
                    ? '✓ Enabled - Your account is protected with 2FA'
                    : 'Add an extra layer of security to your account'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTwoFactorModal(true)}
                className={`font-medium hover:underline text-sm ${twoFactorEnabled ? 'text-green-600' : 'text-[#006d92]'}`}
              >
                {twoFactorEnabled ? 'Manage' : 'Enable'}
              </button>
            </div>

            <div className="flex justify-between items-center py-3">
              <div>
                <h3 className="font-medium text-gray-800">Connected Accounts</h3>
                <p className="text-sm text-gray-500">
                  {connectedAccounts.length > 0
                    ? `${connectedAccounts.length} account${connectedAccounts.length > 1 ? 's' : ''} linked`
                    : 'Link your social accounts for easier login'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectedAccountsModal(true)}
                className="text-[#006d92] font-medium hover:underline text-sm"
              >
                Manage
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">Change Password</h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false)
                  setPasswordData({ newPassword: '', confirmPassword: '' })
                  setPasswordError('')
                  setPasswordSuccess('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-600 text-sm mb-2">New Password</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="Enter new password"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-[#006d92] focus:ring-1 focus:ring-[#006d92] outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
                </div>
                <div>
                  <label className="block text-gray-600 text-sm mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-[#006d92] focus:ring-1 focus:ring-[#006d92] outline-none"
                  />
                </div>
              </div>

              {passwordError && (
                <div className="mt-4 bg-red-50 p-3 rounded-lg border border-red-200">
                  <p className="text-red-600 text-sm">{passwordError}</p>
                </div>
              )}

              {passwordSuccess && (
                <div className="mt-4 bg-green-50 p-3 rounded-lg border border-green-200">
                  <p className="text-green-600 text-sm">{passwordSuccess}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 px-6 py-2.5 bg-[#006d92] text-white rounded-lg font-medium hover:bg-[#005a7a] transition-all disabled:opacity-50"
                >
                  {processing ? 'Updating...' : 'Update Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false)
                    setPasswordData({ newPassword: '', confirmPassword: '' })
                    setPasswordError('')
                  }}
                  className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Two-Factor Authentication Modal */}
      {showTwoFactorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">Two-Factor Authentication</h3>
              <button
                onClick={() => {
                  setShowTwoFactorModal(false)
                  setTwoFactorQR(null)
                  setVerificationCode('')
                  setTwoFactorError('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {twoFactorEnabled ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-800 mb-2">2FA is Enabled</h4>
                <p className="text-gray-500 text-sm mb-6">Your account is protected with two-factor authentication.</p>
                <button
                  onClick={handleDisableTwoFactor}
                  disabled={twoFactorLoading}
                  className="px-6 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {twoFactorLoading ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            ) : twoFactorQR ? (
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-4">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
                <div className="bg-white p-4 rounded-lg inline-block mb-4 border">
                  <img src={twoFactorQR} alt="2FA QR Code" className="w-48 h-48" />
                </div>
                <div className="mb-4">
                  <label className="block text-gray-600 text-sm mb-2">Enter verification code</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-32 px-4 py-3 border border-gray-200 rounded-lg text-center text-xl tracking-widest focus:border-[#006d92] outline-none mx-auto"
                    maxLength={6}
                  />
                </div>
                {twoFactorError && (
                  <div className="mb-4 bg-red-50 p-3 rounded-lg border border-red-200">
                    <p className="text-red-600 text-sm">{twoFactorError}</p>
                  </div>
                )}
                <button
                  onClick={handleVerifyTwoFactor}
                  disabled={twoFactorLoading || verificationCode.length !== 6}
                  className="px-6 py-2.5 bg-[#006d92] text-white rounded-lg font-medium hover:bg-[#005a7a] transition-all disabled:opacity-50"
                >
                  {twoFactorLoading ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#006d92" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-800 mb-2">Protect Your Account</h4>
                <p className="text-gray-500 text-sm mb-6">Enable two-factor authentication for an extra layer of security. You'll need an authenticator app like Google Authenticator.</p>
                {twoFactorError && (
                  <div className="mb-4 bg-red-50 p-3 rounded-lg border border-red-200">
                    <p className="text-red-600 text-sm">{twoFactorError}</p>
                  </div>
                )}
                <button
                  onClick={handleEnableTwoFactor}
                  disabled={twoFactorLoading}
                  className="px-6 py-2.5 bg-[#006d92] text-white rounded-lg font-medium hover:bg-[#005a7a] transition-all disabled:opacity-50"
                >
                  {twoFactorLoading ? 'Setting up...' : 'Set Up 2FA'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connected Accounts Modal */}
      {showConnectedAccountsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">Connected Accounts</h3>
              <button
                onClick={() => setShowConnectedAccountsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {connectedAccounts.length > 0 ? (
              <div className="space-y-3">
                {connectedAccounts.map((account, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {getProviderIcon(account.provider)}
                      <div>
                        <p className="font-medium text-gray-800 capitalize">{account.provider}</p>
                        <p className="text-sm text-gray-500">{account.email}</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                      Connected
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-800 mb-2">No Connected Accounts</h4>
                <p className="text-gray-500 text-sm">You haven't linked any social accounts yet. Sign in with Google to link your account.</p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowConnectedAccountsModal(false)}
                className="w-full px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}