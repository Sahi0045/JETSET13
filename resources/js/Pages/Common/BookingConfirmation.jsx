import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Ship, Plane, Calendar, User, CreditCard, ArrowLeft } from 'lucide-react';
import Navbar from './Navbar';

function BookingConfirmation() {
  const navigate = useNavigate();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get booking data from localStorage - prioritize flight bookings
    const flightBooking = localStorage.getItem('completedFlightBooking');
    const cruiseBooking = localStorage.getItem('completedBooking');
    
    // Debug: Check what's in localStorage
    console.log('🔍 BookingConfirmation - localStorage check:');
    console.log('flightBooking:', flightBooking);
    console.log('cruiseBooking:', cruiseBooking);
    console.log('All localStorage items:');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      console.log(`  ${key}:`, localStorage.getItem(key));
    }
    
    if (flightBooking) {
      const flightData = JSON.parse(flightBooking);
      console.log('📝 Parsed flight data:', flightData);
      setBookingData({ ...flightData, type: 'flight' });
    } else if (cruiseBooking) {
      const cruiseData = JSON.parse(cruiseBooking);
      console.log('📝 Parsed cruise data:', cruiseData);
      setBookingData({ ...cruiseData, type: 'cruise' });
    } else {
      console.log('❌ No booking data found in localStorage - redirecting to home in 2 seconds');
      // No booking data found, redirect to home
      setTimeout(() => navigate('/'), 2000);
    }
    
    setLoading(false);
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading booking confirmation...</p>
        </div>
      </div>
    );
  }

  if (!bookingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">No Booking Found</h2>
          <p className="text-gray-600 mb-6">We couldn't find your booking details.</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const isCruise = bookingData.type === 'cruise';

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Booking Confirmed!
            </h1>
            <p className="text-gray-600">
              Your {isCruise ? 'cruise' : 'flight'} has been successfully booked. 
              Confirmation details have been sent to your email.
            </p>
          </div>

          {/* Booking Details Card */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center mb-6">
              {isCruise ? (
                <Ship className="w-6 h-6 text-blue-500 mr-2" />
              ) : (
                <Plane className="w-6 h-6 text-blue-500 mr-2" />
              )}
              <h2 className="text-xl font-semibold">
                {isCruise ? 'Cruise Booking Details' : 'Flight Booking Details'}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Booking Reference */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    {isCruise ? 'Order ID' : 'Booking Reference'}
                  </label>
                  <p className="text-lg font-semibold text-gray-900">
                    {bookingData.orderId || bookingData.bookingReference || 'N/A'}
                  </p>
                </div>
                
                {bookingData.pnr && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">PNR Number</label>
                    <p className="text-lg font-semibold text-gray-900">{bookingData.pnr}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-500">Transaction ID</label>
                  <p className="text-lg font-semibold text-gray-900">
                    {bookingData.transactionId || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Trip Details */}
              <div className="space-y-4">
                {isCruise ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Cruise</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.cruiseData?.name || 'Cruise Booking'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Route</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.cruiseData?.departure} - {bookingData.cruiseData?.arrival}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Duration</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.cruiseData?.duration || 'N/A'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Order ID</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.orderId || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">PNR Number</label>
                      <p className="text-lg font-semibold text-blue-600">
                        {bookingData.pnr || 'Generated'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Transaction ID</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.transactionId || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <p className="text-lg font-semibold text-green-600">Confirmed</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Payment Details */}
            <div className="border-t pt-6 mt-6">
              <div className="flex items-center mb-4">
                <CreditCard className="w-5 h-5 text-gray-500 mr-2" />
                <h3 className="text-lg font-semibold">Payment Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Amount</label>
                  <p className="text-lg font-semibold text-gray-900">
                    {isCruise ? `£${bookingData.totalAmount}` : `$${bookingData.amount || bookingData.totalAmount || '0.00'}`}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Payment Status</label>
                  <p className="text-lg font-semibold text-green-600">Paid</p>
                </div>
              </div>
            </div>

            {/* Passenger Details */}
            {bookingData.passengers && (
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center mb-4">
                  <User className="w-5 h-5 text-gray-500 mr-2" />
                  <h3 className="text-lg font-semibold">Passenger Details</h3>
                </div>
                <div className="space-y-2">
                  {bookingData.passengers.adults?.map((passenger, index) => (
                    <p key={index} className="text-gray-700">
                      Adult {index + 1}: {passenger.firstName} {passenger.lastName}
                    </p>
                  ))}
                  {bookingData.passengers.children?.filter(child => child.firstName).map((passenger, index) => (
                    <p key={index} className="text-gray-700">
                      Child {index + 1}: {passenger.firstName} {passenger.lastName}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="text-center space-y-4">
            <div className="space-x-4">
              <button
                onClick={() => navigate('/')}
                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors inline-flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </button>
              
              <button
                onClick={() => navigate(isCruise ? '/cruise' : '/flights')}
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Book Another {isCruise ? 'Cruise' : 'Flight'}
              </button>
            </div>
            
            <p className="text-sm text-gray-500">
              A confirmation email has been sent with all the details of your booking.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default BookingConfirmation; 