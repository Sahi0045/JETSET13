import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import supabase from '../../../lib/supabase';
import { FaUser, FaPhone, FaCalendar, FaSpinner } from 'react-icons/fa';

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useSupabaseAuth();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  
  const [data, setData] = useState({
    first_name: '',
    last_name: '',
    mobile_number: '',
    date_of_birth: '',
    gender: 'Male',
  });

  // Check if user is authenticated and if profile is already complete
  useEffect(() => {
    const checkProfileStatus = async () => {
      if (!authLoading && !isAuthenticated) {
        navigate('/supabase-login', { replace: true });
        return;
      }

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Pre-fill with user metadata if available
        const userMetadata = user.user_metadata || {};
        
        // Check if user exists in database
        const { data: dbUser, error: dbError } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .eq('id', user.id)
          .single();

        // If user has complete profile in database, redirect to my-trips
        if (!dbError && dbUser && dbUser.first_name && dbUser.last_name) {
          console.log('Profile already complete, redirecting...');
          navigate('/my-trips', { replace: true });
          return;
        }

        // Pre-fill form with available data
        setData({
          first_name: userMetadata.first_name || userMetadata.full_name?.split(' ')[0] || '',
          last_name: userMetadata.last_name || userMetadata.full_name?.split(' ')[1] || '',
          mobile_number: userMetadata.phone || user.phone || '',
          date_of_birth: userMetadata.date_of_birth || '',
          gender: userMetadata.gender || 'Male',
        });
      } catch (error) {
        console.error('Error checking profile status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkProfileStatus();
  }, [user, authLoading, isAuthenticated, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!data.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    
    if (!data.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    
    if (!data.mobile_number.trim()) {
      newErrors.mobile_number = 'Mobile number is required';
    } else if (!/^[0-9]{10}$/.test(data.mobile_number.trim())) {
      newErrors.mobile_number = 'Please enter a valid 10-digit mobile number';
    }
    
    if (!data.date_of_birth) {
      newErrors.date_of_birth = 'Date of birth is required';
    } else {
      // Check if user is at least 18 years old
      const dob = new Date(data.date_of_birth);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      
      if (age < 18) {
        newErrors.date_of_birth = 'You must be at least 18 years old';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setProcessing(true);
    setErrors({});
    setSuccessMessage('');
    
    try {
      // Update Supabase auth user metadata
      const metadataUpdates = {
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name} ${data.last_name}`,
        phone: data.mobile_number,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        profile_completed: true,
      };

      const { error: updateError } = await supabase.auth.updateUser({
        data: metadataUpdates
      });
      
      if (updateError) {
        throw updateError;
      }

      // Create or update user in database
      const { error: dbError } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email,
          first_name: data.first_name,
          last_name: data.last_name,
          name: `${data.first_name} ${data.last_name}`,
          role: user.user_metadata?.role || 'user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save profile to database');
      }

      // Save additional profile data to localStorage
      localStorage.setItem('userData', JSON.stringify({
        first_name: data.first_name,
        last_name: data.last_name,
        mobile_number: data.mobile_number,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
      }));

      // Update user in localStorage
      const localUser = JSON.parse(localStorage.getItem('user') || '{}');
      localUser.firstName = data.first_name;
      localUser.lastName = data.last_name;
      localStorage.setItem('user', JSON.stringify(localUser));

      setSuccessMessage('Profile completed successfully!');
      
      // Redirect to my-trips after a short delay
      setTimeout(() => {
        navigate('/my-trips', { replace: true });
      }, 1500);
    } catch (error) {
      console.error('Error completing profile:', error);
      setErrors({ submit: error.message || 'Failed to save profile. Please try again.' });
      setProcessing(false);
    }
  };

  const handleSkip = () => {
    // Allow user to skip for now, but they can complete later
    navigate('/my-trips', { replace: true });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#B9D0DC] via-[#65B3CF] to-[#055B75] flex items-center justify-center">
        <div className="text-center bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-t-4 border-[#055B75]"></div>
          <p className="mt-6 text-[#055B75] text-xl font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#B9D0DC] via-[#65B3CF] to-[#055B75] py-8 px-4">
      <div className="container mx-auto max-w-2xl">
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 backdrop-blur-sm bg-opacity-95">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#055B75] to-[#65B3CF] text-white rounded-full mb-4 shadow-lg">
              <FaUser size={36} />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#055B75] to-[#65B3CF] bg-clip-text text-transparent mb-3">
              Complete Your Profile
            </h1>
            <p className="text-[#626363] text-lg">
              Please provide the following details to continue
            </p>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 bg-gradient-to-r from-[#65B3CF] to-[#B9D0DC] border-2 border-[#055B75] text-white px-4 py-3 rounded-xl shadow-md">
              <p className="font-semibold">{successMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {errors.submit && (
            <div className="mb-6 bg-red-50 border-2 border-red-400 text-red-700 px-4 py-3 rounded-xl shadow-md">
              <p className="font-semibold">{errors.submit}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* First Name */}
            <div>
              <label htmlFor="first_name" className="block text-[#055B75] font-semibold mb-2 text-lg">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                value={data.first_name}
                onChange={handleChange}
                placeholder="Enter your first name"
                className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] transition-all ${
                  errors.first_name ? 'border-red-500' : 'border-[#B9D0DC] hover:border-[#65B3CF]'
                }`}
                disabled={processing}
              />
              {errors.first_name && (
                <p className="mt-2 text-sm text-red-600 font-medium">{errors.first_name}</p>
              )}
            </div>

            {/* Last Name */}
            <div>
              <label htmlFor="last_name" className="block text-[#055B75] font-semibold mb-2 text-lg">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={data.last_name}
                onChange={handleChange}
                placeholder="Enter your last name"
                className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] transition-all ${
                  errors.last_name ? 'border-red-500' : 'border-[#B9D0DC] hover:border-[#65B3CF]'
                }`}
                disabled={processing}
              />
              {errors.last_name && (
                <p className="mt-2 text-sm text-red-600 font-medium">{errors.last_name}</p>
              )}
            </div>

            {/* Mobile Number */}
            <div>
              <label htmlFor="mobile_number" className="block text-[#055B75] font-semibold mb-2 text-lg">
                <FaPhone className="inline mr-2 text-[#65B3CF]" />
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="mobile_number"
                name="mobile_number"
                value={data.mobile_number}
                onChange={handleChange}
                placeholder="Enter 10-digit mobile number"
                maxLength="10"
                className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] transition-all ${
                  errors.mobile_number ? 'border-red-500' : 'border-[#B9D0DC] hover:border-[#65B3CF]'
                }`}
                disabled={processing}
              />
              {errors.mobile_number && (
                <p className="mt-2 text-sm text-red-600 font-medium">{errors.mobile_number}</p>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label htmlFor="date_of_birth" className="block text-[#055B75] font-semibold mb-2 text-lg">
                <FaCalendar className="inline mr-2 text-[#65B3CF]" />
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="date_of_birth"
                name="date_of_birth"
                value={data.date_of_birth}
                onChange={handleChange}
                max={new Date().toISOString().split('T')[0]}
                className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] transition-all ${
                  errors.date_of_birth ? 'border-red-500' : 'border-[#B9D0DC] hover:border-[#65B3CF]'
                }`}
                disabled={processing}
              />
              {errors.date_of_birth && (
                <p className="mt-2 text-sm text-red-600 font-medium">{errors.date_of_birth}</p>
              )}
            </div>

            {/* Gender */}
            <div>
              <label className="block text-[#055B75] font-semibold mb-3 text-lg">
                Gender <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-4">
                {['Male', 'Female', 'Others'].map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    onClick={() => setData({ ...data, gender })}
                    className={`px-8 py-3 rounded-xl font-semibold transition-all transform hover:scale-105 ${
                      data.gender === gender
                        ? 'bg-gradient-to-r from-[#055B75] to-[#65B3CF] text-white shadow-lg'
                        : 'bg-white border-2 border-[#B9D0DC] text-[#626363] hover:border-[#65B3CF] hover:bg-[#B9D0DC]/20'
                    }`}
                    disabled={processing}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              <button
                type="submit"
                disabled={processing}
                className="flex-1 bg-gradient-to-r from-[#055B75] to-[#65B3CF] text-white py-4 px-8 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {processing ? (
                  <>
                    <FaSpinner className="animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  'Complete Profile'
                )}
              </button>
              
              <button
                type="button"
                onClick={handleSkip}
                disabled={processing}
                className="sm:w-auto px-8 py-4 border-2 border-[#7F8073] text-[#626363] rounded-xl font-semibold hover:bg-[#7F8073]/10 hover:border-[#626363] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Skip for Now
              </button>
            </div>
          </form>

          <p className="text-center text-sm text-[#626363] mt-6 font-medium">
            💡 You can update your profile anytime from the profile page
          </p>
        </div>
      </div>
    </div>
  );
}
