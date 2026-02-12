import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaShip, FaUser, FaLock } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import cruiseLineData from './data/cruiselines.json';
import Price from '../../../Components/Price';
import currencyService from '../../../Services/CurrencyService';
import ArcPayService from '../../../Services/ArcPayService';

function CruiseBookingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const cruiseId = queryParams.get('cruiseId');
  const cruiseLine = queryParams.get('cruiseLine');

  const [cruiseData, setCruiseData] = useState(null);
  const [passengerDetails, setPassengerDetails] = useState({
    adults: [{ firstName: '', lastName: '', age: '', nationality: '' }],
    children: [{ firstName: '', lastName: '', age: '', nationality: '' }]
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Find the selected cruise from cruiseLineData
    const findCruise = () => {
      const allCruises = cruiseLineData.cruiseLines;
      let selectedCruise;

      if (cruiseId) {
        selectedCruise = allCruises.find(cruise => cruise.id === parseInt(cruiseId));
      } else if (cruiseLine) {
        selectedCruise = allCruises.find(cruise =>
          cruise.name.toLowerCase() === cruiseLine.toLowerCase()
        );
      }

      if (selectedCruise) {
        setCruiseData({
          id: selectedCruise.id,
          name: selectedCruise.name,
          image: selectedCruise.image,
          price: selectedCruise.price,
          duration: selectedCruise.duration,
          departure: selectedCruise.departurePorts[0],
          arrival: selectedCruise.destinations[0],
          departureDate: selectedCruise.departureDate,
          returnDate: selectedCruise.returnDate,
          description: selectedCruise.description
        });
      }
    };

    findCruise();
  }, [cruiseId, cruiseLine]);

  const handlePassengerChange = (type, index, field, value) => {
    setPassengerDetails(prev => ({
      ...prev,
      [type]: prev[type].map((passenger, i) =>
        i === index ? { ...passenger, [field]: value } : passenger
      )
    }));
  };

  const validateForm = () => {
    // Check adult passenger details
    for (const adult of passengerDetails.adults) {
      if (!adult.firstName || adult.firstName.trim() === '' || !adult.lastName || adult.lastName.trim() === '') {
        throw new Error('Please fill in all adult passenger details');
      }
    }

    // Check child passenger details (if any are partially filled)
    for (const child of passengerDetails.children) {
      if (child.firstName || child.lastName) {
        if (!child.firstName || child.firstName.trim() === '' || !child.lastName || child.lastName.trim() === '') {
          throw new Error('Please complete all child passenger details');
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError('');

    try {
      // Validate form
      validateForm();

      console.log('🔍 Checking ArcPay Gateway status...');
      const gatewayStatus = await ArcPayService.checkGatewayStatus();

      if (!gatewayStatus.success || !gatewayStatus.gatewayOperational) {
        console.warn('Gateway status check failed:', gatewayStatus);
        throw new Error('Payment gateway is currently unavailable. Please try again later.');
      }

      // Calculate total amount including taxes and fees
      const basePrice = parseFloat(cruiseData.price.replace(/[^0-9.]/g, ''));
      const taxesAndFees = 150;
      const portCharges = 200;
      const totalAmount = basePrice + taxesAndFees + portCharges;

      // Store booking data in localStorage before redirect
      const bookingData = {
        cruiseId: cruiseData.id,
        cruiseName: cruiseData.name,
        cruiseImage: cruiseData.image,
        duration: cruiseData.duration,
        departure: cruiseData.departure,
        arrival: cruiseData.arrival,
        departureDate: cruiseData.departureDate,
        returnDate: cruiseData.returnDate,
        basePrice,
        taxesAndFees,
        portCharges,
        totalAmount,
        passengerDetails
      };
      localStorage.setItem('pendingCruiseBooking', JSON.stringify(bookingData));

      // Create hosted checkout session
      // ARC Pay requires order IDs: alphanumeric, 11-40 characters
      const orderId = `CRZ${Date.now().toString(36).toUpperCase()}`;
      console.log('🚀 Creating ArcPay hosted checkout session...');

      const checkoutResponse = await ArcPayService.createHostedCheckout({
        amount: totalAmount,
        currency: 'USD',
        orderId: orderId,
        bookingType: 'cruise',
        customerEmail: 'customer@jetsetgo.com',
        customerName: `${passengerDetails.adults[0]?.firstName || ''} ${passengerDetails.adults[0]?.lastName || ''}`.trim() || 'Guest',
        customerPhone: '',
        description: `Cruise Booking - ${cruiseData.name} (${cruiseData.duration})`,
        returnUrl: `${window.location.origin}/payment/callback?orderId=${orderId}&bookingType=cruise`,
        cancelUrl: `${window.location.origin}/cruise/booking-summary${location.search}`,
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
        bookingType: 'cruise',
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

  if (!cruiseData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading booking details...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Booking Summary</h1>
            <p className="text-gray-600 mt-2">Complete your booking for {cruiseData.name}</p>
          </div>

          {/* Cruise Image */}
          <div className="mb-8 rounded-lg overflow-hidden shadow-lg">
            <img
              src={cruiseData.image || "/images/Rectangle 1434 (1).png"}
              alt={cruiseData.name}
              className="w-full h-[400px] object-cover"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Booking Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Cruise Details */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaShip className="mr-2 text-blue-500" />
                  Cruise Details
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-600">Departure</p>
                    <p className="font-medium">{cruiseData.departure}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Arrival</p>
                    <p className="font-medium">{cruiseData.arrival}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Duration</p>
                    <p className="font-medium">{cruiseData.duration}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Travel Dates</p>
                    <p className="font-medium">{cruiseData.departureDate} - {cruiseData.returnDate}</p>
                  </div>
                </div>
              </div>

              {/* Passenger Details */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaUser className="mr-2 text-blue-500" />
                  Passenger Details
                </h2>
                {/* Adult Passengers */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-3">Adult Passengers</h3>
                  {passengerDetails.adults.map((adult, index) => (
                    <div key={index} className="grid grid-cols-2 gap-4 mb-4">
                      <input
                        type="text"
                        placeholder="First Name"
                        value={adult.firstName}
                        onChange={(e) => handlePassengerChange('adults', index, 'firstName', e.target.value)}
                        className="border rounded-md p-2"
                      />
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={adult.lastName}
                        onChange={(e) => handlePassengerChange('adults', index, 'lastName', e.target.value)}
                        className="border rounded-md p-2"
                      />
                    </div>
                  ))}
                </div>

                {/* Child Passengers */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Child Passengers</h3>
                  {passengerDetails.children.map((child, index) => (
                    <div key={index} className="grid grid-cols-2 gap-4 mb-4">
                      <input
                        type="text"
                        placeholder="First Name"
                        value={child.firstName}
                        onChange={(e) => handlePassengerChange('children', index, 'firstName', e.target.value)}
                        className="border rounded-md p-2"
                      />
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={child.lastName}
                        onChange={(e) => handlePassengerChange('children', index, 'lastName', e.target.value)}
                        className="border rounded-md p-2"
                      />
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Price Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6 sticky top-6">
                <h2 className="text-xl font-semibold mb-4">Price Summary</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Cruise Fare</span>
                    <span><Price amount={cruiseData.price} /></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxes & Fees</span>
                    <span><Price amount={150} /></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Port Charges</span>
                    <span><Price amount={200} /></span>
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total</span>
                      <span>
                        <Price
                          amount={parseFloat(cruiseData.price.replace(/[^0-9.]/g, '')) + 150 + 200}
                          showCode={true}
                        />
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={isProcessing}
                  className="w-full mt-6 bg-[#055B75] text-white py-3.5 rounded-lg hover:bg-[#034457] transition-all flex items-center justify-center font-semibold shadow-lg active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Redirecting to ARC Pay...
                    </>
                  ) : (
                    <>
                      <FaLock className="mr-2" />
                      Confirm & Pay with ARC Pay
                    </>
                  )}
                </button>

                <p className="text-xs text-gray-400 text-center mt-3">
                  You will be securely redirected to ARC Pay to complete your payment.
                </p>

                {error && (
                  <p className="mt-4 text-red-500 text-center text-sm">{error}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default withPageElements(CruiseBookingSummary);