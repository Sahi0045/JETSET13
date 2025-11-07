import React, { useState, useEffect } from 'react';
import './RequestPage.css';
import Navbar from '../Common/Navbar';
import Footer from '../Common/Footer';
import withPageElements from '../Common/PageWrapper';
import supabase from '../../lib/supabase';

const RequestPage = () => {
  const [activeTab, setActiveTab] = useState('inquiry');
  const [selectedInquiryType, setSelectedInquiryType] = useState('general');
  const [currentUser, setCurrentUser] = useState(null);
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

  // Check for Supabase authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session?.user) {
          console.log('✅ Supabase user detected:', session.user.email);
          setCurrentUser(session.user);
        } else {
          console.log('ℹ️ No Supabase session found');
        }
      } catch (err) {
        console.error('Error checking Supabase auth:', err);
      }
    };
    checkAuth();
  }, []);

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

      // Get authentication token from multiple sources
      let token = localStorage.getItem('token') || localStorage.getItem('adminToken');
      
      // Check for Supabase token
      if (!token && currentUser) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          token = session.access_token;
          console.log('✅ Using Supabase access token for authentication');
        }
      }
      
      // Also check localStorage for supabase token
      if (!token) {
        token = localStorage.getItem('supabase_token');
        if (token) {
          console.log('✅ Using stored Supabase token');
        }
      }
      
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      
      // Add authorization header if user is logged in
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('✅ User is authenticated, associating inquiry with user account');
        console.log('   Token type:', token.startsWith('eyJ') ? 'JWT' : 'Other');
        console.log('   User email:', currentUser?.email || localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).email : 'Unknown');
      } else {
        console.log('⚠️ User not authenticated, creating guest inquiry');
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
    <>
      <div className="form-section">
        <h3>Contact Information</h3>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="customer_name">Full Name *</label>
            <input
              type="text"
              id="customer_name"
              name="customer_name"
              value={formData.customer_name}
              onChange={handleChange}
              className={errors.customer_name ? 'error' : ''}
              placeholder="Enter your full name"
            />
            {errors.customer_name && <span className="error-message">{errors.customer_name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="customer_email">Email Address *</label>
            <input
              type="email"
              id="customer_email"
              name="customer_email"
              value={formData.customer_email}
              onChange={handleChange}
              className={errors.customer_email ? 'error' : ''}
              placeholder="your.email@example.com"
            />
            {errors.customer_email && <span className="error-message">{errors.customer_email}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="customer_phone">Phone Number *</label>
            <input
              type="tel"
              id="customer_phone"
              name="customer_phone"
              value={formData.customer_phone}
              onChange={handleChange}
              className={errors.customer_phone ? 'error' : ''}
              placeholder="+1 (555) 123-4567"
            />
            {errors.customer_phone && <span className="error-message">{errors.customer_phone}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="customer_country">Country</label>
            <input
              type="text"
              id="customer_country"
              name="customer_country"
              value={formData.customer_country}
              onChange={handleChange}
              placeholder="Your country"
            />
          </div>
        </div>
      </div>
    </>
  );

  const renderFlightForm = () => (
    <div className="form-section">
      <h3>Flight Details</h3>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="flight_origin">From (Origin City) *</label>
          <input
            type="text"
            id="flight_origin"
            name="flight_origin"
            value={formData.flight_origin}
            onChange={handleChange}
            className={errors.flight_origin ? 'error' : ''}
            placeholder="e.g., New York (NYC)"
          />
          {errors.flight_origin && <span className="error-message">{errors.flight_origin}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="flight_destination">To (Destination City) *</label>
          <input
            type="text"
            id="flight_destination"
            name="flight_destination"
            value={formData.flight_destination}
            onChange={handleChange}
            className={errors.flight_destination ? 'error' : ''}
            placeholder="e.g., London (LHR)"
          />
          {errors.flight_destination && <span className="error-message">{errors.flight_destination}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="flight_departure_date">Departure Date *</label>
          <input
            type="date"
            id="flight_departure_date"
            name="flight_departure_date"
            value={formData.flight_departure_date}
            onChange={handleChange}
            className={errors.flight_departure_date ? 'error' : ''}
            min={new Date().toISOString().split('T')[0]}
          />
          {errors.flight_departure_date && <span className="error-message">{errors.flight_departure_date}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="flight_return_date">Return Date (Optional)</label>
          <input
            type="date"
            id="flight_return_date"
            name="flight_return_date"
            value={formData.flight_return_date}
            onChange={handleChange}
            min={formData.flight_departure_date || new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="flight_passengers">Number of Passengers *</label>
          <select
            id="flight_passengers"
            name="flight_passengers"
            value={formData.flight_passengers}
            onChange={handleChange}
            className={errors.flight_passengers ? 'error' : ''}
          >
            {[...Array(10)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Passenger{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
          {errors.flight_passengers && <span className="error-message">{errors.flight_passengers}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="flight_class">Preferred Class</label>
          <select
            id="flight_class"
            name="flight_class"
            value={formData.flight_class}
            onChange={handleChange}
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
    <div className="form-section">
      <h3>Hotel Details</h3>
      <div className="form-group">
        <label htmlFor="hotel_destination">Destination City *</label>
        <input
          type="text"
          id="hotel_destination"
          name="hotel_destination"
          value={formData.hotel_destination}
          onChange={handleChange}
          className={errors.hotel_destination ? 'error' : ''}
          placeholder="e.g., Paris, France"
        />
        {errors.hotel_destination && <span className="error-message">{errors.hotel_destination}</span>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="hotel_checkin_date">Check-in Date *</label>
          <input
            type="date"
            id="hotel_checkin_date"
            name="hotel_checkin_date"
            value={formData.hotel_checkin_date}
            onChange={handleChange}
            className={errors.hotel_checkin_date ? 'error' : ''}
            min={new Date().toISOString().split('T')[0]}
          />
          {errors.hotel_checkin_date && <span className="error-message">{errors.hotel_checkin_date}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="hotel_checkout_date">Check-out Date *</label>
          <input
            type="date"
            id="hotel_checkout_date"
            name="hotel_checkout_date"
            value={formData.hotel_checkout_date}
            onChange={handleChange}
            className={errors.hotel_checkout_date ? 'error' : ''}
            min={formData.hotel_checkin_date || new Date().toISOString().split('T')[0]}
          />
          {errors.hotel_checkout_date && <span className="error-message">{errors.hotel_checkout_date}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="hotel_rooms">Number of Rooms *</label>
          <select
            id="hotel_rooms"
            name="hotel_rooms"
            value={formData.hotel_rooms}
            onChange={handleChange}
            className={errors.hotel_rooms ? 'error' : ''}
          >
            {[...Array(5)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Room{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
          {errors.hotel_rooms && <span className="error-message">{errors.hotel_rooms}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="hotel_guests">Number of Guests *</label>
          <select
            id="hotel_guests"
            name="hotel_guests"
            value={formData.hotel_guests}
            onChange={handleChange}
            className={errors.hotel_guests ? 'error' : ''}
          >
            {[...Array(20)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Guest{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
          {errors.hotel_guests && <span className="error-message">{errors.hotel_guests}</span>}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="hotel_room_type">Preferred Room Type</label>
        <select
          id="hotel_room_type"
          name="hotel_room_type"
          value={formData.hotel_room_type}
          onChange={handleChange}
        >
          <option value="">Any Room Type</option>
          <option value="standard">Standard Room</option>
          <option value="deluxe">Deluxe Room</option>
          <option value="suite">Suite</option>
          <option value="executive">Executive Room</option>
          <option value="presidential">Presidential Suite</option>
        </select>
      </div>
    </div>
  );

  const renderCruiseForm = () => (
    <div className="form-section">
      <h3>Cruise Details</h3>
      <div className="form-group">
        <label htmlFor="cruise_destination">Cruise Destination/Region *</label>
        <input
          type="text"
          id="cruise_destination"
          name="cruise_destination"
          value={formData.cruise_destination}
          onChange={handleChange}
          className={errors.cruise_destination ? 'error' : ''}
          placeholder="e.g., Caribbean, Mediterranean, Alaska"
        />
        {errors.cruise_destination && <span className="error-message">{errors.cruise_destination}</span>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="cruise_departure_date">Preferred Departure Date *</label>
          <input
            type="date"
            id="cruise_departure_date"
            name="cruise_departure_date"
            value={formData.cruise_departure_date}
            onChange={handleChange}
            className={errors.cruise_departure_date ? 'error' : ''}
            min={new Date().toISOString().split('T')[0]}
          />
          {errors.cruise_departure_date && <span className="error-message">{errors.cruise_departure_date}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="cruise_duration">Cruise Duration (Days) *</label>
          <select
            id="cruise_duration"
            name="cruise_duration"
            value={formData.cruise_duration}
            onChange={handleChange}
            className={errors.cruise_duration ? 'error' : ''}
          >
            {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(days => (
              <option key={days} value={days}>{days} Days</option>
            ))}
          </select>
          {errors.cruise_duration && <span className="error-message">{errors.cruise_duration}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="cruise_passengers">Number of Passengers *</label>
          <select
            id="cruise_passengers"
            name="cruise_passengers"
            value={formData.cruise_passengers}
            onChange={handleChange}
            className={errors.cruise_passengers ? 'error' : ''}
          >
            {[...Array(8)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Passenger{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
          {errors.cruise_passengers && <span className="error-message">{errors.cruise_passengers}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="cruise_cabin_type">Preferred Cabin Type</label>
          <select
            id="cruise_cabin_type"
            name="cruise_cabin_type"
            value={formData.cruise_cabin_type}
            onChange={handleChange}
          >
            <option value="">Any Cabin Type</option>
            <option value="inside">Inside Cabin</option>
            <option value="oceanview">Ocean View</option>
            <option value="balcony">Balcony</option>
            <option value="suite">Suite</option>
            <option value="penthouse">Penthouse Suite</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderPackageForm = () => (
    <div className="form-section">
      <h3>Vacation Package Details</h3>
      <div className="form-group">
        <label htmlFor="package_destination">Destination *</label>
        <input
          type="text"
          id="package_destination"
          name="package_destination"
          value={formData.package_destination}
          onChange={handleChange}
          className={errors.package_destination ? 'error' : ''}
          placeholder="e.g., Hawaii, Europe, Dubai"
        />
        {errors.package_destination && <span className="error-message">{errors.package_destination}</span>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="package_start_date">Start Date *</label>
          <input
            type="date"
            id="package_start_date"
            name="package_start_date"
            value={formData.package_start_date}
            onChange={handleChange}
            className={errors.package_start_date ? 'error' : ''}
            min={new Date().toISOString().split('T')[0]}
          />
          {errors.package_start_date && <span className="error-message">{errors.package_start_date}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="package_end_date">End Date *</label>
          <input
            type="date"
            id="package_end_date"
            name="package_end_date"
            value={formData.package_end_date}
            onChange={handleChange}
            className={errors.package_end_date ? 'error' : ''}
            min={formData.package_start_date || new Date().toISOString().split('T')[0]}
          />
          {errors.package_end_date && <span className="error-message">{errors.package_end_date}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="package_travelers">Number of Travelers *</label>
          <select
            id="package_travelers"
            name="package_travelers"
            value={formData.package_travelers}
            onChange={handleChange}
            className={errors.package_travelers ? 'error' : ''}
          >
            {[...Array(20)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} Traveler{i !== 0 ? 's' : ''}</option>
            ))}
          </select>
          {errors.package_travelers && <span className="error-message">{errors.package_travelers}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="package_budget_range">Budget Range</label>
          <select
            id="package_budget_range"
            name="package_budget_range"
            value={formData.package_budget_range}
            onChange={handleChange}
          >
            <option value="">Select Budget Range</option>
            <option value="budget">$1,000 - $2,500</option>
            <option value="moderate">$2,500 - $5,000</option>
            <option value="luxury">$5,000 - $10,000</option>
            <option value="ultra_luxury">$10,000+</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Interests & Activities</label>
        <div className="checkbox-group">
          {['Adventure', 'Culture', 'Relaxation', 'Food & Wine', 'Shopping', 'Wildlife', 'History', 'Beach', 'Mountains', 'City Exploration'].map(interest => (
            <label key={interest} className="checkbox-label">
              <input
                type="checkbox"
                name="package_interests"
                value={interest}
                checked={formData.package_interests.includes(interest)}
                onChange={handleChange}
              />
              <span className="checkbox-text">{interest}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderGeneralForm = () => (
    <div className="form-section">
      <h3>General Inquiry</h3>
      <div className="form-group">
        <label htmlFor="inquiry_subject">Subject *</label>
        <input
          type="text"
          id="inquiry_subject"
          name="inquiry_subject"
          value={formData.inquiry_subject}
          onChange={handleChange}
          className={errors.inquiry_subject ? 'error' : ''}
          placeholder="Brief description of your inquiry"
        />
        {errors.inquiry_subject && <span className="error-message">{errors.inquiry_subject}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="inquiry_message">Message *</label>
        <textarea
          id="inquiry_message"
          name="inquiry_message"
          value={formData.inquiry_message}
          onChange={handleChange}
          className={errors.inquiry_message ? 'error' : ''}
          placeholder="Please provide details about your inquiry..."
          rows="6"
        />
        {errors.inquiry_message && <span className="error-message">{errors.inquiry_message}</span>}
      </div>
    </div>
  );

  const renderAdditionalFields = () => (
    <div className="form-section">
      <h3>Additional Information</h3>
      <div className="form-group">
        <label htmlFor="budget_range">Budget Range</label>
        <select
          id="budget_range"
          name="budget_range"
          value={formData.budget_range}
          onChange={handleChange}
        >
          <option value="">Select Budget Range</option>
          <option value="budget">$1,000 - $2,500</option>
          <option value="moderate">$2,500 - $5,000</option>
          <option value="luxury">$5,000 - $10,000</option>
          <option value="ultra_luxury">$10,000+</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="preferred_contact_method">Preferred Contact Method</label>
        <select
          id="preferred_contact_method"
          name="preferred_contact_method"
          value={formData.preferred_contact_method}
          onChange={handleChange}
        >
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="special_requirements">Special Requirements or Preferences</label>
        <textarea
          id="special_requirements"
          name="special_requirements"
          value={formData.special_requirements}
          onChange={handleChange}
          placeholder="Any special requirements, dietary restrictions, accessibility needs, etc."
          rows="4"
        />
      </div>
    </div>
  );

  return (
    <>
      <Navbar />
      <div className="request-page">
        <div className="request-container">
          <div className="request-header">
            <h1>Get Your Personalized Travel Quote</h1>
            <p>Fill out the form below and our travel experts will create a customized itinerary just for you</p>
          </div>

        <div className="request-tabs">
          <button
            className={`tab-btn ${activeTab === 'inquiry' ? 'active' : ''}`}
            onClick={() => setActiveTab('inquiry')}
          >
            Travel Inquiry
          </button>
          <button
            className={`tab-btn ${activeTab === 'modify' ? 'active' : ''}`}
            onClick={() => setActiveTab('modify')}
          >
            Modify Booking
          </button>
          <button
            className={`tab-btn ${activeTab === 'cancel' ? 'active' : ''}`}
            onClick={() => setActiveTab('cancel')}
          >
            Cancel Booking
          </button>
        </div>

        <div className="request-content">
          {activeTab === 'inquiry' && (
            <form onSubmit={handleSubmit} className="request-form">
              {/* Inquiry Type Selection */}
              <div className="form-section">
                <h3>What type of travel are you interested in?</h3>
                <div className="inquiry-type-selector">
                  {[
                    { value: 'flight', label: '✈️ Flight Tickets', desc: 'Book domestic or international flights' },
                    { value: 'hotel', label: '🏨 Hotel Accommodation', desc: 'Find the perfect place to stay' },
                    { value: 'cruise', label: '🚢 Cruise Vacation', desc: 'Luxury cruise experiences' },
                    { value: 'package', label: '🎒 Vacation Packages', desc: 'Complete travel packages' },
                    { value: 'general', label: '💬 General Inquiry', desc: 'Other travel questions' }
                  ].map(type => (
                    <div
                      key={type.value}
                      className={`inquiry-type-card ${selectedInquiryType === type.value ? 'selected' : ''}`}
                      onClick={() => setSelectedInquiryType(type.value)}
                    >
                      <div className="card-content">
                        <h4>{type.label}</h4>
                        <p>{type.desc}</p>
                      </div>
                      <div className="card-radio">
                        <input
                          type="radio"
                          name="inquiry_type"
                          value={type.value}
                          checked={selectedInquiryType === type.value}
                          onChange={() => setSelectedInquiryType(type.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {renderCommonFields()}

              {selectedInquiryType === 'flight' && renderFlightForm()}
              {selectedInquiryType === 'hotel' && renderHotelForm()}
              {selectedInquiryType === 'cruise' && renderCruiseForm()}
              {selectedInquiryType === 'package' && renderPackageForm()}
              {selectedInquiryType === 'general' && renderGeneralForm()}

              {renderAdditionalFields()}

              <div className="form-actions">
                <button type="submit" className="submit-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
                </button>
                <button type="button" className="clear-btn" onClick={handleClear}>
                  Clear Form
                </button>
              </div>
            </form>
          )}

          {activeTab === 'modify' && (
            <div className="tab-content">
              <h3>Modify Existing Booking</h3>
              <p>Feature coming soon! Please contact our support team for booking modifications.</p>
            </div>
          )}

          {activeTab === 'cancel' && (
            <div className="tab-content">
              <h3>Cancel Booking</h3>
              <p>Feature coming soon! Please contact our support team for booking cancellations.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    <Footer />
    </>
  );
};

export default withPageElements(RequestPage);
