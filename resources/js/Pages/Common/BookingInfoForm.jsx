import React, { useState, useEffect } from 'react';
import api from '../../api.js';

const BookingInfoForm = ({ quoteId, inquiryType, onComplete, onClose }) => {
  // Valid form fields that can be submitted (excludes database fields like id, timestamps, etc.)
  const validFormFields = [
    'full_name',
    'email',
    'phone',
    'date_of_birth',
    'nationality',
    'passport_number',
    'passport_expiry_date',
    'passport_issue_date',
    'passport_issuing_country',
    'emergency_contact_name',
    'emergency_contact_phone',
    'emergency_contact_relationship',
    'booking_details',
    'terms_accepted',
    'privacy_policy_accepted'
  ];

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    nationality: '',
    passport_number: '',
    passport_expiry_date: '',
    passport_issue_date: '',
    passport_issuing_country: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    booking_details: {},
    terms_accepted: false,
    privacy_policy_accepted: false
  });

  const [loading, setLoading] = useState(false);
  const [showSecurityMessage, setShowSecurityMessage] = useState(false);
  const [existingBookingInfo, setExistingBookingInfo] = useState(null);

  useEffect(() => {
    // Load existing booking info if it exists
    loadExistingBookingInfo();
  }, [quoteId]);

  const loadExistingBookingInfo = async () => {
    try {
      const response = await api.get(`quotes?id=${quoteId}&endpoint=booking-info`);
      if (response.data.success) {
        setExistingBookingInfo(response.data.data);
        
        // Only extract valid form fields (exclude database fields like id, timestamps, etc.)
        const filteredData = {};
        validFormFields.forEach(field => {
          if (response.data.data[field] !== undefined) {
            filteredData[field] = response.data.data[field];
          }
        });
        
        setFormData(prevData => ({
          ...prevData,
          ...filteredData,
          booking_details: filteredData.booking_details || {}
        }));
      }
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('User does not have access to this quote\'s booking information');
      } else if (error.response?.status === 404) {
        console.log('No existing booking info found');
      } else {
        console.error('Error loading existing booking info:', error);
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleBookingDetailsChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      booking_details: {
        ...prev.booking_details,
        [key]: value
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Filter formData to only include valid fields before submitting
      const filteredFormData = {};
      validFormFields.forEach(field => {
        if (formData[field] !== undefined) {
          filteredFormData[field] = formData[field];
        }
      });
      
      const response = await api.post(`quotes?id=${quoteId}&endpoint=booking-info`, filteredFormData);
      if (response.data.success) {
        setExistingBookingInfo(response.data.data);

        // Show security message if terms are accepted
        if (formData.terms_accepted && formData.privacy_policy_accepted) {
          setShowSecurityMessage(true);
        } else if (onComplete) {
          onComplete(response.data.data);
        }
      }
    } catch (error) {
      console.error('Error saving booking info:', error);
      
      let errorMessage = 'Failed to save booking information. Please try again.';
      
      if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to submit booking information for this quote.';
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.message || 'Invalid booking information. Please check your entries.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Please log in to submit booking information.';
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSecurityMessageConfirm = () => {
    setShowSecurityMessage(false);
    if (onComplete) {
      onComplete(existingBookingInfo);
    }
  };

  const isFlightBooking = inquiryType === 'flight';
  const isFormValid = formData.full_name && formData.email && formData.phone;
  const isPassportRequired = isFlightBooking && (!formData.passport_number || !formData.passport_expiry_date);
  const canSubmit = isFormValid && (!isFlightBooking || !isPassportRequired);

  if (showSecurityMessage) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Information Saved</h2>
            <p className="text-gray-600 mb-4">
              Your booking information has been saved securely.
            </p>
            <p className="text-sm text-gray-500">
              You can now proceed to payment. Your information will be used for booking arrangements.
            </p>
          </div>
          <button
            onClick={handleSecurityMessageConfirm}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 font-medium"
          >
            Continue to Payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Complete Your Booking Information</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <p className="text-gray-600 mt-2">
            Please provide your travel information and documents to proceed with payment.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Personal Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your phone number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nationality
                </label>
                <input
                  type="text"
                  name="nationality"
                  value={formData.nationality}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your nationality"
                />
              </div>
            </div>
          </div>

          {/* Passport Information (Required for flights) */}
          {isFlightBooking && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Passport Information <span className="text-red-500">*</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Passport Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="passport_number"
                    value={formData.passport_number}
                    onChange={handleInputChange}
                    required={isFlightBooking}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter passport number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Passport Expiry Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="passport_expiry_date"
                    value={formData.passport_expiry_date}
                    onChange={handleInputChange}
                    required={isFlightBooking}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Passport Issue Date
                  </label>
                  <input
                    type="date"
                    name="passport_issue_date"
                    value={formData.passport_issue_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Issuing Country
                  </label>
                  <input
                    type="text"
                    name="passport_issuing_country"
                    value={formData.passport_issuing_country}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter issuing country"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Emergency Contact */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  name="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter emergency contact name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  name="emergency_contact_phone"
                  value={formData.emergency_contact_phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter emergency contact phone"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relationship
                </label>
                <input
                  type="text"
                  name="emergency_contact_relationship"
                  value={formData.emergency_contact_relationship}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Spouse, Parent, Friend"
                />
              </div>
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Terms and Conditions</h3>
            <div className="space-y-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  name="terms_accepted"
                  checked={formData.terms_accepted}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <div className="ml-3">
                  <label className="text-sm font-medium text-gray-700">
                    I accept the terms and conditions *
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    By accepting, you agree to our booking terms and conditions for travel services.
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <input
                  type="checkbox"
                  name="privacy_policy_accepted"
                  checked={formData.privacy_policy_accepted}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <div className="ml-3">
                  <label className="text-sm font-medium text-gray-700">
                    I accept the privacy policy *
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    By accepting, you consent to the collection and use of your personal information as described in our privacy policy.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingInfoForm;

