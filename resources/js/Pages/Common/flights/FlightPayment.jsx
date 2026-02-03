import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CreditCard, Calendar, Lock, CheckCircle, ArrowLeft,
  ChevronDown, ChevronUp, X, Ticket, ShieldCheck,
  ArrowRight, ChevronsRight, MapPin, Check, Star,
  Clock, BadgeCheck, AlertCircle, Info, UserCircle
} from "lucide-react";
import Navbar from "../Navbar";
import Footer from "../Footer";
import withPageElements from "../PageWrapper";
import ArcPayService from "../../../Services/ArcPayService";
import LoadingSpinner from "../../../Components/LoadingSpinner";

function FlightPayment() {
  const location = useLocation();
  const navigate = useNavigate();
  const [paymentData, setPaymentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePaymentMethod, setActivePaymentMethod] = useState("creditCard");
  const [cardDetails, setCardDetails] = useState({
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cvv: "",
  });
  const [upiId, setUpiId] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showEmiOptions, setShowEmiOptions] = useState(false);
  const [showPaymentResult, setShowPaymentResult] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(true);
  const [showFareDetails, setShowFareDetails] = useState(true);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [timerExpired, setTimerExpired] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);

  // Timer Effect
  useEffect(() => {
    if (timeLeft <= 0) {
      setTimerExpired(true);
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft]);

  // Clear stale session flags and load payment data
  useEffect(() => {
    // Always clear session flags on fresh page load to allow new payment attempts
    sessionStorage.removeItem('arcPayRedirectInitiated');
    sessionStorage.removeItem('arcPayFailedAttempts');

    if (location.state) {
      setPaymentData(location.state);
      setLoading(false);
    } else {
      navigate("/flights");
    }
  }, [location, navigate]);

  // Auto-redirect to ARC Pay when payment data is ready
  useEffect(() => {
    const redirectToArcPay = async () => {
      if (!paymentData || processingPayment) return;

      // Check if already redirecting
      const redirecting = sessionStorage.getItem('arcPayRedirecting');
      if (redirecting === 'true') {
        console.log('⚠️ Redirect already in progress');
        return;
      }

      try {
        setProcessingPayment(true);
        sessionStorage.setItem('arcPayRedirecting', 'true');

        console.log('🔍 Redirecting to ARC Pay Hosted Checkout...');
        console.log('📋 Payment data received:', paymentData);

        // Calculate amount from calculatedFare or selectedFlight
        const amount = paymentData?.calculatedFare?.totalAmount ||
          paymentData?.calculatedFare?.totalPrice ||
          paymentData?.calculatedFare?.total ||
          paymentData?.bookingDetails?.flight?.price?.total ||
          paymentData?.selectedFlight?.price?.total ||
          paymentData?.selectedFlight?.price?.amount ||
          paymentData?.amount || 100;

        // Extract flight details from bookingDetails or selectedFlight
        const flightDetails = paymentData?.bookingDetails?.flight || {};
        const selectedFlight = paymentData?.selectedFlight || {};

        // Get flight number from multiple sources
        const flightNumber = flightDetails?.flightNumber ||
          `${selectedFlight?.airline?.code || 'XX'} ${selectedFlight?.id || '000'}`;

        // Get carrier code
        const carrierCode = flightDetails?.flightNumber?.split(' ')[0] ||
          selectedFlight?.airline?.code || 'XX';

        // Get departure/arrival info
        const departureAirport = flightDetails?.departureCity ||
          selectedFlight?.departure?.airport || 'XXX';
        const arrivalAirport = flightDetails?.arrivalCity ||
          selectedFlight?.arrival?.airport || 'XXX';
        const departureDate = flightDetails?.departureDate ||
          selectedFlight?.departure?.date || new Date().toISOString().split('T')[0];

        // Get segments from bookingDetails or selectedFlight
        const segments = flightDetails?.segments || selectedFlight?.segments || [];

        // Build comprehensive flight data for ARC Pay (no carrierName - causes API errors with spaces)
        const flightDataForArcPay = {
          flightNumber: flightNumber,
          carrierCode: carrierCode,
          // carrierName removed - ARC Pay rejects names with spaces like "AIR INDIA"
          origin: departureAirport,
          destination: arrivalAirport,
          departureDate: departureDate,
          segments: segments.map(seg => ({
            carrierCode: seg.carrier || carrierCode,
            flightNumber: seg.number || flightNumber.split(' ')[1] || '000',
            departure: {
              iataCode: seg.departure?.airport || departureAirport,
              at: seg.departure?.time || departureDate
            },
            arrival: {
              iataCode: seg.arrival?.airport || arrivalAirport,
              at: seg.arrival?.time || ''
            }
          })),
          // Include original offer if available (for Amadeus API compatibility)
          originalOffer: selectedFlight?.originalOffer || selectedFlight,
          itineraries: selectedFlight?.itineraries || [{
            segments: segments.map(seg => ({
              carrierCode: seg.carrier || carrierCode,
              number: seg.number || flightNumber.split(' ')[1] || '000',
              departure: { iataCode: seg.departure?.airport || departureAirport, at: seg.departure?.time || departureDate },
              arrival: { iataCode: seg.arrival?.airport || arrivalAirport, at: seg.arrival?.time || '' }
            }))
          }]
        };

        console.log('✈️ Flight data for ARC Pay:', flightDataForArcPay);

        // Store booking data in localStorage before redirect
        const bookingData = {
          selectedFlight: paymentData?.selectedFlight,
          originalOffer: paymentData?.selectedFlight?.originalOffer || paymentData?.bookingDetails?.originalOffer,
          passengerData: paymentData?.passengerData,
          bookingDetails: paymentData?.bookingDetails,
          calculatedFare: paymentData?.calculatedFare,
          amount: amount,
          flightData: flightDataForArcPay
        };
        localStorage.setItem('pendingFlightBooking', JSON.stringify(bookingData));

        // ARC Pay requires order IDs: alphanumeric, 11-40 characters
        const orderId = `FLT${Date.now().toString(36).toUpperCase()}`;

        // Build description with actual flight info
        const description = `Flight ${flightNumber} - ${departureAirport} to ${arrivalAirport}`;

        const checkoutResponse = await ArcPayService.createHostedCheckout({
          amount: amount,
          currency: paymentData?.calculatedFare?.currency || 'USD',
          orderId: orderId,
          bookingType: 'flight',
          customerEmail: paymentData?.passengerData?.[0]?.email || 'customer@jetsetgo.com',
          customerName: paymentData?.passengerData?.[0]
            ? `${paymentData.passengerData[0].firstName} ${paymentData.passengerData[0].lastName}`
            : 'Guest User',
          customerPhone: paymentData?.passengerData?.[0]?.phone || paymentData?.passengerData?.[0]?.mobile,
          description: `Flight Booking ${orderId}`,
          returnUrl: `${window.location.origin}/payment/callback?orderId=${orderId}&bookingType=flight`,
          cancelUrl: `${window.location.origin}/flights?cancelled=true`,
          // Removed flightData and bookingData - was causing payment failures
          // Will re-add after basic payment works
        });

        if (checkoutResponse.success && checkoutResponse.checkoutUrl) {
          console.log('✅ Redirecting to ARC Pay:', checkoutResponse.checkoutUrl);
          localStorage.setItem('pendingPaymentSession', JSON.stringify({
            sessionId: checkoutResponse.sessionId,
            orderId: orderId,
            bookingType: 'flight',
            amount: amount
          }));
          // Redirect to ARC Pay hosted checkout page
          window.location.href = checkoutResponse.checkoutUrl;
        } else {
          console.error('❌ Checkout creation failed:', checkoutResponse.error);
          sessionStorage.removeItem('arcPayRedirecting');
          setProcessingPayment(false);
          setError('Failed to create payment session. Please try again.');
        }
      } catch (error) {
        console.error('❌ Redirect failed:', error);
        sessionStorage.removeItem('arcPayRedirecting');
        setProcessingPayment(false);
        setError('Payment service temporarily unavailable. Please try again.');
      }
    };

    // Small delay to ensure data is ready
    const timer = setTimeout(redirectToArcPay, 300);
    return () => clearTimeout(timer);
  }, [paymentData, processingPayment]);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handlePromoCodeChange = (e) => {
    setPromoCode(e.target.value.toUpperCase());
    setPromoApplied(false);
    setDiscountAmount(0);
    setFormErrors({ ...formErrors, promoCode: "" });
  };

  const applyPromoCode = () => {
    if (!promoCode) {
      setFormErrors({ ...formErrors, promoCode: "Please enter a promo code" });
      return;
    }

    if (promoCode === "FLYHIGH10") {
      const calculatedDiscount = Math.min(paymentData?.calculatedFare?.totalAmount * 0.1 || 0, 500);
      setDiscountAmount(calculatedDiscount);
      setPromoApplied(true);
      setFormErrors({ ...formErrors, promoCode: "" });
    } else {
      setFormErrors({ ...formErrors, promoCode: "Invalid promo code" });
      setPromoApplied(false);
      setDiscountAmount(0);
    }
  };

  // Calculate final amount from multiple possible sources
  const getBaseAmount = () => {
    if (paymentData?.calculatedFare?.totalAmount) return paymentData.calculatedFare.totalAmount;
    if (paymentData?.calculatedFare?.totalPrice) return paymentData.calculatedFare.totalPrice;
    if (paymentData?.selectedFlight?.price?.total) return parseFloat(paymentData.selectedFlight.price.total);
    if (paymentData?.selectedFlight?.price?.amount) return parseFloat(paymentData.selectedFlight.price.amount);
    if (paymentData?.bookingDetails?.flight?.price?.total) return parseFloat(paymentData.bookingDetails.flight.price.total);
    if (paymentData?.amount) return paymentData.amount;
    return 100; // Fallback amount for testing
  };

  const finalAmount = paymentData ? getBaseAmount() - discountAmount : 100;

  const toggleFareDetails = () => {
    setShowFareDetails(!showFareDetails);
  };

  const handleCardDetailsChange = (e) => {
    const { name, value } = e.target;
    setFormErrors({ ...formErrors, [name]: "" });

    if (name === "cardNumber") {
      const formattedValue = value
        .replace(/\s/g, "")
        .replace(/(\d{4})/g, "$1 ")
        .trim()
        .slice(0, 19);
      setCardDetails({ ...cardDetails, [name]: formattedValue });
      return;
    }

    if (name === "expiryDate") {
      const formattedValue = value
        .replace(/\//g, "")
        .replace(/(\d{2})(\d{0,2})/, "$1/$2")
        .slice(0, 5);
      setCardDetails({ ...cardDetails, [name]: formattedValue });
      return;
    }

    setCardDetails({ ...cardDetails, [name]: value });
  };

  const validateForm = () => {
    const errors = {};

    if (activePaymentMethod === "creditCard") {
      if (!cardDetails.cardNumber.replace(/\s/g, "").match(/^\d{16}$/)) {
        errors.cardNumber = "Please enter a valid 16-digit card number";
      }
      if (!cardDetails.cardHolder.trim()) {
        errors.cardHolder = "Please enter the cardholder name";
      }
      if (!cardDetails.expiryDate.match(/^(0[1-9]|1[0-2])\/\d{2}$/)) {
        errors.expiryDate = "Please enter a valid expiry date (MM/YY)";
      }
      if (!cardDetails.cvv.match(/^\d{3,4}$/)) {
        errors.cvv = "Please enter a valid CVV";
      }
    } else if (activePaymentMethod === "upi") {
      if (!upiId.match(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/)) {
        errors.upiId = "Please enter a valid UPI ID";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePaymentSubmit = async () => {
    if (timerExpired) {
      alert("Session expired. Please restart the booking process.");
      navigate("/flights");
      return;
    }

    setProcessingPayment(true);

    try {
      // Check gateway status first
      console.log('🔍 Checking ARC Pay Gateway status...');
      const gatewayStatus = await ArcPayService.checkGatewayStatus();

      if (!gatewayStatus.success || !gatewayStatus.gatewayOperational) {
        console.warn('Gateway status check failed:', gatewayStatus);
        throw new Error('Payment gateway is currently unavailable. Please try again later.');
      }

      // Store booking data in localStorage before redirect
      const bookingData = {
        selectedFlight: paymentData?.selectedFlight,
        originalOffer: paymentData?.selectedFlight?.originalOffer || paymentData?.bookingDetails?.originalOffer,
        passengerData: paymentData?.passengerData,
        bookingDetails: paymentData?.bookingDetails,
        calculatedFare: paymentData?.calculatedFare,
        amount: finalAmount
      };
      localStorage.setItem('pendingFlightBooking', JSON.stringify(bookingData));

      // Create hosted checkout session - redirects to ARC Pay payment page
      // ARC Pay requires order IDs: alphanumeric, 11-40 characters
      const orderId = `FLT${Date.now().toString(36).toUpperCase()}`;
      console.log('🚀 Creating ARC Pay hosted checkout session...');

      const checkoutResponse = await ArcPayService.createHostedCheckout({
        amount: finalAmount,
        currency: 'USD',
        orderId: orderId,
        bookingType: 'flight',
        customerEmail: paymentData?.passengerData?.[0]?.email || 'customer@jetsetgo.com',
        customerName: paymentData?.passengerData?.[0]
          ? `${paymentData.passengerData[0].firstName} ${paymentData.passengerData[0].lastName}`
          : 'Guest User',
        customerPhone: paymentData?.passengerData?.[0]?.phone,
        description: `Flight Booking - ${paymentData?.bookingDetails?.flight?.flightNumber || orderId}`,
        returnUrl: `${window.location.origin}/payment/callback?orderId=${orderId}&bookingType=flight`,
        cancelUrl: `${window.location.origin}/flight-payment?cancelled=true`,
        bookingData: {
          passengerData: paymentData?.passengerData,
          selectedFlight: paymentData?.bookingDetails?.flight,
          origin: paymentData?.bookingDetails?.flight?.origin,
          destination: paymentData?.bookingDetails?.flight?.destination
        },
        flightData: paymentData?.bookingDetails?.flight
      });

      if (!checkoutResponse.success || !checkoutResponse.checkoutUrl) {
        throw new Error(checkoutResponse.error?.error || 'Failed to create checkout session');
      }

      console.log('✅ Hosted checkout session created:', checkoutResponse.sessionId);
      console.log('🔗 Redirecting to ARC Pay payment page:', checkoutResponse.checkoutUrl);

      // Store session info for verification after payment
      localStorage.setItem('pendingPaymentSession', JSON.stringify({
        sessionId: checkoutResponse.sessionId,
        orderId: orderId,
        bookingType: 'flight',
        amount: finalAmount
      }));

      // Redirect to ARC Pay hosted payment page
      window.location.href = checkoutResponse.checkoutUrl;

    } catch (error) {
      console.error("❌ Payment processing error:", error);
      setPaymentSuccess(false);
      setShowPaymentResult(true);

      // Show user-friendly error message
      let errorMessage = 'Payment processing failed. Please try again.';

      if (error.message.includes('gateway')) {
        errorMessage = 'Payment gateway is temporarily unavailable. Please try again in a few minutes.';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        errorMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else if (error.message.includes('card') || error.message.includes('Card')) {
        errorMessage = error.message;
      }

      alert(`Payment failed: ${errorMessage}`);
    } finally {
      setProcessingPayment(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { weekday: 'short', day: '2-digit', month: 'short' };
    return date.toLocaleDateString('en-US', options);
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  // Show loading screen while redirecting to ARC Pay
  if (loading || processingPayment) {
    return (
      <div className="bg-gradient-to-b from-blue-50 via-white to-gray-100 min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md mx-4">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Redirecting to Secure Payment</h2>
          <p className="text-gray-600 mb-4">Please wait while we connect you to our secure payment gateway...</p>
          <div className="flex items-center justify-center gap-2 text-green-600">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium">256-bit SSL Encrypted</span>
          </div>
        </div>
      </div>
    );
  }

  // Show error screen if payment creation failed
  if (error) {
    return (
      <div className="bg-gradient-to-b from-blue-50 via-white to-gray-100 min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md mx-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setError(null);
                setProcessingPayment(false);
                sessionStorage.removeItem('arcPayRedirecting');
                window.location.reload();
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/flights')}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Back to Flights
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-blue-50 via-white to-gray-100 min-h-screen">
      <Navbar forceScrolled={true} />

      {/* Content Container - Starting after navbar */}
      <div className="pt-20 animate-fadeIn">
        {/* Checkout Title */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-2">
          <div className="flex items-center">
            <div className="bg-blue-100 p-2 rounded-full mr-3">
              <Lock className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Secure Checkout</h1>
              <p className="text-gray-600">Complete your booking in just a few steps</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 overflow-x-auto">
          <div className={`transition-opacity duration-500 ${pageLoaded ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-between max-w-3xl mx-auto min-w-[500px]">
              {[
                { icon: <Check />, label: "Flight Selection", completed: true },
                { icon: <Check />, label: "Passenger Details", completed: true },
                { icon: <CreditCard />, label: "Payment", completed: false, active: true },
                { icon: <CheckCircle />, label: "Confirmation", completed: false }
              ].map((step, index) => (
                <React.Fragment key={step.label}>
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 
                      ${step.completed ? 'bg-green-100 text-green-600 border-green-500' :
                        step.active ? 'bg-blue-600 text-white border-blue-600 animate-pulse shadow-md shadow-blue-300' :
                          'bg-gray-100 text-gray-400 border-gray-300'}`}>
                      {step.icon}
                    </div>
                    <span className={`text-xs mt-2 font-medium ${step.active ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-600'}`}>
                      {step.label}
                    </span>
                  </div>
                  {index < 3 && (
                    <div className={`flex-1 h-1 mx-2 rounded-full transition-all duration-500
                      ${step.completed ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-16">
          {/* Back Button and Timer */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-0 mb-6 sm:mb-8">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center text-gray-700 hover:text-blue-700 transition-colors font-medium p-2 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              <span>Back</span>
            </button>

            <div className={`sm:ml-auto flex items-center px-4 py-2 rounded-full shadow-sm text-sm font-semibold 
              ${timerExpired ? 'bg-red-100 text-red-700 animate-bounce' :
                timeLeft < 60 ? 'bg-yellow-100 text-yellow-700 animate-pulse' :
                  'bg-blue-100 text-blue-700'}`}>
              <Clock className="h-4 w-4 mr-1.5" />
              <span>
                {timerExpired ? 'Session Expired' : `Reservation holds for: ${formatTime(timeLeft)}`}
              </span>
            </div>
          </div>

          <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 transition-all duration-500 
            ${pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

            {/* Order Summary - Show as first on mobile, but move to side on desktop */}
            <div className="lg:col-span-1 lg:order-1 order-2 space-y-4 sm:space-y-6 lg:sticky lg:top-24 lg:self-start">
              {/* Order Summary Card */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 hover:shadow-xl transition-shadow duration-300">
                <div
                  className="p-4 sm:p-5 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={toggleFareDetails}
                >
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center">
                    <Ticket className="w-5 h-5 mr-2 text-blue-600" />
                    Order Summary
                  </h2>
                  {showFareDetails ?
                    <ChevronUp className="w-5 h-5 text-gray-500" /> :
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  }
                </div>

                {showFareDetails && (
                  <div className="p-4 sm:p-5 animate-fadeIn space-y-4">
                    {/* Flight Details */}
                    <div className="border-b border-gray-200 pb-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-medium text-gray-700">Your Flight</h3>
                        <span className="text-xs text-gray-500 bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          One Way
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {formatDate(paymentData?.bookingDetails?.flight?.departureDate)}
                      </p>
                      <div className="flex items-center text-sm space-x-2 text-gray-800 font-medium">
                        <span>{paymentData?.bookingDetails?.flight?.departureCity?.substring(0, 3).toUpperCase()}</span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span>{paymentData?.bookingDetails?.flight?.arrivalCity?.substring(0, 3).toUpperCase()}</span>
                        <span className="text-gray-500 font-normal">
                          ({paymentData?.bookingDetails?.flight?.duration})
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {paymentData?.bookingDetails?.flight?.airline}
                      </p>
                    </div>

                    {/* Fare Breakdown */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Base Fare ({paymentData?.passengerData?.length || 0} Traveller{paymentData?.passengerData?.length > 1 ? 's' : ''})
                        </span>
                        <span className="font-medium">
                          ${paymentData?.calculatedFare?.baseFare?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Taxes & Fees</span>
                        <span className="font-medium">
                          ${paymentData?.calculatedFare?.totalTax?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      {paymentData?.calculatedFare?.addonsTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Add-ons</span>
                          <span className="font-medium">
                            ${paymentData?.calculatedFare?.addonsTotal?.toFixed(2) || '0.00'}
                          </span>
                        </div>
                      )}
                      {paymentData?.calculatedFare?.vipServiceFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">VIP Service</span>
                          <span className="font-medium">
                            ${paymentData?.calculatedFare?.vipServiceFee?.toFixed(2) || '0.00'}
                          </span>
                        </div>
                      )}
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount Applied</span>
                          <span className="font-medium">- ${discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Total Amount */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-900">Total Payable</span>
                        <span className="text-xl font-bold text-blue-600">${finalAmount.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-right">(Inclusive of all taxes)</p>
                    </div>

                    {/* Savings Message */}
                    {paymentData?.calculatedFare?.baseFare > finalAmount && (
                      <div className="bg-green-50 p-3 rounded-lg mt-4 flex items-center border border-green-100">
                        <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                        <span className="text-green-700 text-sm font-medium">
                          You saved ${(paymentData.calculatedFare.baseFare + paymentData.calculatedFare.totalTax - finalAmount).toFixed(2)} on this booking!
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Promo Code Card */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-5">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Apply Promo Code</h2>
                <form onSubmit={(e) => { e.preventDefault(); applyPromoCode(); }} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={handlePromoCodeChange}
                      placeholder="Enter Promo Code"
                      className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 
                        ${formErrors.promoCode ? 'border-red-500 ring-red-200' :
                          promoApplied ? 'border-green-500 ring-green-200' :
                            'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                      disabled={promoApplied}
                    />
                    {formErrors.promoCode && (
                      <p className="text-red-500 text-sm mt-1">{formErrors.promoCode}</p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className={`w-full py-3 rounded-lg font-semibold transition-colors
                      ${promoApplied ? 'bg-green-600 text-white cursor-not-allowed' :
                        'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                    disabled={promoApplied || !promoCode}
                  >
                    {promoApplied ? 'Applied' : 'Apply'}
                  </button>
                </form>
                {promoApplied && (
                  <p className="text-green-600 text-sm mt-2 font-medium">
                    Promo code applied! You saved ${discountAmount.toFixed(2)}.
                  </p>
                )}
              </div>

              {/* Security Badges - Hide on mobile, show on desktop */}
              <div className="hidden sm:block bg-white rounded-xl shadow-md p-5 border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
                  <BadgeCheck className="w-4 h-4 text-green-600 mr-2" />
                  Safe & Secure Booking
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <ShieldCheck className="w-4 h-4 text-green-600 mr-2" />
                    <span className="text-xs text-gray-600">256-bit SSL Encryption</span>
                  </div>
                  <div className="flex items-center">
                    <ShieldCheck className="w-4 h-4 text-green-600 mr-2" />
                    <span className="text-xs text-gray-600">PCI DSS Compliant</span>
                  </div>
                  <div className="flex items-center">
                    <ShieldCheck className="w-4 h-4 text-green-600 mr-2" />
                    <span className="text-xs text-gray-600">Verified Payment Gateways</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <div className="flex space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-yellow-500" />
                      ))}
                    </div>
                    <span className="text-xs text-gray-600">9.5/10 based on 24k+ reviews</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Payment Methods */}
            <div className="lg:col-span-2 lg:order-2 order-1 space-y-4 sm:space-y-6">
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-5 flex items-center">
                  <CreditCard className="w-5 h-5 text-blue-600 mr-2" />
                  Choose Payment Method
                </h2>

                {/* Payment Methods */}
                <div className="space-y-4">
                  {/* Credit Card Option */}
                  <div className={`border rounded-lg overflow-hidden transition-all duration-300 group
                    ${activePaymentMethod === "creditCard" ? 'border-blue-600 shadow-lg scale-[1.01]' :
                      'border-gray-200 hover:shadow-md hover:border-gray-300'}`}>
                    <div
                      className={`p-3 sm:p-4 flex justify-between items-center cursor-pointer transition-colors
                        ${activePaymentMethod === "creditCard" ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
                      onClick={() => setActivePaymentMethod("creditCard")}
                    >
                      <div className="flex items-center">
                        <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mr-3 sm:mr-4 transition-transform group-hover:scale-110 ${activePaymentMethod === "creditCard" ? 'scale-110' : ''}`}>
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800 text-sm sm:text-base">Credit/Debit Card</h3>
                          <p className="text-xs sm:text-sm text-gray-600">Visa, Mastercard, Amex, Rupay & More</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300
                        ${activePaymentMethod === "creditCard" ? 'border-blue-600 bg-blue-600 scale-110' : 'border-gray-400'}`}>
                        {activePaymentMethod === "creditCard" && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                    </div>

                    {activePaymentMethod === "creditCard" && (
                      <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-200 animate-fadeIn">
                        {/* Credit Card Form */}
                        <form onSubmit={(e) => { e.preventDefault(); handlePaymentSubmit(); }} className="space-y-4">
                          <div>
                            <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 mb-1">
                              Card Number
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                id="cardNumber"
                                name="cardNumber"
                                value={cardDetails.cardNumber}
                                onChange={handleCardDetailsChange}
                                placeholder="0000 0000 0000 0000"
                                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2
                                  ${formErrors.cardNumber ? 'border-red-500 ring-red-200' :
                                    'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                              />
                              <div className="absolute inset-y-0 right-3 flex items-center">
                                <div className="flex space-x-1">
                                  <img src="https://cdn-icons-png.flaticon.com/512/349/349221.png" alt="Visa" className="h-6" />
                                  <img src="https://cdn-icons-png.flaticon.com/512/349/349228.png" alt="MasterCard" className="h-6" />
                                </div>
                              </div>
                            </div>
                            {formErrors.cardNumber && (
                              <p className="text-red-500 text-sm mt-1">{formErrors.cardNumber}</p>
                            )}
                          </div>

                          <div>
                            <label htmlFor="cardHolder" className="block text-sm font-medium text-gray-700 mb-1">
                              Cardholder Name
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                id="cardHolder"
                                name="cardHolder"
                                value={cardDetails.cardHolder}
                                onChange={handleCardDetailsChange}
                                placeholder="John Doe"
                                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2
                                  ${formErrors.cardHolder ? 'border-red-500 ring-red-200' :
                                    'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                              />
                            </div>
                            {formErrors.cardHolder && (
                              <p className="text-red-500 text-sm mt-1">{formErrors.cardHolder}</p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="expiryDate" className="block text-sm font-medium text-gray-700 mb-1">
                                Expiry Date
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  id="expiryDate"
                                  name="expiryDate"
                                  value={cardDetails.expiryDate}
                                  onChange={handleCardDetailsChange}
                                  placeholder="MM/YY"
                                  className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2
                                    ${formErrors.expiryDate ? 'border-red-500 ring-red-200' :
                                      'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                                />
                              </div>
                              {formErrors.expiryDate && (
                                <p className="text-red-500 text-sm mt-1">{formErrors.expiryDate}</p>
                              )}
                            </div>

                            <div>
                              <label htmlFor="cvv" className="block text-sm font-medium text-gray-700 mb-1">
                                CVV
                              </label>
                              <div className="relative">
                                <input
                                  type={isCardFlipped ? "text" : "password"}
                                  id="cvv"
                                  name="cvv"
                                  value={cardDetails.cvv}
                                  onChange={handleCardDetailsChange}
                                  placeholder="•••"
                                  onFocus={() => setIsCardFlipped(true)}
                                  onBlur={() => setIsCardFlipped(false)}
                                  className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2
                                    ${formErrors.cvv ? 'border-red-500 ring-red-200' :
                                      'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                                />
                                <div className="absolute inset-y-0 right-3 flex items-center">
                                  <button
                                    type="button"
                                    className="text-gray-400 hover:text-gray-600"
                                    onClick={() => setIsCardFlipped(!isCardFlipped)}
                                  >
                                    {isCardFlipped ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                      </svg>
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                              {formErrors.cvv && (
                                <p className="text-red-500 text-sm mt-1">{formErrors.cvv}</p>
                              )}
                            </div>
                          </div>

                          {/* Credit Card Visual - Hide on small screens */}
                          <div className={`hidden sm:block mt-4 relative perspective-1000 h-44 transition-all duration-500 ${isCardFlipped ? 'rotate-y-180' : ''}`}>
                            <div className={`absolute inset-0 backface-hidden rounded-xl shadow-md overflow-hidden bg-gradient-to-r from-blue-500 to-indigo-600 p-5 transition-all duration-500 ${isCardFlipped ? 'opacity-0 rotate-y-180' : 'opacity-100'}`}>
                              <div className="flex justify-between items-start">
                                <div className="w-12 h-8 rounded bg-gradient-to-br from-yellow-200 to-yellow-400"></div>
                                <div className="text-white text-lg font-bold italic">CREDIT CARD</div>
                              </div>
                              <div className="mt-6 text-white text-lg tracking-widest font-mono">
                                {cardDetails.cardNumber || "0000 0000 0000 0000"}
                              </div>
                              <div className="mt-6 flex justify-between">
                                <div>
                                  <div className="text-white opacity-70 text-xs">CARD HOLDER</div>
                                  <div className="text-white font-medium">{cardDetails.cardHolder || "YOUR NAME"}</div>
                                </div>
                                <div>
                                  <div className="text-white opacity-70 text-xs">EXPIRES</div>
                                  <div className="text-white font-medium">{cardDetails.expiryDate || "MM/YY"}</div>
                                </div>
                              </div>
                            </div>
                            <div className={`absolute inset-0 backface-hidden rounded-xl shadow-md overflow-hidden bg-gradient-to-r from-gray-700 to-gray-900 p-5 rotate-y-180 transition-all duration-500 ${isCardFlipped ? 'opacity-100 rotate-y-0' : 'opacity-0'}`}>
                              <div className="h-10 bg-black mt-5"></div>
                              <div className="mt-6 flex">
                                <div className="h-8 bg-white rounded w-3/4 flex items-center justify-end px-3">
                                  <div className="text-gray-700 font-mono">{cardDetails.cvv || "***"}</div>
                                </div>
                              </div>
                              <div className="mt-6 text-white text-xs opacity-70">
                                <p>The CVV number is the 3 or 4 digit number on the back of your card.</p>
                                <p>It provides an additional security layer for online transactions.</p>
                              </div>
                            </div>
                          </div>

                          {/* UPI Apps - Mobile-friendly grid */}
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Or pay using UPI app:</p>
                            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                              {[
                                { name: 'Google Pay', icon: 'https://cdn-icons-png.flaticon.com/512/6124/6124998.png' },
                                { name: 'PhonePe', icon: 'https://cdn-icons-png.flaticon.com/512/6124/6124997.png' },
                                { name: 'Paytm', icon: 'https://cdn-icons-png.flaticon.com/512/825/825454.png' }
                              ].map(app => (
                                <button
                                  key={app.name}
                                  type="button"
                                  className="flex flex-col sm:flex-row items-center justify-center sm:justify-start p-2 border rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                                >
                                  <img src={app.icon} alt={app.name} className="w-6 h-6 mb-1 sm:mb-0 sm:mr-2" />
                                  <span className="text-xs font-medium">{app.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            type="submit"
                            className={`w-full py-3 sm:py-4 rounded-lg font-semibold text-base sm:text-lg transition-all duration-300
                              flex items-center justify-center shadow-md hover:shadow-lg
                              ${timerExpired ? 'bg-gray-400 cursor-not-allowed' :
                                'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.01]'} 
                              disabled:opacity-70`}
                            disabled={processingPayment || timerExpired}
                          >
                            {processingPayment ? (
                              <div className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing...
                              </div>
                            ) : timerExpired ? (
                              'Session Expired'
                            ) : (
                              <div className="flex items-center">
                                <Lock className="w-5 h-5 mr-2" />
                                Pay ₹{finalAmount.toFixed(2)}
                              </div>
                            )}
                          </button>

                          <div className="flex justify-center items-center text-xs text-gray-500">
                            <Lock className="w-3 h-3 mr-1" />
                            <span>Secure payment powered by 256-bit encryption</span>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* UPI Option */}
                  <div className={`border rounded-lg overflow-hidden transition-all duration-300
                    ${activePaymentMethod === "upi" ? 'border-blue-600 shadow-lg scale-[1.02]' :
                      'border-gray-200 hover:shadow-md hover:border-gray-300'}`}>
                    <div
                      className={`p-4 flex justify-between items-center cursor-pointer transition-colors
                        ${activePaymentMethod === "upi" ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
                      onClick={() => setActivePaymentMethod("upi")}
                    >
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-4">
                          <img
                            src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/1280px-UPI-Logo-vector.svg.png"
                            alt="UPI"
                            className="h-6"
                          />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800">UPI</h3>
                          <p className="text-sm text-gray-600">Google Pay, PhonePe, Paytm & More</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                        ${activePaymentMethod === "upi" ? 'border-blue-600 bg-blue-600 scale-110' : 'border-gray-400'}`}>
                        {activePaymentMethod === "upi" && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                    </div>

                    {activePaymentMethod === "upi" && (
                      <div className="p-5 bg-gray-50 border-t border-gray-200 animate-fadeIn">
                        <form onSubmit={(e) => { e.preventDefault(); handlePaymentSubmit(); }} className="space-y-4">
                          <div>
                            <label htmlFor="upiId" className="block text-sm font-medium text-gray-700 mb-1">
                              Enter UPI ID
                            </label>
                            <input
                              type="text"
                              id="upiId"
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value)}
                              placeholder="yourname@bank"
                              className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2
                                ${formErrors.upiId ? 'border-red-500 ring-red-200' :
                                  'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                            />
                            {formErrors.upiId && (
                              <p className="text-red-500 text-sm mt-1">{formErrors.upiId}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">We'll send a payment request to this ID.</p>
                          </div>

                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Or pay using UPI app:</p>
                            <div className="flex flex-wrap gap-3">
                              {[
                                { name: 'Google Pay', icon: 'https://cdn-icons-png.flaticon.com/512/6124/6124998.png' },
                                { name: 'PhonePe', icon: 'https://cdn-icons-png.flaticon.com/512/6124/6124997.png' },
                                { name: 'Paytm', icon: 'https://cdn-icons-png.flaticon.com/512/825/825454.png' }
                              ].map(app => (
                                <button
                                  key={app.name}
                                  type="button"
                                  className="flex items-center space-x-2 p-2 border rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                                >
                                  <img src={app.icon} alt={app.name} className="w-6 h-6" />
                                  <span className="text-xs font-medium">{app.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            type="submit"
                            className={`w-full py-3 rounded-lg font-semibold text-lg transition-all duration-300
                              flex items-center justify-center shadow-md hover:shadow-lg
                              ${timerExpired ? 'bg-gray-400 cursor-not-allowed' :
                                'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.01]'} 
                              disabled:opacity-70`}
                            disabled={processingPayment || timerExpired}
                          >
                            {processingPayment ? (
                              <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                                Processing Payment...
                              </>
                            ) : timerExpired ? (
                              'Session Expired'
                            ) : (
                              <>
                                <Lock className="w-5 h-5 mr-2" />
                                Pay Securely ₹{finalAmount.toFixed(2)}
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Trust Badges - Mobile only, at the bottom */}
          <div className="block sm:hidden mt-6 bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <BadgeCheck className="w-4 h-4 text-green-600 mr-2" />
              Safe & Secure Booking
            </h3>
            <div className="flex justify-between">
              <div className="flex items-center">
                <ShieldCheck className="w-4 h-4 text-green-600 mr-1" />
                <span className="text-xs text-gray-600">SSL Encryption</span>
              </div>
              <div className="flex items-center">
                <ShieldCheck className="w-4 h-4 text-green-600 mr-1" />
                <span className="text-xs text-gray-600">PCI Compliant</span>
              </div>
              <div className="flex items-center">
                <ShieldCheck className="w-4 h-4 text-green-600 mr-1" />
                <span className="text-xs text-gray-600">Verified</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Result Modal */}
      {showPaymentResult && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md transform scale-100 transition-transform duration-300 animate-fadeIn">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className={`text-xl font-bold ${paymentSuccess ? 'text-green-600' : 'text-red-600'}`}>
                {paymentSuccess ? "Payment Successful" : "Payment Failed"}
              </h3>
              <button
                type="button"
                onClick={() => setShowPaymentResult(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center py-4">
              {paymentSuccess ? (
                <>
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-green-200 animate-pulse">
                    <CheckCircle className="w-12 h-12 text-green-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">
                    Payment of ₹{finalAmount.toFixed(2)} Successful!
                  </h4>
                  <p className="text-gray-600 mb-4 text-sm">
                    Your booking is confirmed. Redirecting you shortly...
                  </p>
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-200 animate-pulse">
                    <X className="w-12 h-12 text-red-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">Payment Failed</h4>
                  <p className="text-gray-600 mb-4 text-sm">
                    We couldn't process your payment. Please check your details or try another method.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPaymentResult(false)}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
                  >
                    Try Again
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* Global Styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        
        .animate-bounce {
          animation: bounce 1s infinite;
        }
        
        .perspective-1000 {
          perspective: 1000px;
        }
        
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
        
        .rotate-y-0 {
          transform: rotateY(0deg);
        }
      `}</style>
    </div>
  );
}

export default withPageElements(FlightPayment); 