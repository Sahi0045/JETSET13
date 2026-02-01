import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaPlane, FaHotel, FaCar, FaUtensils, FaCalendarAlt, FaUsers, FaCreditCard, FaInfoCircle, FaLock, FaUser, FaPassport, FaEnvelope, FaPhone, FaIdCard } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from "../PageWrapper";
import currencyService from '../../../Services/CurrencyService';
import Price from '../../../Components/Price';
import ArcPayService from '../../../Services/ArcPayService';

const PackageBookingSummary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get package details from location state (passed from itp.jsx)
  const packageDetails = location.state?.packageDetails || null;
  
  // State management for loading and error
  const [isLoading, setIsLoading] = useState(!packageDetails);
  const [loadError, setLoadError] = useState('');
  
  // State for booking data
  const [bookingDetails, setBookingDetails] = useState(null);

  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryDate: '',
    cvv: ''
  });

  // Add traveler details state
  const [travelerDetails, setTravelerDetails] = useState({
    primaryTraveler: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      passportNumber: '',
      passportExpiry: '',
      nationality: ''
    },
    additionalTravelers: [],
    specialRequests: ''
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);

  // Fetch package details if not provided in location state
  useEffect(() => {
    const fetchPackageDetails = async () => {
      if (packageDetails) {
        // If we have package details from location state, use them
        setBookingDetails(packageDetails);
        
        // Initialize traveler form based on number of travelers
        const adultCount = packageDetails.travelers?.adults || 1;
        const childCount = packageDetails.travelers?.children || 0;
        
        // Create additional traveler forms based on count (subtract 1 for primary traveler)
        const additionalTravelersCount = adultCount + childCount - 1;
        const additionalTravelers = Array(additionalTravelersCount).fill().map(() => ({
          firstName: '',
          lastName: '',
          dateOfBirth: '',
          passportNumber: '',
          passportExpiry: '',
          nationality: ''
        }));
        
        setTravelerDetails(prev => ({
          ...prev,
          additionalTravelers
        }));
        
        setIsLoading(false);
      } else {
        // If no package details in location state, try to fetch from API or redirect
        try {
          // Get package ID from URL if available
          const packageId = new URLSearchParams(location.search).get('id');
          
          if (!packageId) {
            throw new Error('No package ID provided');
          }
          
          // Example API call - replace with your actual API endpoint
          const response = await fetch(`/api/packages/${packageId}`);
          
          if (!response.ok) {
            throw new Error('Failed to load package details');
          }
          
          const data = await response.json();
          setBookingDetails(data);
          
          // Initialize traveler form based on number of travelers
          const adultCount = data.travelers?.adults || 1;
          const childCount = data.travelers?.children || 0;
          
          // Create additional traveler forms based on count (subtract 1 for primary traveler)
          const additionalTravelersCount = adultCount + childCount - 1;
          const additionalTravelers = Array(additionalTravelersCount).fill().map(() => ({
            firstName: '',
            lastName: '',
            dateOfBirth: '',
            passportNumber: '',
            passportExpiry: '',
            nationality: ''
          }));
          
          setTravelerDetails(prev => ({
            ...prev,
            additionalTravelers
          }));
          
          setIsLoading(false);
        } catch (err) {
          setLoadError(err.message || 'Failed to load package details');
          setIsLoading(false);
          
          // Redirect back to packages page after 3 seconds
          setTimeout(() => {
            navigate('/packages');
          }, 3000);
        }
      }
    };
    
    fetchPackageDetails();
  }, [location, packageDetails, navigate]);

  const handlePaymentChange = (field, value) => {
    setPaymentDetails(prev => ({ ...prev, [field]: value }));
  };

  // Handle traveler details changes
  const handlePrimaryTravelerChange = (field, value) => {
    setTravelerDetails(prev => ({
      ...prev,
      primaryTraveler: {
        ...prev.primaryTraveler,
        [field]: value
      }
    }));
  };

  const handleAdditionalTravelerChange = (index, field, value) => {
    const updatedTravelers = [...travelerDetails.additionalTravelers];
    updatedTravelers[index] = {
      ...updatedTravelers[index],
      [field]: value
    };
    
    setTravelerDetails(prev => ({
      ...prev,
      additionalTravelers: updatedTravelers
    }));
  };

  const handleSpecialRequestsChange = (value) => {
    setTravelerDetails(prev => ({
      ...prev,
      specialRequests: value
    }));
  };

  const validateForm = () => {
    // Validate required payment fields
    const requiredPaymentFields = ['cardNumber', 'cardHolder', 'expiryDate', 'cvv'];
    for (const field of requiredPaymentFields) {
      if (!paymentDetails[field]) {
        throw new Error(`Please enter ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      }
    }

    // Validate required traveler fields
    const requiredTravelerFields = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'passportNumber'];
    for (const field of requiredTravelerFields) {
      if (!travelerDetails.primaryTraveler[field]) {
        throw new Error(`Please enter primary traveler's ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError('');

    try {
      validateForm();

      console.log('🔍 Checking ArcPay Gateway status...');
      const gatewayStatus = await ArcPayService.checkGatewayStatus();

      if (!gatewayStatus.success || !gatewayStatus.gatewayOperational) {
        console.warn('Gateway status check failed:', gatewayStatus);
        throw new Error('Payment gateway is currently unavailable. Please try again later.');
      }

      const totalAmount = bookingDetails.pricing.total;

      // Store booking data in localStorage before redirect
      const bookingData = {
        packageDetails: bookingDetails,
        travelers: {
          primary: travelerDetails.primaryTraveler,
          additional: travelerDetails.additionalTravelers
        },
        specialRequests: travelerDetails.specialRequests,
        paymentMethod: 'credit-card',
        bookingDate: new Date().toISOString(),
        totalAmount
      };
      localStorage.setItem('pendingPackageBooking', JSON.stringify(bookingData));

      // Create hosted checkout session
      // ARC Pay requires alphanumeric order IDs under 16 characters
      const orderId = `P${Date.now().toString(36).toUpperCase()}`;
      console.log('🚀 Creating ArcPay hosted checkout session...');

      const checkoutResponse = await ArcPayService.createHostedCheckout({
        amount: totalAmount,
        currency: 'USD',
        orderId: orderId,
        bookingType: 'package',
        customerEmail: travelerDetails.primaryTraveler.email || 'customer@jetsetgo.com',
        customerName: `${travelerDetails.primaryTraveler.firstName} ${travelerDetails.primaryTraveler.lastName}`,
        customerPhone: travelerDetails.primaryTraveler.phone,
        description: `Package Booking - ${bookingDetails.name || 'Travel Package'}`,
        returnUrl: `${window.location.origin}/payment/callback?orderId=${orderId}&bookingType=package`,
        cancelUrl: `${window.location.origin}/packages/booking-summary`,
        bookingData: bookingData
      });

      if (!checkoutResponse.success || !checkoutResponse.checkoutUrl) {
        throw new Error(checkoutResponse.error?.error || 'Failed to create checkout session');
      }

      console.log('✅ Hosted checkout session created:', checkoutResponse.sessionId);
      console.log('🔗 Redirecting to ArcPay payment page:', checkoutResponse.checkoutUrl);

      // Store session info for verification after payment
      localStorage.setItem('pendingPaymentSession', JSON.stringify({
        sessionId: checkoutResponse.sessionId,
        orderId: orderId,
        bookingType: 'package',
        amount: totalAmount
      }));

      // Redirect to ArcPay hosted payment page
      window.location.href = checkoutResponse.checkoutUrl;

    } catch (error) {
      console.error('❌ Payment processing error:', error);
      
      let errorMessage = 'Payment processing failed. Please try again.';
      if (error.message.includes('gateway')) {
        errorMessage = 'Payment gateway is temporarily unavailable. Please try again in a few minutes.';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        errorMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else {
        errorMessage = error.message;
      }

      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-t-blue-500 border-blue-200"></div>
          <p className="mt-4 text-lg">Loading booking details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">{loadError}</p>
          <p className="text-gray-500">Redirecting to packages page...</p>
        </div>
      </div>
    );
  }

  // If no booking details available
  if (!bookingDetails) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <h2 className="text-2xl font-bold mb-2">No package selected</h2>
          <p className="text-gray-600 mb-4">Please select a package to proceed with booking.</p>
          <button 
            onClick={() => navigate('/packages')}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Browse Packages
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-[#0066b2] text-white p-6">
            <h1 className="text-2xl font-bold">Booking Summary</h1>
            <p className="text-sm opacity-90">Confirmation #: BOK{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
          </div>

          {/* Main Content */}
          <div className="p-6 space-y-6">
            {/* Package Overview */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <FaInfoCircle className="mr-2 text-[#0066b2]" />
                Package Overview
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-lg font-medium">{bookingDetails.packageName}</p>
                  <p className="text-gray-600">{bookingDetails.duration}</p>
                </div>
                <div>
                  <p className="flex items-center text-gray-600">
                    <FaUsers className="mr-2" />
                    {bookingDetails.travelers?.adults || 1} Adults, {bookingDetails.travelers?.children || 0} Children
                  </p>
                  <p className="flex items-center text-gray-600">
                    <FaCalendarAlt className="mr-2" />
                    {bookingDetails.transportation?.flights?.[0]?.date} - {bookingDetails.transportation?.flights?.[1]?.date}
                  </p>
                </div>
              </div>
            </div>

            {/* Traveler Details Section */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <FaUser className="mr-2 text-[#0066b2]" />
                Traveler Details
              </h2>
              
              {/* Primary Traveler */}
              <div className="mb-6">
                <h3 className="font-medium text-lg mb-3">Primary Traveler (Contact Person)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="First Name *"
                    value={travelerDetails.primaryTraveler.firstName}
                    onChange={(e) => handlePrimaryTravelerChange('firstName', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last Name *"
                    value={travelerDetails.primaryTraveler.lastName}
                    onChange={(e) => handlePrimaryTravelerChange('lastName', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email Address *"
                    value={travelerDetails.primaryTraveler.email}
                    onChange={(e) => handlePrimaryTravelerChange('email', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number *"
                    value={travelerDetails.primaryTraveler.phone}
                    onChange={(e) => handlePrimaryTravelerChange('phone', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  />
                  <input
                    type="date"
                    placeholder="Date of Birth *"
                    value={travelerDetails.primaryTraveler.dateOfBirth}
                    onChange={(e) => handlePrimaryTravelerChange('dateOfBirth', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  />
                  <select
                    value={travelerDetails.primaryTraveler.nationality}
                    onChange={(e) => handlePrimaryTravelerChange('nationality', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  >
                    <option value="">Select Nationality *</option>
                    <option value="US">United States</option>
                    <option value="UK">United Kingdom</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="IN">India</option>
                    <option value="Other">Other</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Passport Number *"
                    value={travelerDetails.primaryTraveler.passportNumber}
                    onChange={(e) => handlePrimaryTravelerChange('passportNumber', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  />
                  <input
                    type="date"
                    placeholder="Passport Expiry Date *"
                    value={travelerDetails.primaryTraveler.passportExpiry}
                    onChange={(e) => handlePrimaryTravelerChange('passportExpiry', e.target.value)}
                    className="p-3 border border-gray-300 rounded"
                    required
                  />
                </div>
              </div>
              
              {/* Additional Travelers */}
              {travelerDetails.additionalTravelers.map((traveler, index) => (
                <div key={index} className="mb-6">
                  <h3 className="font-medium text-lg mb-3">Traveler {index + 2}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="First Name *"
                      value={traveler.firstName}
                      onChange={(e) => handleAdditionalTravelerChange(index, 'firstName', e.target.value)}
                      className="p-3 border border-gray-300 rounded"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Last Name *"
                      value={traveler.lastName}
                      onChange={(e) => handleAdditionalTravelerChange(index, 'lastName', e.target.value)}
                      className="p-3 border border-gray-300 rounded"
                      required
                    />
                    <input
                      type="date"
                      placeholder="Date of Birth *"
                      value={traveler.dateOfBirth}
                      onChange={(e) => handleAdditionalTravelerChange(index, 'dateOfBirth', e.target.value)}
                      className="p-3 border border-gray-300 rounded"
                    />
                    <select
                      value={traveler.nationality}
                      onChange={(e) => handleAdditionalTravelerChange(index, 'nationality', e.target.value)}
                      className="p-3 border border-gray-300 rounded"
                    >
                      <option value="">Select Nationality</option>
                      <option value="US">United States</option>
                      <option value="UK">United Kingdom</option>
                      <option value="CA">Canada</option>
                      <option value="AU">Australia</option>
                      <option value="IN">India</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Passport Number"
                      value={traveler.passportNumber}
                      onChange={(e) => handleAdditionalTravelerChange(index, 'passportNumber', e.target.value)}
                      className="p-3 border border-gray-300 rounded"
                    />
                    <input
                      type="date"
                      placeholder="Passport Expiry Date"
                      value={traveler.passportExpiry}
                      onChange={(e) => handleAdditionalTravelerChange(index, 'passportExpiry', e.target.value)}
                      className="p-3 border border-gray-300 rounded"
                    />
                  </div>
                </div>
              ))}
              
              {/* Special Requests */}
              <div className="mt-4">
                <h3 className="font-medium mb-2">Special Requests</h3>
                <textarea
                  placeholder="Any special requirements? (dietary restrictions, accessibility needs, room preferences, etc.)"
                  value={travelerDetails.specialRequests}
                  onChange={(e) => handleSpecialRequestsChange(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded"
                  rows="4"
                ></textarea>
              </div>
            </div>

            {/* Transportation */}
            {bookingDetails.transportation && (
              <div className="border-b pb-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaPlane className="mr-2 text-[#0066b2]" />
                  Transportation Details
                </h2>
                <div className="space-y-4">
                  {bookingDetails.transportation.flights && bookingDetails.transportation.flights.map((flight, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg">
                      <p className="font-medium">{index === 0 ? 'Departure Flight' : 'Return Flight'}</p>
                      <div className="flex justify-between items-center mt-2">
                        <div>
                          <p className="text-sm text-gray-600">{flight.from}</p>
                          <p className="font-medium">{flight.time}</p>
                        </div>
                        <div className="text-center">
                          <div className="w-24 h-0.5 bg-gray-300 relative">
                            <div className="absolute -top-2 right-0 w-4 h-4 border-t-2 border-r-2 border-gray-300 transform rotate-45"></div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">{flight.to}</p>
                          <p className="font-medium">{flight.date}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {bookingDetails.transportation.transfers && (
                    <p className="text-gray-600 mt-2">{bookingDetails.transportation.transfers}</p>
                  )}
                </div>
              </div>
            )}

            {/* Accommodation */}
            {bookingDetails.accommodation && (
              <div className="border-b pb-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaHotel className="mr-2 text-[#0066b2]" />
                  Accommodation
                </h2>
                <div className="grid grid-cols-1 gap-4">
                  {bookingDetails.accommodation.map((hotel, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium">{hotel.name}</h3>
                      <p className="text-gray-600">{hotel.location}</p>
                      <p className="text-gray-600">{hotel.nights} nights - {hotel.roomType}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inclusions */}
            {bookingDetails.inclusions && (
              <div className="border-b pb-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaUtensils className="mr-2 text-[#0066b2]" />
                  Package Inclusions
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {bookingDetails.inclusions.map((inclusion, index) => (
                    <div key={index} className="flex items-center">
                      <div className="w-2 h-2 bg-[#0066b2] rounded-full mr-2"></div>
                      <p className="text-gray-600">{inclusion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price Breakdown */}
            {bookingDetails.pricing && (
              <div className="border-b pb-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaCreditCard className="mr-2 text-[#0066b2]" />
                  Price Breakdown
                </h2>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Base Price</span>
                      <span><Price amount={bookingDetails.pricing.basePrice} /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Taxes</span>
                      <span><Price amount={bookingDetails.pricing.taxes} /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Service Fees</span>
                      <span><Price amount={bookingDetails.pricing.fees} /></span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span className="text-[#0066b2]"><Price amount={bookingDetails.pricing.total} /></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <FaLock className="mr-2 text-[#0066b2]" />
              Payment Details
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                name="cardNumber"
                placeholder="Card Number *"
                value={paymentDetails.cardNumber}
                onChange={(e) => handlePaymentChange('cardNumber', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded"
              />
              <input
                type="text"
                name="cardHolder"
                placeholder="Card Holder Name *"
                value={paymentDetails.cardHolder}
                onChange={(e) => handlePaymentChange('cardHolder', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="expiryDate"
                  placeholder="MM/YY *"
                  value={paymentDetails.expiryDate}
                  onChange={(e) => handlePaymentChange('expiryDate', e.target.value)}
                  className="p-3 border border-gray-300 rounded"
                />
                <input
                  type="text"
                  name="cvv"
                  placeholder="CVV *"
                  value={paymentDetails.cvv}
                  onChange={(e) => handlePaymentChange('cvv', e.target.value)}
                  className="p-3 border border-gray-300 rounded"
                />
              </div>
              <div className="flex items-center text-sm text-gray-600 mt-2 mb-4">
                <FaLock className="mr-2 text-green-600" />
                Your payment information is encrypted and secure.
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded font-medium hover:bg-blue-700 transition-colors"
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Complete Booking'}
              </button>
              {error && <p className="text-red-500 mt-4">{error}</p>}
            </div>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default withPageElements(PackageBookingSummary);