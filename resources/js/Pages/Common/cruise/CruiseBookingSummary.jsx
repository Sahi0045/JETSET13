import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaShip, FaUser, FaCreditCard, FaLock } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import cruiseLineData from './data/cruiselines.json';
import Price from '../../../Components/Price';
import currencyService from '../../../Services/CurrencyService';

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
  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryDate: '',
    cvv: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);

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

  const handlePaymentChange = (field, value) => {
    // Format card number with spaces
    if (field === 'cardNumber') {
      value = value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
    }
    // Format expiry date
    if (field === 'expiryDate') {
      value = value.replace(/\D/g, '')
        .replace(/^([0-9]{2})/g, '$1/')
        .substr(0, 5);
    }
    // Limit CVV to 3-4 digits
    if (field === 'cvv') {
      value = value.replace(/\D/g, '').substr(0, 4);
    }
    setPaymentDetails(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    // Validate required fields - only check fields that exist in the form
    const requiredFields = {
      adults: ['firstName', 'lastName'], // Removed age and nationality since form doesn't have these fields
      payment: ['cardNumber', 'cardHolder', 'expiryDate', 'cvv']
    };

    // Check adult passenger details
    for (const adult of passengerDetails.adults) {
      for (const field of requiredFields.adults) {
        if (!adult[field] || adult[field].trim() === '') {
          throw new Error(`Please fill in all adult passenger details`);
        }
      }
    }

    // Check child passenger details (if any are partially filled)
    for (const child of passengerDetails.children) {
      if (child.firstName || child.lastName) {
        for (const field of requiredFields.adults) {
          if (!child[field] || child[field].trim() === '') {
            throw new Error(`Please complete all child passenger details`);
          }
        }
      }
    }

    // Check payment details
    for (const field of requiredFields.payment) {
      if (!paymentDetails[field] || paymentDetails[field].trim() === '') {
        throw new Error(`Please enter ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      }
    }

    // Validate card number (Luhn algorithm)
    const cardNumber = paymentDetails.cardNumber.replace(/\s/g, '');
    if (!/^[0-9]{16}$/.test(cardNumber)) {
      throw new Error('Invalid card number');
    }

    // Validate expiry date
    const [month, year] = paymentDetails.expiryDate.split('/');
    const expiry = new Date(2000 + parseInt(year), parseInt(month) - 1);
    const today = new Date();
    if (expiry < today) {
      throw new Error('Card has expired');
    }

    // Validate CVV
    if (!/^[0-9]{3,4}$/.test(paymentDetails.cvv)) {
      throw new Error('Invalid CVV');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError('');

    try {
      // Validate form
      validateForm();

      // Calculate total amount including taxes and fees
      const basePrice = parseFloat(cruiseData.price.replace(/[^0-9.]/g, ''));
      const taxesAndFees = 150;
      const portCharges = 200;
      const totalAmount = basePrice + taxesAndFees + portCharges;

      // Get the current currency code for payment metadata
      const userCurrency = currencyService.getCurrency();
      const convertedTotalAmount = currencyService.convertPrice(totalAmount, userCurrency);

      // First create an order, then process payment
      const orderId = `CRUISE-${Date.now()}`;

      // Step 1: Create order
      const orderData = {
        amount: convertedTotalAmount,
        currency: userCurrency,
        booking_type: 'cruise',
        booking_details: {
          cruise_id: cruiseData.id,
          cruise_name: cruiseData.name,
          passengers: passengerDetails,
          customer_name: paymentDetails.cardHolder,
          customer_email: 'customer@example.com'
        },
        orderId: orderId
      };

      const orderResponse = await fetch('/api/payments/order/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      });

      const orderResult = await orderResponse.json();

      if (!orderResult.success) {
        throw new Error(orderResult.error || 'Failed to create order');
      }

      // Step 2: Process payment
      const paymentData = {
        orderId: orderId,
        amount: convertedTotalAmount,
        currency: userCurrency,
        cardDetails: {
          cardNumber: paymentDetails.cardNumber,
          expiryDate: paymentDetails.expiryDate,
          cvv: paymentDetails.cvv
        },
        billingAddress: {
          firstName: paymentDetails.cardHolder.split(' ')[0],
          lastName: paymentDetails.cardHolder.split(' ').slice(1).join(' ') || paymentDetails.cardHolder.split(' ')[0]
        }
      };

      // Process payment through our ARC Pay backend
      const response = await fetch('/api/payments/payment/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      });

      const result = await response.json();

      if (result.success) {
        setIsPaymentSuccess(true);
        // Store booking details
        localStorage.setItem('completedBooking', JSON.stringify({
          cruiseData,
          passengers: passengerDetails,
          totalAmount,
          orderId: orderId,
          transactionId: result.transactionId
        }));
        // Redirect to booking confirmation page
        setTimeout(() => {
          window.location.href = '/booking-confirmation';
        }, 2000);
      } else {
        throw new Error(result.error || 'Payment processing failed');
      }


    } catch (error) {
      setError(error.message);
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

              {/* Payment Details */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FaCreditCard className="mr-2 text-blue-500" />
                  Payment Details
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-700 mb-2">Card Number</label>
                    <input
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      value={paymentDetails.cardNumber}
                      onChange={(e) => handlePaymentChange('cardNumber', e.target.value)}
                      className="w-full border rounded-md p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-2">Card Holder Name</label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={paymentDetails.cardHolder}
                      onChange={(e) => handlePaymentChange('cardHolder', e.target.value)}
                      className="w-full border rounded-md p-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-700 mb-2">Expiry Date</label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={paymentDetails.expiryDate}
                        onChange={(e) => handlePaymentChange('expiryDate', e.target.value)}
                        className="w-full border rounded-md p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 mb-2">CVV</label>
                      <input
                        type="text"
                        placeholder="123"
                        value={paymentDetails.cvv}
                        onChange={(e) => handlePaymentChange('cvv', e.target.value)}
                        className="w-full border rounded-md p-2"
                      />
                    </div>
                  </div>
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
                  className="w-full mt-6 bg-blue-500 text-white py-3 rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <FaLock className="mr-2" />
                      Confirm & Pay
                    </>
                  )}
                </button>

                {error && (
                  <p className="mt-4 text-red-500 text-center">{error}</p>
                )}

                {isPaymentSuccess && (
                  <div className="mt-4 p-4 bg-green-50 text-green-700 rounded-md text-center">
                    Payment successful! Redirecting to your trips...
                  </div>
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