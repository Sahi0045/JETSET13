import React, { useState, useEffect } from 'react';
import Navbar from '../Common/Navbar';
import Footer from '../Common/Footer';
import withPageElements from '../Common/PageWrapper';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import {
  Plane,
  Hotel,
  Ship,
  Package,
  MessageSquare,
  User,
  Mail,
  Phone,
  CheckCircle,
  Send,
  Loader2,
  RefreshCw
} from 'lucide-react';

// Reusable Input Component - MUST be outside the main component to prevent re-mounting on every state change
const InputField = ({ label, name, type = "text", required = false, placeholder, error, className = "", value, onChange, min }) => (
  <div className={`space-y-1 ${className}`}>
    <label htmlFor={name} className="block text-sm font-semibold text-gray-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
      className={`w-full px-4 py-3 rounded-lg border bg-white focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] transition-colors outline-none
        ${error ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
    />
    {error && <span className="text-sm text-red-500 font-medium">{error}</span>}
  </div>
);

const RequestPage = () => {
  const [activeTab, setActiveTab] = useState('inquiry');
  const [selectedInquiryType, setSelectedInquiryType] = useState('general');
  const [formData, setFormData] = useState({
    // Common fields
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_country: '',
    special_requirements: '',
    budget_range: '',
    preferred_contact_method: 'email',

    // Flight specific
    flight_origin: '',
    flight_destination: '',
    flight_departure_date: '',
    flight_return_date: '',
    flight_passengers: 1,
    flight_class: 'economy',

    // Hotel specific
    hotel_destination: '',
    hotel_checkin_date: '',
    hotel_checkout_date: '',
    hotel_rooms: 1,
    hotel_guests: 1,
    hotel_room_type: '',

    // Cruise specific
    cruise_destination: '',
    cruise_departure_date: '',
    cruise_duration: 7,
    cruise_cabin_type: '',
    cruise_passengers: 1,

    // Package specific
    package_destination: '',
    package_start_date: '',
    package_end_date: '',
    package_travelers: 1,
    package_budget_range: '',
    package_interests: [],

    // General inquiry
    inquiry_subject: '',
    inquiry_message: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get user data from Supabase auth context
  const { user, isAuthenticated } = useSupabaseAuth();

  // Auto-fill user data when logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      setFormData(prev => ({
        ...prev,
        customer_email: prev.customer_email || user.email || '',
        customer_name: prev.customer_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
        customer_phone: prev.customer_phone || user.user_metadata?.phone || ''
      }));
      console.log('📧 Auto-filled contact info from logged-in user:', user.email);
    }
  }, [isAuthenticated, user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      if (name === 'package_interests') {
        const updatedInterests = checked
          ? [...formData.package_interests, value]
          : formData.package_interests.filter(interest => interest !== value);
        setFormData(prev => ({
          ...prev,
          package_interests: updatedInterests
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Common validations
    if (!formData.customer_name.trim()) newErrors.customer_name = 'Full name is required';
    if (!formData.customer_email.trim()) newErrors.customer_email = 'Email address is required';
    else if (!/\S+@\S+\.\S+/.test(formData.customer_email)) newErrors.customer_email = 'Please enter a valid email';
    if (!formData.customer_phone.trim()) newErrors.customer_phone = 'Phone number is required';

    // Inquiry type specific validations
    if (selectedInquiryType === 'flight') {
      if (!formData.flight_origin.trim()) newErrors.flight_origin = 'Origin city is required';
      if (!formData.flight_destination.trim()) newErrors.flight_destination = 'Destination city is required';
      if (!formData.flight_departure_date) newErrors.flight_departure_date = 'Departure date is required';
      if (formData.flight_passengers < 1) newErrors.flight_passengers = 'At least 1 passenger is required';
    } else if (selectedInquiryType === 'hotel') {
      if (!formData.hotel_destination.trim()) newErrors.hotel_destination = 'Destination is required';
      if (!formData.hotel_checkin_date) newErrors.hotel_checkin_date = 'Check-in date is required';
      if (!formData.hotel_checkout_date) newErrors.hotel_checkout_date = 'Check-out date is required';
      if (formData.hotel_rooms < 1) newErrors.hotel_rooms = 'At least 1 room is required';
      if (formData.hotel_guests < 1) newErrors.hotel_guests = 'At least 1 guest is required';
    } else if (selectedInquiryType === 'cruise') {
      if (!formData.cruise_destination.trim()) newErrors.cruise_destination = 'Cruise destination is required';
      if (!formData.cruise_departure_date) newErrors.cruise_departure_date = 'Departure date is required';
      if (formData.cruise_duration < 1) newErrors.cruise_duration = 'Duration must be at least 1 day';
      if (formData.cruise_passengers < 1) newErrors.cruise_passengers = 'At least 1 passenger is required';
    } else if (selectedInquiryType === 'package') {
      if (!formData.package_destination.trim()) newErrors.package_destination = 'Destination is required';
      if (!formData.package_start_date) newErrors.package_start_date = 'Start date is required';
      if (!formData.package_end_date) newErrors.package_end_date = 'End date is required';
      if (formData.package_travelers < 1) newErrors.package_travelers = 'At least 1 traveler is required';
    } else if (selectedInquiryType === 'general') {
      if (!formData.inquiry_subject.trim()) newErrors.inquiry_subject = 'Subject is required';
      if (!formData.inquiry_message.trim()) newErrors.inquiry_message = 'Message is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare inquiry data based on type
      const inquiryData = {
        inquiry_type: selectedInquiryType,
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        customer_phone: formData.customer_phone,
        customer_country: formData.customer_country,
        special_requirements: formData.special_requirements,
        budget_range: formData.budget_range,
        preferred_contact_method: formData.preferred_contact_method,
        // Add type-specific data
        ...getTypeSpecificData()
      };

      console.log('Submitting inquiry:', inquiryData);

      // Get authentication token if user is logged in
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token');
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      // Add authorization header if user is logged in
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('User is authenticated, associating inquiry with user account');
      } else {
        console.log('User not authenticated, creating guest inquiry');
      }

      // Submit to API
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(inquiryData)
      });

      // Read response body as text first (can only read once)
      const responseText = await response.text();

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        // Try to parse error response as JSON, fallback to text
        let errorMessage = `Failed to submit inquiry (${response.status})`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON (like HTML 404 page), use text
          console.error('Non-JSON error response:', responseText.substring(0, 200));
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Parse successful response
      const result = JSON.parse(responseText);

      if (!result.success) {
        throw new Error(result.message || 'Failed to submit inquiry');
      }

      alert(result.message || 'Your inquiry has been submitted successfully! Our travel experts will get back to you within 24 hours.');
      handleClear();
    } catch (error) {
      console.error('Submission error:', error);
      alert(error.message || 'There was an error submitting your inquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeSpecificData = () => {
    switch (selectedInquiryType) {
      case 'flight':
        return {
          flight_origin: formData.flight_origin,
          flight_destination: formData.flight_destination,
          flight_departure_date: formData.flight_departure_date,
          flight_return_date: formData.flight_return_date || null,
          flight_passengers: parseInt(formData.flight_passengers),
          flight_class: formData.flight_class
        };
      case 'hotel':
        return {
          hotel_destination: formData.hotel_destination,
          hotel_checkin_date: formData.hotel_checkin_date,
          hotel_checkout_date: formData.hotel_checkout_date,
          hotel_rooms: parseInt(formData.hotel_rooms),
          hotel_guests: parseInt(formData.hotel_guests),
          hotel_room_type: formData.hotel_room_type
        };
      case 'cruise':
        return {
          cruise_destination: formData.cruise_destination,
          cruise_departure_date: formData.cruise_departure_date,
          cruise_duration: parseInt(formData.cruise_duration),
          cruise_cabin_type: formData.cruise_cabin_type,
          cruise_passengers: parseInt(formData.cruise_passengers)
        };
      case 'package':
        return {
          package_destination: formData.package_destination,
          package_start_date: formData.package_start_date,
          package_end_date: formData.package_end_date,
          package_travelers: parseInt(formData.package_travelers),
          package_budget_range: formData.package_budget_range,
          package_interests: formData.package_interests
        };
      case 'general':
        return {
          inquiry_subject: formData.inquiry_subject,
          inquiry_message: formData.inquiry_message
        };
      default:
        return {};
    }
  };

  const handleClear = () => {
    setFormData({
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      customer_country: '',
      special_requirements: '',
      budget_range: '',
      preferred_contact_method: 'email',
      flight_origin: '',
      flight_destination: '',
      flight_departure_date: '',
      flight_return_date: '',
      flight_passengers: 1,
      flight_class: 'economy',
      hotel_destination: '',
      hotel_checkin_date: '',
      hotel_checkout_date: '',
      hotel_rooms: 1,
      hotel_guests: 1,
      hotel_room_type: '',
      cruise_destination: '',
      cruise_departure_date: '',
      cruise_duration: 7,
      cruise_cabin_type: '',
      cruise_passengers: 1,
      package_destination: '',
      package_start_date: '',
      package_end_date: '',
      package_travelers: 1,
      package_budget_range: '',
      package_interests: [],
      inquiry_subject: '',
      inquiry_message: ''
    });
    setErrors({});
  };

  const renderCommonFields = () => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8">
      <h3 className="text-xl font-bold text-[#055B75] mb-6 flex items-center gap-2">
        <User className="w-5 h-5" /> Contact Information
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InputField
          label="Full Name"
          name="customer_name"
          required
          placeholder="Enter your full name"
          error={errors.customer_name}
          value={formData.customer_name}
          onChange={handleChange}
        />
        <InputField
          label="Email Address"
          name="customer_email"
          type="email"
          required
          placeholder="your.email@example.com"
          error={errors.customer_email}
          value={formData.customer_email}
          onChange={handleChange}
        />
        <InputField
          label="Phone Number"
          name="customer_phone"
          type="tel"
          required
          placeholder="+(877) 538-7380"
          error={errors.customer_phone}
          value={formData.customer_phone}
          onChange={handleChange}
        />
        <InputField
          label="Country"
          name="customer_country"
          placeholder="Your country"
          value={formData.customer_country}
          onChange={handleChange}
        />
      </div>
    </div>
  );

  const renderFlightForm = () => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8 animate-fadeIn">
      <h3 className="text-xl font-bold text-[#055B75] mb-6 flex items-center gap-2">
        <Plane className="w-5 h-5" /> Flight Details
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <InputField label="From (Origin)" name="flight_origin" required placeholder="e.g., New York (JFK)" error={errors.flight_origin} value={formData.flight_origin} onChange={handleChange} />
        <InputField label="To (Destination)" name="flight_destination" required placeholder="e.g., London (LHR)" error={errors.flight_destination} value={formData.flight_destination} onChange={handleChange} />
        <InputField label="Departure Date" name="flight_departure_date" type="date" required error={errors.flight_departure_date} value={formData.flight_departure_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} />

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Return Date</label>
          <input
            type="date"
            name="flight_return_date"
            value={formData.flight_return_date}
            onChange={handleChange}
            min={formData.flight_departure_date || new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] transition-colors outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Passengers *</label>
          <select
            name="flight_passengers"
            value={formData.flight_passengers}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            {[...Array(10)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Passenger{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Class</label>
          <select
            name="flight_class"
            value={formData.flight_class}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            <option value="economy">Economy</option>
            <option value="premium_economy">Premium Economy</option>
            <option value="business">Business</option>
            <option value="first">First Class</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderHotelForm = () => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8 animate-fadeIn">
      <h3 className="text-xl font-bold text-[#055B75] mb-6 flex items-center gap-2">
        <Hotel className="w-5 h-5" /> Hotel Details
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="md:col-span-2">
          <InputField label="Destination City" name="hotel_destination" required placeholder="e.g., Paris, France" error={errors.hotel_destination} value={formData.hotel_destination} onChange={handleChange} />
        </div>
        <InputField label="Check-in Date" name="hotel_checkin_date" type="date" required error={errors.hotel_checkin_date} value={formData.hotel_checkin_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} />

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Check-out Date *</label>
          <input
            type="date"
            name="hotel_checkout_date"
            value={formData.hotel_checkout_date}
            onChange={handleChange}
            min={formData.hotel_checkin_date || new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          />
          {errors.hotel_checkout_date && <span className="text-sm text-red-500 font-medium">{errors.hotel_checkout_date}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Rooms *</label>
          <select
            name="hotel_rooms"
            value={formData.hotel_rooms}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            {[...Array(5)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Room{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Guests *</label>
          <select
            name="hotel_guests"
            value={formData.hotel_guests}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            {[...Array(10)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Guest{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Room Type</label>
          <select
            name="hotel_room_type"
            value={formData.hotel_room_type}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            <option value="">Any Room Type</option>
            <option value="standard">Standard Room</option>
            <option value="deluxe">Deluxe Room</option>
            <option value="suite">Suite</option>
            <option value="executive">Executive</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderCruiseForm = () => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8 animate-fadeIn">
      <h3 className="text-xl font-bold text-[#055B75] mb-6 flex items-center gap-2">
        <Ship className="w-5 h-5" /> Cruise Details
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="md:col-span-2">
          <InputField label="Cruise Destination/Region" name="cruise_destination" required placeholder="e.g., Caribbean, Mediterranean" error={errors.cruise_destination} value={formData.cruise_destination} onChange={handleChange} />
        </div>
        <InputField label="Departure Date" name="cruise_departure_date" type="date" required error={errors.cruise_departure_date} value={formData.cruise_departure_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} />

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Duration (Days) *</label>
          <select
            name="cruise_duration"
            value={formData.cruise_duration}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21].map(d => (
              <option key={d} value={d}>{d} Days</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Passengers *</label>
          <select
            name="cruise_passengers"
            value={formData.cruise_passengers}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            {[...Array(6)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Passenger{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Cabin Type</label>
          <select
            name="cruise_cabin_type"
            value={formData.cruise_cabin_type}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            <option value="">Any Cabin Type</option>
            <option value="inside">Inside Cabin</option>
            <option value="oceanview">Ocean View</option>
            <option value="balcony">Balcony</option>
            <option value="suite">Suite</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderPackageForm = () => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8 animate-fadeIn">
      <h3 className="text-xl font-bold text-[#055B75] mb-6 flex items-center gap-2">
        <Package className="w-5 h-5" /> Vacation Package
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="md:col-span-2">
          <InputField label="Destination" name="package_destination" required placeholder="e.g., Hawaii, Europe" error={errors.package_destination} value={formData.package_destination} onChange={handleChange} />
        </div>
        <InputField label="Start Date" name="package_start_date" type="date" required error={errors.package_start_date} value={formData.package_start_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} />

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">End Date *</label>
          <input
            type="date"
            name="package_end_date"
            value={formData.package_end_date}
            onChange={handleChange}
            min={formData.package_start_date || new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          />
          {errors.package_end_date && <span className="text-sm text-red-500 font-medium">{errors.package_end_date}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Travelers *</label>
          <select
            name="package_travelers"
            value={formData.package_travelers}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            {[...Array(10)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Traveler{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Budget Range</label>
          <select
            name="package_budget_range"
            value={formData.package_budget_range}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            <option value="">Select Range</option>
            <option value="budget">$1,000 - $2,500</option>
            <option value="moderate">$2,500 - $5,000</option>
            <option value="luxury">$5,000 - $10,000</option>
            <option value="ultra">$10,000+</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-gray-700">Interests & Activities</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['Adventure', 'Culture', 'Relaxation', 'Food & Wine', 'Shopping', 'Wildlife', 'History', 'Beach'].map(interest => (
            <label key={interest} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all
              ${formData.package_interests.includes(interest) ? 'border-[#0066b2] bg-blue-50 text-[#0066b2]' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input
                type="checkbox"
                name="package_interests"
                value={interest}
                checked={formData.package_interests.includes(interest)}
                onChange={handleChange}
                className="hidden"
              />
              <span className="text-sm font-medium">{interest}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderGeneralForm = () => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8 animate-fadeIn">
      <h3 className="text-xl font-bold text-[#055B75] mb-6 flex items-center gap-2">
        <MessageSquare className="w-5 h-5" /> General Inquiry
      </h3>
      <InputField label="Subject" name="inquiry_subject" required placeholder="Brief subject" error={errors.inquiry_subject} className="mb-6" value={formData.inquiry_subject} onChange={handleChange} />

      <div className="space-y-1">
        <label htmlFor="inquiry_message" className="block text-sm font-semibold text-gray-700">
          Message *
        </label>
        <textarea
          id="inquiry_message"
          name="inquiry_message"
          value={formData.inquiry_message}
          onChange={handleChange}
          placeholder="How can we help you?"
          rows="6"
          className={`w-full px-4 py-3 rounded-lg border bg-white focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] transition-colors outline-none resize-none
             ${errors.inquiry_message ? 'border-red-500' : 'border-gray-200'}`}
        />
        {errors.inquiry_message && <span className="text-sm text-red-500 font-medium">{errors.inquiry_message}</span>}
      </div>
    </div>
  );

  const renderAdditionalFields = () => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8">
      <h3 className="text-xl font-bold text-[#055B75] mb-6">Additional Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Budget Range (Overall)</label>
          <select
            name="budget_range"
            value={formData.budget_range}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none"
          >
            <option value="">Select Budget Range</option>
            <option value="budget">$1,000 - $2,500</option>
            <option value="moderate">$2,500 - $5,000</option>
            <option value="luxury">$5,000 - $10,000</option>
            <option value="ultra_luxury">$10,000+</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700">Preferred Contact Method</label>
          <div className="flex gap-4 pt-2">
            {['email', 'phone', 'whatsapp'].map(method => (
              <label key={method} className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="preferred_contact_method"
                  value={method}
                  checked={formData.preferred_contact_method === method}
                  onChange={handleChange}
                  className="w-4 h-4 text-[#0066b2] border-gray-300 focus:ring-[#0066b2]"
                />
                <span className="ml-2 text-sm capitalize">{method}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-semibold text-gray-700">Special Requirements</label>
        <textarea
          name="special_requirements"
          value={formData.special_requirements}
          onChange={handleChange}
          placeholder="Any dietary restrictions, accessibility needs, etc."
          rows="3"
          className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066b2] focus:border-[#0066b2] outline-none resize-none"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <div className="flex-grow">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-[#055B75] to-[#034457] py-16 md:py-20 px-4 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2000')] bg-cover bg-center opacity-10 mix-blend-overlay pointer-events-none"></div>
          <div className="relative z-10 max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Start Your Journey
            </h1>
            <p className="text-lg md:text-xl text-blue-100 font-light max-w-2xl mx-auto">
              Tell us about your dream trip, and our travel experts will curate the perfect itinerary for you.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-20 pb-20">
          {/* Tabs */}
          <div className="flex overflow-x-auto bg-white rounded-t-2xl shadow-sm border-b border-gray-100 hide-scrollbar">
            {[
              { id: 'inquiry', label: 'New Inquiry', icon: Send },
              { id: 'modify', label: 'Modify Booking', icon: RefreshCw },
              { id: 'cancel', label: 'Cancel Booking', icon: CheckCircle }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-8 py-5 text-sm font-semibold transition-all whitespace-nowrap
                            ${activeTab === tab.id
                    ? 'text-[#0066b2] border-b-2 border-[#0066b2] bg-blue-50/30'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white shadow-xl rounded-b-2xl rounded-tr-2xl min-h-[500px]">
            {activeTab === 'inquiry' && (
              <div className="p-6 md:p-10">
                <form onSubmit={handleSubmit}>
                  {/* Inquiry Type Cards */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">What are you looking for?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {[
                        { value: 'flight', label: 'Flights', icon: Plane },
                        { value: 'hotel', label: 'Hotels', icon: Hotel },
                        { value: 'cruise', label: 'Cruises', icon: Ship },
                        { value: 'package', label: 'Packages', icon: Package },
                        { value: 'general', label: 'General', icon: MessageSquare }
                      ].map((type) => (
                        <div
                          key={type.value}
                          onClick={() => setSelectedInquiryType(type.value)}
                          className={`flex flex-col items-center justify-center p-4 rounded-xl cursor-pointer border-2 transition-all duration-200
                                                ${selectedInquiryType === type.value
                              ? 'border-[#0066b2] bg-blue-50 text-[#0066b2] shadow-md transform scale-105'
                              : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-200'}`}
                        >
                          <type.icon className={`w-8 h-8 mb-3 ${selectedInquiryType === type.value ? 'text-[#0066b2]' : 'text-gray-400'}`} />
                          <span className="font-semibold text-sm">{type.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <hr className="border-gray-100 my-8" />

                  {renderCommonFields()}

                  {selectedInquiryType === 'flight' && renderFlightForm()}
                  {selectedInquiryType === 'hotel' && renderHotelForm()}
                  {selectedInquiryType === 'cruise' && renderCruiseForm()}
                  {selectedInquiryType === 'package' && renderPackageForm()}
                  {selectedInquiryType === 'general' && renderGeneralForm()}

                  {renderAdditionalFields()}

                  <div className="flex flex-col md:flex-row items-center gap-4 mt-8 pt-6 border-t border-gray-100">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full md:w-auto px-8 py-4 bg-[#0066b2] hover:bg-[#005091] text-white text-lg font-bold rounded-xl shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      {isSubmitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="w-full md:w-auto px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-xl transition-colors"
                    >
                      Clear Form
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab !== 'inquiry' && (
              <div className="flex flex-col items-center justify-center text-center p-20 text-gray-500">
                <div className="bg-gray-100 p-6 rounded-full mb-6">
                  <RefreshCw className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">Coming Soon</h3>
                <p className="max-w-md">
                  This feature is currently under development. To modify or cancel an existing booking, please contact our support team directly.
                </p>
                <button className="mt-8 px-6 py-3 bg-[#055B75] text-white font-semibold rounded-lg hover:bg-[#034457] transition-colors">
                  Contact Support
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default withPageElements(RequestPage);
