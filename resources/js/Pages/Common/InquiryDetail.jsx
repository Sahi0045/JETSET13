import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import BookingInfoForm from './BookingInfoForm';

const InquiryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inquiry, setInquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [selectedQuoteForBooking, setSelectedQuoteForBooking] = useState(null);

  useEffect(() => {
    fetchInquiryDetails();
    // Note: SDK loading removed - we use direct checkout URL redirect instead
  }, [id]);

  const fetchInquiryDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token');
      
      if (!token) {
        setError('Authentication required. Please log in.');
        setLoading(false);
        return;
      }

      const inquiryResponse = await fetch(`/api/inquiries?id=${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!inquiryResponse.ok) {
        if (inquiryResponse.status === 404) {
          setError('Inquiry not found');
          setLoading(false);
          return;
        }
        if (inquiryResponse.status === 403) {
          setError('You do not have permission to view this inquiry');
          setLoading(false);
          return;
        }
        throw new Error(`Failed to fetch inquiry (${inquiryResponse.status})`);
      }

      const inquiryData = await inquiryResponse.json();

      if (inquiryData.success) {
        setInquiry(inquiryData.data);
        
        // Quotes might be included in the inquiry response
        if (inquiryData.data.quotes && Array.isArray(inquiryData.data.quotes)) {
          setQuotes(inquiryData.data.quotes);
        } else {
          // Fetch quotes separately if not included
          const quotesResponse = await fetch(`/api/quotes?inquiryId=${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });
          
          if (quotesResponse.ok) {
            const quotesData = await quotesResponse.json();
            if (quotesData.success) {
              setQuotes(Array.isArray(quotesData.data) ? quotesData.data : []);
            }
          }
        }
      } else {
        setError(inquiryData.message || 'Failed to load inquiry');
      }
    } catch (err) {
      console.error('Error fetching inquiry details:', err);
      setError(err.message || 'An error occurred while loading the inquiry');
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async (quote) => {
    console.log('💳 handlePayNow called with quote:', quote);
    console.log('   Quote ID:', quote?.id);
    console.log('   Total Amount:', quote?.total_amount);
    console.log('   Currency:', quote?.currency);
    console.log('   Inquiry:', inquiry);

    // Validate prerequisites
    if (!quote || !quote.id) {
      console.error('❌ Invalid quote:', quote);
      alert('Invalid quote information. Please refresh the page.');
      return;
    }

    if (!inquiry || !inquiry.id) {
      console.error('❌ Invalid inquiry:', inquiry);
      alert('Invalid inquiry information. Please refresh the page.');
      return;
    }

    // Validate quote amount
    if (!quote.total_amount || parseFloat(quote.total_amount) <= 0) {
      console.error('❌ Invalid amount:', quote.total_amount);
      alert('Invalid payment amount. Please contact support.');
      return;
    }

    // Check if booking info is required and completed
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token');
      const bookingInfoResponse = await fetch(`/api/quotes?id=${quote.id}&endpoint=booking-info`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (bookingInfoResponse.ok) {
        const bookingData = await bookingInfoResponse.json();
        console.log('🔍 Booking info check result:', bookingData);
        if (bookingData.success && bookingData.data) {
          // Get the booking_info object
          const bookingInfo = bookingData.data;

          // Verify this is actually a booking_info object, not a quote object
          // Quote objects have: quote_number, admin_id, title
          // Booking info objects have: full_name, email, phone
          const isQuoteObject = bookingInfo.quote_number || bookingInfo.admin_id || bookingInfo.title;
          const isBookingInfoObject = bookingInfo.full_name !== undefined || bookingInfo.email !== undefined;

          if (isQuoteObject && !isBookingInfoObject) {
            console.error('⚠️ ERROR: API returned quote object instead of booking_info object');
            console.error('Received object:', bookingInfo);
            alert('Please complete your booking information before proceeding to payment.');
            return;
          }

          const status = bookingInfo.status; // This is the booking_info status field
          console.log('📋 Booking info status:', status, 'Full booking info:', bookingInfo);

          // Valid booking_info statuses are: 'incomplete', 'completed', 'verified'
          if (status !== 'completed' && status !== 'verified') {
            const missingFields = [];
            if (!bookingInfo.full_name || !bookingInfo.email || !bookingInfo.phone) {
              missingFields.push('personal information');
            }
            if (!bookingInfo.terms_accepted || !bookingInfo.privacy_policy_accepted) {
              missingFields.push('terms acceptance');
            }
            if (inquiry?.inquiry_type === 'flight' && (!bookingInfo.passport_number || !bookingInfo.passport_expiry_date)) {
              missingFields.push('passport information');
            }
            const message = missingFields.length > 0 
              ? `Please complete your booking information: ${missingFields.join(', ')}. Click "Fill Booking Information" to continue.`
              : 'Please complete your booking information before proceeding to payment. Make sure all required fields are filled and terms are accepted. Click "Fill Booking Information" to continue.';
            alert(message);
            return;
          }
          // Status is completed, proceed with payment
          console.log('✅ Booking info is complete, proceeding to payment');
        } else {
          // API returned success: false
          console.warn('Booking info check returned success: false', bookingData);
        }
      } else if (bookingInfoResponse.status === 404) {
        // Booking info doesn't exist - require it
        alert('Please complete your booking information before proceeding to payment. This includes personal details and travel documents.');
        return;
      } else {
        // Other error status
        console.error('Booking info check failed with status:', bookingInfoResponse.status);
        // Don't block payment on API errors - let user proceed
      }
    } catch (error) {
      console.error('Error checking booking info:', error);
      // Continue with payment if check fails (don't block user)
    }

    setPaymentLoading(true);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token');
      
      if (!token) {
        alert('Please log in to proceed with payment.');
        navigate('/login');
        return;
      }

      console.log('💳 Initiating payment for quote:', quote.id);
      console.log('   Amount:', quote.total_amount, quote.currency);
      console.log('   Quote Number:', quote.quote_number);
      
      // 1. Initiate payment session with ARC Pay
      const response = await fetch('/api/payments?action=initiate-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          quote_id: quote.id,
          return_url: `${window.location.origin}/payment/callback?quote_id=${quote.id}&inquiry_id=${inquiry.id}`,
          cancel_url: `${window.location.origin}/inquiry/${inquiry.id}?payment=cancelled`
        })
      });

      if (!response.ok) {
        let errorData = { error: `Server error (${response.status})` };
        try {
          const responseText = await response.text();
          console.log('❌ Raw error response text:', responseText);
          try {
            errorData = JSON.parse(responseText);
          } catch (jsonErr) {
            console.error('Response is not JSON:', responseText);
            errorData = { 
              error: `Server error (${response.status})`,
              details: responseText || 'Unable to connect to payment server'
            };
          }
        } catch (parseError) {
          console.error('Failed to read error response:', parseError);
          errorData = { 
            error: `Network error (${response.status})`,
            details: 'Unable to connect to payment server'
          };
        }
        
        console.error('Payment API error:', {
          status: response.status,
          error: errorData
        });
        
        // Build error message with fallbacks
        let errorMsg = 'Payment failed';
        if (errorData) {
          if (typeof errorData === 'string') {
            errorMsg = errorData;
          } else {
            errorMsg = errorData.error || errorData.details || errorData.message || `Server error: ${response.status}`;
          }
        }
        throw new Error(errorMsg);
      }

      let data;
      try {
        const responseText = await response.text();
        console.log('📦 Raw success response text:', responseText);
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('Failed to parse success response:', parseErr);
        throw new Error('Invalid response from payment server');
      }

      console.log('📦 Full payment API response:', data);

      if (!data.success) {
        console.error('Payment initiation failed:', data);
        let errorMsg = 'Failed to initiate payment';
        if (data) {
          if (typeof data === 'string') {
            errorMsg = data;
          } else {
            errorMsg = data.error || data.details || data.message || 'Failed to initiate payment';
          }
        }
        throw new Error(errorMsg);
      }

      const { sessionId, merchantId, successIndicator, paymentId, paymentPageUrl, checkoutUrl } = data;

      console.log('🔍 Extracted values:', {
        sessionId,
        merchantId,
        successIndicator,
        paymentId,
        paymentPageUrl,
        checkoutUrl
      });

      // Validate critical fields
      if (!sessionId) {
        console.error('Missing sessionId in payment response:', data);
        throw new Error('Payment session ID not provided by server. Please try again.');
      }

      const finalPaymentUrl = paymentPageUrl || checkoutUrl;
      if (!finalPaymentUrl) {
        console.error('Missing payment URL in payment response:', data);
        throw new Error('Payment page URL not provided by server. Please try again.');
      }

      console.log('✅ Payment session created successfully');
      console.log('   Session ID:', sessionId);
      console.log('   Merchant ID:', merchantId || 'N/A');
      console.log('   Payment ID:', paymentId);
      console.log('   Payment URL:', finalPaymentUrl);
      console.log('   Success Indicator:', successIndicator);

      // Double-check finalPaymentUrl is valid before redirecting
      if (!finalPaymentUrl || finalPaymentUrl === 'undefined' || finalPaymentUrl === 'null') {
        console.error('❌ Invalid payment URL:', finalPaymentUrl);
        console.error('   Full API response was:', data);
        throw new Error('Payment URL is invalid. Please contact support.');
      }

      // Validate sessionId
      if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
        console.error('❌ Invalid session ID:', sessionId);
        throw new Error('Payment session ID is invalid. Please try again.');
      }

      // Redirect to Hosted Payment Page (HPP)
      // The payment page URL is in format: https://na.gateway.mastercard.com/checkout/pay/{sessionId}
      // This is a simple GET redirect - no form POST needed
      console.log('🔄 Redirecting to ARC Pay Hosted Payment Page...');
      console.log('   Payment URL:', finalPaymentUrl);
      
      // Simple redirect to the payment page
      window.location.href = finalPaymentUrl;

      // Note: User will be redirected, so we don't reset loading state
      return; // Exit immediately - form submission will redirect

    } catch (error) {
      console.error('Payment initiation failed:', error);
      
      // Reset loading state on error
      setPaymentLoading(false);
      
      // Show user-friendly error message
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      // Safely extract error message
      const errMsg = error?.message || '';
      
      if (errMsg && errMsg !== 'undefined') {
        if (errMsg.includes('401') || errMsg.includes('403')) {
          errorMessage = 'Authentication required. Please log in and try again.';
        } else if (errMsg.includes('500')) {
          errorMessage = 'Payment server error. Please try again in a moment or contact support.';
        } else if (errMsg.includes('fetch') || errMsg.includes('network') || errMsg.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        } else {
          errorMessage = errMsg;
        }
      } else if (error instanceof TypeError) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }
      
      alert(`Payment Error: ${errorMessage}`);
      
      // Log detailed error for debugging
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        quoteId: quote?.id,
        inquiryId: inquiry?.id,
        quoteAmount: quote?.total_amount,
        quoteCurrency: quote?.currency
      });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'quoted': return 'bg-green-100 text-green-800';
      case 'booked': return 'bg-purple-100 text-purple-800';
      case 'paid': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending Review';
      case 'processing': return 'Processing';
      case 'quoted': return 'Quote Sent';
      case 'booked': return 'Booked';
      case 'cancelled': return 'Cancelled';
      case 'expired': return 'Expired';
      default: return status;
    }
  };

  const getInquiryTypeIcon = (type) => {
    switch (type) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'cruise': return '🚢';
      case 'package': return '🎒';
      case 'general': return '💬';
      default: return '📝';
    }
  };

  const getInquiryTypeName = (type) => {
    switch (type) {
      case 'flight': return 'Flight';
      case 'hotel': return 'Hotel';
      case 'cruise': return 'Cruise';
      case 'package': return 'Package';
      case 'general': return 'General';
      default: return 'Inquiry';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Navbar />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200/50 p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading inquiry details...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Navbar />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-8">
            <div className="text-center">
              <p className="text-red-600 mb-4 font-semibold">{error}</p>
              <button
                onClick={() => navigate('/my-trips')}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Back to My Trips
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Navbar />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-8 text-center">
            <p className="text-gray-600 mb-4 font-semibold">Inquiry not found</p>
            <button
              onClick={() => navigate('/my-trips')}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              Back to My Trips
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const sentQuotes = quotes.filter(q => q.status === 'sent' || q.status === 'accepted');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/my-trips')}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 font-semibold transition-colors duration-200 p-2 rounded-lg hover:bg-blue-50 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform duration-200">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to My Trips
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-6 lg:p-8 mb-6 relative overflow-hidden">
          {/* Gradient accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
          
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8 pt-4">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-lg transform transition-transform hover:scale-105 text-2xl">
                  {getInquiryTypeIcon(inquiry.inquiry_type)}
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">
                    {getInquiryTypeName(inquiry.inquiry_type)} Inquiry
                  </h1>
                  <p className="text-sm text-gray-500 mt-1 font-medium flex items-center gap-2">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono">#{inquiry.id?.slice(-8)}</span>
                  </p>
                </div>
              </div>
            </div>
            <span className={`inline-flex items-center px-4 py-1.5 text-sm font-bold rounded-full shadow-sm border ${getStatusColor(inquiry.status)} border-opacity-20`}>
              <span className="w-2 h-2 bg-current bg-opacity-50 rounded-full mr-2"></span>
              {getStatusText(inquiry.status)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</p>
              </div>
              <p className="font-bold text-gray-900 text-lg">{new Date(inquiry.created_at).toLocaleDateString()}</p>
              <p className="text-xs text-gray-400 font-medium">{new Date(inquiry.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 rounded-lg text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Updated</p>
              </div>
              <p className="font-bold text-gray-900 text-lg">{new Date(inquiry.updated_at).toLocaleDateString()}</p>
              <p className="text-xs text-gray-400 font-medium">{new Date(inquiry.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
            </div>
            {inquiry.expires_at && (
              <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</p>
                </div>
                <p className="font-bold text-gray-900 text-lg">{new Date(inquiry.expires_at).toLocaleDateString()}</p>
                <p className="text-xs text-gray-400 font-medium">{new Date(inquiry.expires_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</p>
              </div>
              <p className="font-bold text-gray-900 text-lg capitalize">{inquiry.priority || 'Normal'}</p>
              <p className="text-xs text-gray-400 font-medium">Handling level</p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Inquiry Details
            </h2>
            
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-100">
            {inquiry.inquiry_type === 'flight' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Route</p>
                  <p className="text-sm font-bold text-gray-900">{inquiry.flight_origin} → {inquiry.flight_destination}</p>
                </div>
                {inquiry.flight_departure_date && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Departure</p>
                    <p className="text-sm font-bold text-gray-900">{new Date(inquiry.flight_departure_date).toLocaleDateString()}</p>
                  </div>
                )}
                {inquiry.flight_return_date && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Return</p>
                    <p className="text-sm font-bold text-gray-900">{new Date(inquiry.flight_return_date).toLocaleDateString()}</p>
                  </div>
                )}
                {inquiry.flight_passengers && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Passengers</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.flight_passengers}</p>
                  </div>
                )}
                {inquiry.flight_class && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Class</p>
                    <p className="text-sm font-bold text-gray-900 capitalize">{inquiry.flight_class}</p>
                  </div>
                )}
              </div>
            )}

            {inquiry.inquiry_type === 'hotel' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Destination</p>
                  <p className="text-sm font-bold text-gray-900">{inquiry.hotel_destination}</p>
                </div>
                {inquiry.hotel_checkin_date && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Check-in</p>
                    <p className="text-sm font-bold text-gray-900">{new Date(inquiry.hotel_checkin_date).toLocaleDateString()}</p>
                  </div>
                )}
                {inquiry.hotel_checkout_date && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Check-out</p>
                    <p className="text-sm font-bold text-gray-900">{new Date(inquiry.hotel_checkout_date).toLocaleDateString()}</p>
                  </div>
                )}
                {inquiry.hotel_rooms && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Rooms</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.hotel_rooms}</p>
                  </div>
                )}
                {inquiry.hotel_guests && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Guests</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.hotel_guests}</p>
                  </div>
                )}
                {inquiry.hotel_room_type && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Room Type</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.hotel_room_type}</p>
                  </div>
                )}
              </div>
            )}

            {inquiry.inquiry_type === 'cruise' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Destination</p>
                  <p className="text-sm font-bold text-gray-900">{inquiry.cruise_destination}</p>
                </div>
                {inquiry.cruise_departure_date && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Departure</p>
                    <p className="text-sm font-bold text-gray-900">{new Date(inquiry.cruise_departure_date).toLocaleDateString()}</p>
                  </div>
                )}
                {inquiry.cruise_duration && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Duration</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.cruise_duration} days</p>
                  </div>
                )}
                {inquiry.cruise_passengers && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Passengers</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.cruise_passengers}</p>
                  </div>
                )}
                {inquiry.cruise_cabin_type && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Cabin Type</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.cruise_cabin_type}</p>
                  </div>
                )}
              </div>
            )}

            {inquiry.inquiry_type === 'package' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Destination</p>
                  <p className="text-sm font-bold text-gray-900">{inquiry.package_destination}</p>
                </div>
                {inquiry.package_start_date && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Start Date</p>
                    <p className="text-sm font-bold text-gray-900">{new Date(inquiry.package_start_date).toLocaleDateString()}</p>
                  </div>
                )}
                {inquiry.package_end_date && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">End Date</p>
                    <p className="text-sm font-bold text-gray-900">{new Date(inquiry.package_end_date).toLocaleDateString()}</p>
                  </div>
                )}
                {inquiry.package_travelers && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Travelers</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.package_travelers}</p>
                  </div>
                )}
                {inquiry.package_budget_range && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Budget</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.package_budget_range}</p>
                  </div>
                )}
                {inquiry.package_interests && inquiry.package_interests.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Interests</p>
                    <p className="text-sm font-bold text-gray-900">{Array.isArray(inquiry.package_interests) ? inquiry.package_interests.join(', ') : inquiry.package_interests}</p>
                  </div>
                )}
              </div>
            )}

            {inquiry.inquiry_type === 'general' && (
              <div className="space-y-4">
                {inquiry.inquiry_subject && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Subject</p>
                    <p className="text-sm font-bold text-gray-900">{inquiry.inquiry_subject}</p>
                  </div>
                )}
                {inquiry.inquiry_message && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Message</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{inquiry.inquiry_message}</p>
                  </div>
                )}
              </div>
            )}

            {inquiry.special_requirements && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Special Requirements</p>
                <p className="text-sm text-gray-700">{inquiry.special_requirements}</p>
              </div>
            )}

            {inquiry.budget_range && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Budget Range</p>
                <p className="text-sm font-bold text-gray-900">{inquiry.budget_range}</p>
              </div>
            )}
            </div>
          </div>
        </div>

        {sentQuotes.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-6 lg:p-8 relative overflow-hidden">
            {/* Gradient accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 to-emerald-600"></div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pt-4 flex items-center gap-2">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Quotes
            </h2>
            <div className="space-y-6">
              {sentQuotes.map((quote) => (
                <div key={quote.id} className="border-2 border-green-200 rounded-xl p-6 bg-gradient-to-r from-green-50 to-emerald-50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white shadow-md transform transition-transform group-hover:scale-110">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-green-900">Quote #{quote.quote_number}</h3>
                          <p className="text-sm text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-md inline-block mt-1 capitalize">Status: {quote.status}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-700">
                        ${parseFloat(quote.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg text-gray-500 font-normal">{quote.currency || 'USD'}</span>
                      </p>
                    </div>
                  </div>
                  
                  {quote.breakdown && Array.isArray(quote.breakdown) && quote.breakdown.length > 0 && (
                    <div className="mt-4 mb-4 p-4 bg-white rounded-lg border border-green-200">
                      <p className="text-sm font-bold text-gray-700 mb-3">Breakdown:</p>
                      <ul className="space-y-2">
                        {quote.breakdown.map((item, idx) => (
                          <li key={idx} className="text-sm text-gray-700 flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                            <span className="font-medium">{item.description || item.item || 'Item'}</span>
                            <span className="font-bold text-green-700">${item.amount || item.price || 0}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {quote.admin_notes && (
                    <div className="mt-4 p-4 bg-white rounded-lg border-l-4 border-green-500">
                      <p className="text-sm font-bold text-gray-700 mb-2">Notes from our team:</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{quote.admin_notes}</p>
                    </div>
                  )}

                  {quote.expires_at && (
                    <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Expires</p>
                      <p className="text-sm font-bold text-amber-800">
                        {new Date(quote.expires_at).toLocaleDateString()} at {new Date(quote.expires_at).toLocaleTimeString()}
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col sm:flex-row gap-3 flex-wrap pt-4 border-t border-green-200">
                    <Link
                      to="/quote-detail"
                      state={{ quoteData: quote, inquiryData: inquiry }}
                      className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    >
                      View Full Quote Details
                    </Link>

                    {/* Fill Booking Information Button */}
                    {quote.payment_status === 'unpaid' && (quote.status === 'sent' || quote.status === 'accepted') && (
                      <button
                        onClick={() => {
                          setSelectedQuoteForBooking(quote);
                          setShowBookingForm(true);
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-yellow-600 to-yellow-700 text-white text-sm font-semibold rounded-lg hover:from-yellow-700 hover:to-yellow-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                      >
                        📝 Fill Booking Information
                      </button>
                    )}

                    {/* Pay Now Button */}
                    {quote.payment_status === 'unpaid' && (quote.status === 'sent' || quote.status === 'accepted') && (
                      <button
                        onClick={() => handlePayNow(quote)}
                        disabled={paymentLoading || loading}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:transform-none"
                        title={
                          paymentLoading 
                            ? 'Processing payment...' 
                            : `Click to pay $${parseFloat(quote.total_amount || 0).toFixed(2)} ${quote.currency || 'USD'}`
                        }
                        aria-label={`Pay ${parseFloat(quote.total_amount || 0).toFixed(2)} ${quote.currency || 'USD'}`}
                        aria-busy={paymentLoading}
                        type="button"
                      >
                        {paymentLoading ? (
                          <span className="flex items-center gap-2">
                            <svg 
                              className="animate-spin h-4 w-4" 
                              viewBox="0 0 24 24" 
                              fill="none"
                              aria-hidden="true"
                            >
                              <circle 
                                className="opacity-25" 
                                cx="12" 
                                cy="12" 
                                r="10" 
                                stroke="currentColor" 
                                strokeWidth="4"
                              ></circle>
                              <path 
                                className="opacity-75" 
                                fill="currentColor" 
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            <span>Processing...</span>
                          </span>
                        ) : (
                          <span>💳 Pay Now - ${parseFloat(quote.total_amount || 0).toFixed(2)} {quote.currency || 'USD'}</span>
                        )}
                      </button>
                    )}

                    {/* Payment Status Badge */}
                    {quote.payment_status === 'paid' && (
                      <span className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm rounded-lg font-semibold shadow-md">
                        ✓ Paid
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {quotes.length === 0 && inquiry.status !== 'quoted' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-700 font-semibold">No quotes have been sent yet.</p>
            <p className="text-gray-500 text-sm mt-2">Our team is working on your inquiry.</p>
          </div>
        )}

        {/* Booking Info Form Modal */}
        {showBookingForm && selectedQuoteForBooking && (
          <BookingInfoForm
            quoteId={selectedQuoteForBooking.id}
            inquiryType={inquiry?.inquiry_type}
            onComplete={(bookingInfo) => {
              setShowBookingForm(false);
              setSelectedQuoteForBooking(null);
              // Refresh inquiry data to get updated booking info status
              if (bookingInfo && bookingInfo.status === 'completed') {
                console.log('✅ Booking info completed, you can now proceed to payment');
                // Optionally show a success message
                // The payment button will now work on next click
              }
            }}
            onClose={() => {
              setShowBookingForm(false);
              setSelectedQuoteForBooking(null);
            }}
          />
        )}
      </div>
      <Footer />
    </div>
  );
};

export default InquiryDetail;

