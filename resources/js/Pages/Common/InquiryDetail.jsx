import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

// Load ARC Pay Checkout.js SDK with retry logic and better error handling
const loadCheckoutScript = () => {
  return new Promise((resolve, reject) => {
    if (window.Checkout) {
      console.log('✅ Checkout.js already loaded');
      resolve();
      return;
    }
    
    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="checkout.min.js"]');
    if (existingScript) {
      console.log('⏳ Checkout.js script already in DOM, waiting...');
      // Wait for it to load
      const checkInterval = setInterval(() => {
        if (window.Checkout) {
          clearInterval(checkInterval);
          console.log('✅ Checkout.js loaded from existing script');
          resolve();
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.Checkout) {
          reject(new Error('Checkout.js loading timeout (existing script)'));
        }
      }, 30000);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://api.arcpay.travel/static/checkout/checkout.min.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.id = 'arc-pay-checkout-script';
    
    let timeoutId;
    const timeout = setTimeout(() => {
      if (!window.Checkout) {
        console.error('⏱️ Checkout.js loading timeout after 30 seconds');
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error('Checkout.js loading timeout'));
      }
    }, 30000); // 30 second timeout (increased from 15)
    
    script.onload = () => {
      clearTimeout(timeout);
      // Give it a moment to initialize
      setTimeout(() => {
        if (window.Checkout) {
          console.log('✅ Checkout.js loaded successfully');
          resolve();
        } else {
          console.warn('⚠️ Script loaded but Checkout not available yet, waiting...');
          // Wait a bit more
          let retries = 10;
          const checkInterval = setInterval(() => {
            if (window.Checkout) {
              clearInterval(checkInterval);
              console.log('✅ Checkout.js available after wait');
              resolve();
            } else if (retries-- === 0) {
              clearInterval(checkInterval);
              reject(new Error('Checkout.js loaded but not available'));
            }
          }, 500);
        }
      }, 1000);
    };
    
    script.onerror = (error) => {
      clearTimeout(timeout);
      console.error('❌ Failed to load Checkout.js:', error);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      reject(new Error('Failed to load Checkout.js from ARC Pay. Please check your internet connection.'));
    };
    
    document.head.appendChild(script);
    console.log('📥 Loading Checkout.js from:', script.src);
  });
};

const InquiryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inquiry, setInquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [checkoutReady, setCheckoutReady] = useState(false);

  useEffect(() => {
    fetchInquiryDetails();
    
    // Load Checkout.js SDK with retry logic and continuous monitoring
    const loadSDK = async () => {
      let retries = 5; // Increased retries
      while (retries > 0) {
        try {
          await loadCheckoutScript();
          setCheckoutReady(true);
          console.log('✅ Payment system ready');
          return;
        } catch (error) {
          retries--;
          console.warn(`⚠️ Checkout.js load failed, ${retries} retries remaining:`, error.message);
          if (retries === 0) {
            console.error('❌ Failed to load Checkout.js after all retries');
            // Don't set error immediately - allow manual retry
            // Set a monitor to check if it loads later
            const monitorInterval = setInterval(() => {
              if (window.Checkout) {
                console.log('✅ Checkout.js loaded later, enabling payment');
                setCheckoutReady(true);
                clearInterval(monitorInterval);
              }
            }, 2000);
            
            // Stop monitoring after 60 seconds
            setTimeout(() => {
              clearInterval(monitorInterval);
              if (!checkoutReady) {
                console.warn('⚠️ Checkout.js still not loaded after monitoring period');
              }
            }, 60000);
          } else {
            // Wait 3 seconds before retry (increased from 2)
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
    };
    
    loadSDK();
    
    // Also set up a continuous check in case SDK loads later
    const continuousCheck = setInterval(() => {
      if (window.Checkout && !checkoutReady) {
        console.log('✅ Checkout.js detected, enabling payment');
        setCheckoutReady(true);
        clearInterval(continuousCheck);
      }
    }, 1000);
    
    // Cleanup after 2 minutes
    setTimeout(() => {
      clearInterval(continuousCheck);
    }, 120000);
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
    // Validate prerequisites - but allow manual retry
    if (!window.Checkout) {
      // Try to reload the script one more time
      console.log('🔄 Checkout.js not available, attempting to reload...');
      try {
        await loadCheckoutScript();
        setCheckoutReady(true);
        console.log('✅ Checkout.js loaded on demand');
      } catch (error) {
        console.error('❌ Failed to load Checkout.js on demand:', error);
        alert('Payment system is not available. Please check your internet connection and refresh the page.\n\nError: ' + error.message);
        return;
      }
    }

    if (!window.Checkout) {
      alert('Payment system not ready. Please refresh the page and try again.');
      return;
    }

    if (!quote || !quote.id) {
      alert('Invalid quote information. Please refresh the page.');
      return;
    }

    if (!inquiry || !inquiry.id) {
      alert('Invalid inquiry information. Please refresh the page.');
      return;
    }

    // Validate quote amount
    if (!quote.total_amount || parseFloat(quote.total_amount) <= 0) {
      alert('Invalid payment amount. Please contact support.');
      return;
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
        const errorData = await response.json().catch(() => ({ 
          error: `Network error (${response.status})`,
          details: 'Unable to connect to payment server'
        }));
        
        console.error('Payment API error:', {
          status: response.status,
          error: errorData
        });
        
        throw new Error(errorData.error || errorData.details || `Server error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        console.error('Payment initiation failed:', data);
        throw new Error(data.error || data.details || 'Failed to initiate payment');
      }

      const { sessionId, merchantId, successIndicator, paymentId } = data;

      if (!sessionId || !merchantId) {
        console.error('Invalid payment response:', data);
        throw new Error('Invalid response from payment server. Please try again.');
      }

      console.log('✅ Payment session created successfully');
      console.log('   Session ID:', sessionId);
      console.log('   Merchant ID:', merchantId);
      console.log('   Payment ID:', paymentId);

      // 2. Configure ARC Pay hosted checkout
      try {
        const checkoutConfig = {
          merchant: merchantId,
          session: {
            id: sessionId
          },
          interaction: {
            merchant: {
              name: 'JetSet Travel',
              address: {
                line1: '123 Travel Street',
                city: 'New York',
                stateProvince: 'NY',
                postalCode: '10001',
                country: 'USA'
              }
            },
            displayControl: {
              billingAddress: 'OPTIONAL',
              customerEmail: 'OPTIONAL'
            }
          }
        };

        console.log('⚙️ Configuring Checkout.js...');
        window.Checkout.configure(checkoutConfig);

        console.log('✅ Checkout configured successfully');
        console.log('🔄 Redirecting to ARC Pay payment page...');

        // Small delay to ensure configuration is complete
        await new Promise(resolve => setTimeout(resolve, 150));

        // 3. Redirect to hosted payment page
        if (typeof window.Checkout.showPaymentPage === 'function') {
          window.Checkout.showPaymentPage();
        } else {
          throw new Error('Checkout.showPaymentPage is not available');
        }
        
        // Note: User will be redirected, so we don't reset loading state here
        // The loading state will persist until redirect completes
        
      } catch (checkoutError) {
        console.error('Checkout configuration error:', checkoutError);
        console.error('Checkout object:', window.Checkout);
        throw new Error('Failed to configure payment page. Please refresh and try again.');
      }

    } catch (error) {
      console.error('Payment initiation failed:', error);
      
      // Reset loading state on error
      setPaymentLoading(false);
      
      // Show user-friendly error message
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage = 'Authentication required. Please log in and try again.';
      } else if (error.message.includes('500')) {
        errorMessage = 'Payment server error. Please try again in a moment or contact support.';
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
      <div className="min-h-screen bg-[#f0f7fc]">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex-1 bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading inquiry details...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f0f7fc]">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => navigate('/my-trips')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
      <div className="min-h-screen bg-[#f0f7fc]">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-600 mb-4">Inquiry not found</p>
            <button
              onClick={() => navigate('/my-trips')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
    <div className="min-h-screen bg-[#f0f7fc]">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/my-trips')}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            ← Back to My Trips
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-3xl">{getInquiryTypeIcon(inquiry.inquiry_type)}</span>
                {getInquiryTypeName(inquiry.inquiry_type)} Inquiry
              </h1>
              <p className="text-sm text-gray-500 mt-1">ID: {inquiry.id?.slice(-8)}</p>
            </div>
            <span className={`px-4 py-2 text-sm font-medium rounded-full ${getStatusColor(inquiry.status)}`}>
              {getStatusText(inquiry.status)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-sm text-gray-500">Submitted</p>
              <p className="font-medium">{new Date(inquiry.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Updated</p>
              <p className="font-medium">{new Date(inquiry.updated_at).toLocaleString()}</p>
            </div>
            {inquiry.expires_at && (
              <div>
                <p className="text-sm text-gray-500">Expires</p>
                <p className="font-medium">{new Date(inquiry.expires_at).toLocaleString()}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Priority</p>
              <p className="font-medium capitalize">{inquiry.priority || 'Normal'}</p>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">Inquiry Details</h2>
            
            {inquiry.inquiry_type === 'flight' && (
              <div className="space-y-2">
                <p><strong>Route:</strong> {inquiry.flight_origin} → {inquiry.flight_destination}</p>
                {inquiry.flight_departure_date && <p><strong>Departure:</strong> {new Date(inquiry.flight_departure_date).toLocaleDateString()}</p>}
                {inquiry.flight_return_date && <p><strong>Return:</strong> {new Date(inquiry.flight_return_date).toLocaleDateString()}</p>}
                {inquiry.flight_passengers && <p><strong>Passengers:</strong> {inquiry.flight_passengers}</p>}
                {inquiry.flight_class && <p><strong>Class:</strong> {inquiry.flight_class}</p>}
              </div>
            )}

            {inquiry.inquiry_type === 'hotel' && (
              <div className="space-y-2">
                <p><strong>Destination:</strong> {inquiry.hotel_destination}</p>
                {inquiry.hotel_checkin_date && <p><strong>Check-in:</strong> {new Date(inquiry.hotel_checkin_date).toLocaleDateString()}</p>}
                {inquiry.hotel_checkout_date && <p><strong>Check-out:</strong> {new Date(inquiry.hotel_checkout_date).toLocaleDateString()}</p>}
                {inquiry.hotel_rooms && <p><strong>Rooms:</strong> {inquiry.hotel_rooms}</p>}
                {inquiry.hotel_guests && <p><strong>Guests:</strong> {inquiry.hotel_guests}</p>}
                {inquiry.hotel_room_type && <p><strong>Room Type:</strong> {inquiry.hotel_room_type}</p>}
              </div>
            )}

            {inquiry.inquiry_type === 'cruise' && (
              <div className="space-y-2">
                <p><strong>Destination:</strong> {inquiry.cruise_destination}</p>
                {inquiry.cruise_departure_date && <p><strong>Departure:</strong> {new Date(inquiry.cruise_departure_date).toLocaleDateString()}</p>}
                {inquiry.cruise_duration && <p><strong>Duration:</strong> {inquiry.cruise_duration} days</p>}
                {inquiry.cruise_passengers && <p><strong>Passengers:</strong> {inquiry.cruise_passengers}</p>}
                {inquiry.cruise_cabin_type && <p><strong>Cabin Type:</strong> {inquiry.cruise_cabin_type}</p>}
              </div>
            )}

            {inquiry.inquiry_type === 'package' && (
              <div className="space-y-2">
                <p><strong>Destination:</strong> {inquiry.package_destination}</p>
                {inquiry.package_start_date && <p><strong>Start Date:</strong> {new Date(inquiry.package_start_date).toLocaleDateString()}</p>}
                {inquiry.package_end_date && <p><strong>End Date:</strong> {new Date(inquiry.package_end_date).toLocaleDateString()}</p>}
                {inquiry.package_travelers && <p><strong>Travelers:</strong> {inquiry.package_travelers}</p>}
                {inquiry.package_budget_range && <p><strong>Budget:</strong> {inquiry.package_budget_range}</p>}
                {inquiry.package_interests && inquiry.package_interests.length > 0 && (
                  <p><strong>Interests:</strong> {Array.isArray(inquiry.package_interests) ? inquiry.package_interests.join(', ') : inquiry.package_interests}</p>
                )}
              </div>
            )}

            {inquiry.inquiry_type === 'general' && (
              <div className="space-y-2">
                {inquiry.inquiry_subject && <p><strong>Subject:</strong> {inquiry.inquiry_subject}</p>}
                {inquiry.inquiry_message && (
                  <div>
                    <strong>Message:</strong>
                    <p className="mt-1 text-gray-700 whitespace-pre-wrap">{inquiry.inquiry_message}</p>
                  </div>
                )}
              </div>
            )}

            {inquiry.special_requirements && (
              <div className="mt-4">
                <strong>Special Requirements:</strong>
                <p className="mt-1 text-gray-700">{inquiry.special_requirements}</p>
              </div>
            )}

            {inquiry.budget_range && (
              <div className="mt-4">
                <strong>Budget Range:</strong> {inquiry.budget_range}
              </div>
            )}
          </div>
        </div>

        {sentQuotes.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Quotes</h2>
            <div className="space-y-4">
              {sentQuotes.map((quote) => (
                <div key={quote.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-green-800">Quote #{quote.quote_number}</h3>
                      <p className="text-sm text-gray-600">Status: {quote.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-700">
                        ${quote.total_amount} {quote.currency || 'USD'}
                      </p>
                    </div>
                  </div>
                  
                  {quote.breakdown && Array.isArray(quote.breakdown) && quote.breakdown.length > 0 && (
                    <div className="mt-3 mb-3">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Breakdown:</p>
                      <ul className="space-y-1">
                        {quote.breakdown.map((item, idx) => (
                          <li key={idx} className="text-sm text-gray-600 flex justify-between">
                            <span>{item.description || item.item || 'Item'}</span>
                            <span>${item.amount || item.price || 0}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {quote.admin_notes && (
                    <div className="mt-3 p-3 bg-white rounded border border-green-200">
                      <p className="text-sm font-semibold text-gray-700 mb-1">Notes:</p>
                      <p className="text-sm text-gray-600">{quote.admin_notes}</p>
                    </div>
                  )}

                  {quote.expires_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      Expires: {new Date(quote.expires_at).toLocaleString()}
                    </p>
                  )}

                  <div className="mt-4 flex gap-3 flex-wrap">
                    <Link
                      to="/quote-detail"
                      state={{ quoteData: quote, inquiryData: inquiry }}
                      className="inline-block px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                    >
                      View Full Quote Details
                    </Link>

                    {/* Pay Now Button - Perfect Implementation */}
                    {quote.payment_status === 'unpaid' && (quote.status === 'sent' || quote.status === 'accepted') && (
                      <button
                        onClick={() => handlePayNow(quote)}
                        disabled={paymentLoading || loading}
                        className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors"
                        title={
                          paymentLoading 
                            ? 'Processing payment...' 
                            : !checkoutReady && !window.Checkout
                            ? 'Payment system loading... (Click to retry)' 
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
                      <span className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 text-sm rounded-md font-semibold">
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
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <p className="text-gray-600">No quotes have been sent yet. Our team is working on your inquiry.</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default InquiryDetail;

