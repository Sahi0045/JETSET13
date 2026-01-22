"use client"

import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext"
import supabase from "../../../lib/supabase"

export default function ProfilePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const { user, loading: authLoading, isAuthenticated, updateProfile } = useSupabaseAuth()

  const [processing, setProcessing] = useState(false)
  const [recentlySuccessful, setRecentlySuccessful] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)

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
        // Try to refresh the session from Supabase
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

  // Fetch user data from Supabase and database
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

        // Try to fetch from database users table (only columns that exist)
        let dbUserData = {}
        try {
          // First try by ID (Supabase auth user ID)
          let { data: dbUser, error: dbError } = await supabase
            .from('users')
            .select('id, email, first_name, last_name, name')
            .eq('id', user.id)
            .single()

          // If not found by ID, try by email
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
              // User doesn't exist in database, create them
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

          console.log('ProfilePage: Database query result:', { dbUser, dbError })

          if (!dbError && dbUser) {
            dbUserData = {
              first_name: dbUser.first_name || dbUser.name?.split(' ')[0] || '',
              last_name: dbUser.last_name || dbUser.name?.split(' ')[1] || '',
              email: dbUser.email || user.email || '',
            }
            console.log('ProfilePage: Extracted dbUserData:', dbUserData)
          } else if (dbError) {
            console.log('ProfilePage: Database error:', dbError.message)
          }
        } catch (dbErr) {
          console.error('ProfilePage: Database fetch exception:', dbErr)
        }

        // Get localStorage user data (from auth context)
        const localStorageUser = localStorage.getItem('user')
        let parsedLocalUser = {}
        if (localStorageUser) {
          try {
            parsedLocalUser = JSON.parse(localStorageUser)
            console.log('ProfilePage: Parsed localStorage user:', parsedLocalUser)
          } catch (e) {
            console.error('Failed to parse localStorage user:', e)
          }
        }

        // Merge data: database > Supabase metadata > localStorage user > saved localStorage > defaults
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
      // User is not authenticated and auth is done loading
      setLoading(false)
    }
  }, [user, authLoading])

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setData({ ...data, profile_photo: file })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setProcessing(true)
    setErrors({})

    // Validate form
    const newErrors = {}
    if (!data.first_name) newErrors.first_name = "First name is required"
    if (!data.email) newErrors.email = "Email is required"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setProcessing(false)
      return
    }

    try {
      // Update Supabase auth user metadata
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

      // Update database users table (only columns that exist)
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
          // Don't throw, just log - auth update succeeded
        } else {
          console.log('Database user updated successfully')
        }
      }

      // Save to localStorage for quick access
      const dataToSave = { ...data }
      if (data.profile_photo) {
        // Don't try to stringify the File object
        delete dataToSave.profile_photo
      }
      localStorage.setItem('userData', JSON.stringify(dataToSave))

      setProcessing(false)
      setRecentlySuccessful(true)

      // Reset success message after a delay
      setTimeout(() => {
        setRecentlySuccessful(false)
      }, 3000)
    } catch (error) {
      console.error('Error updating profile:', error)
      setErrors({ submit: error.message || 'Failed to update profile. Please try again.' })
      setProcessing(false)
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
    return null // Will redirect
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
              <input
                type="text"
                placeholder="+91XXXXXXXXXX"
                value={data.mobile_number}
                onChange={(e) => setData({ ...data, mobile_number: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-[#006d92] focus:ring-1 focus:ring-[#006d92] outline-none transition-all"
              />
              {errors.mobile_number && <p className="text-red-500 text-xs mt-1">{errors.mobile_number}</p>}
            </div>
            <div>
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
                <p className="text-sm text-gray-500">Last updated 3 months ago</p>
              </div>
              <button type="button" className="text-[#006d92] font-medium hover:underline text-sm">
                Change Password
              </button>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <div>
                <h3 className="font-medium text-gray-800">Two-factor Authentication</h3>
                <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
              </div>
              <button type="button" className="text-[#006d92] font-medium hover:underline text-sm">
                Enable
              </button>
            </div>

            <div className="flex justify-between items-center py-3">
              <div>
                <h3 className="font-medium text-gray-800">Connected Accounts</h3>
                <p className="text-sm text-gray-500">Link your social accounts for easier login</p>
              </div>
              <button type="button" className="text-[#006d92] font-medium hover:underline text-sm">
                Manage
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}