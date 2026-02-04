import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Ship, Plane, Calendar, User, CreditCard, ArrowLeft, Clock, MapPin, Luggage, Users, Download, Mail } from 'lucide-react';
import Navbar from './Navbar';

// Helper function to calculate days until trip
const getDaysUntilTrip = (dateStr) => {
  if (!dateStr) return null;
  const tripDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  tripDate.setHours(0, 0, 0, 0);
  const diffTime = tripDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Format duration from ISO format
const formatDuration = (duration) => {
  if (!duration) return 'N/A';
  if (typeof duration === 'string' && duration.startsWith('PT')) {
    return duration.replace('PT', '').replace('H', 'h ').replace('M', 'm');
  }
  return duration;
};

function BookingConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // First check if data was passed via navigation state
    if (location.state?.bookingData) {
      console.log('📝 Using booking data from navigation state:', location.state.bookingData);
      setBookingData(location.state.bookingData);
      setLoading(false);
      return;
    }

    // Get booking data from localStorage - prioritize flight bookings
    const flightBooking = localStorage.getItem('completedFlightBooking');
    const cruiseBooking = localStorage.getItem('completedBooking');

    console.log('🔍 BookingConfirmation - localStorage check:');
    console.log('flightBooking:', flightBooking ? 'Found' : 'Not found');
    console.log('cruiseBooking:', cruiseBooking ? 'Found' : 'Not found');

    if (flightBooking) {
      const flightData = JSON.parse(flightBooking);
      console.log('📝 Parsed flight data:', flightData);
      setBookingData({ ...flightData, type: 'flight' });
    } else if (cruiseBooking) {
      const cruiseData = JSON.parse(cruiseBooking);
      console.log('📝 Parsed cruise data:', cruiseData);
      setBookingData({ ...cruiseData, type: 'cruise' });
    } else {
      console.log('❌ No booking data found');
      setTimeout(() => navigate('/my-trips'), 2000);
    }

    setLoading(false);
  }, [navigate, location.state]);

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
            onClick={() => navigate('/my-trips')}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Go to My Trips
          </button>
        </div>
      </div>
    );
  }

  const isCruise = bookingData.type === 'cruise';
  const isHotel = bookingData.type === 'hotel';
  const isFlight = bookingData.type === 'flight';
  const isPackage = bookingData.type === 'package';

  // Get travel date for countdown
  const getTravelDate = () => {
    if (isFlight) return bookingData.departureDate || bookingData.flightData?.departureDate;
    if (isCruise) return bookingData.cruiseDepartureDate || bookingData.cruiseData?.departureDate;
    if (isHotel) return bookingData.checkinDate || bookingData.hotelData?.checkinDate;
    if (isPackage) return bookingData.packageStartDate;
    return null;
  };

  const daysUntilTrip = getDaysUntilTrip(getTravelDate());

  // Get icon based on type
  const TripIcon = isCruise ? Ship : Plane;
  const tripType = isCruise ? 'Cruise' : isFlight ? 'Flight' : isHotel ? 'Hotel' : 'Package';

  return (
    <>
      <Navbar forceScrolled />
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4">
          {/* Success Header with Animation */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-4 shadow-lg animate-bounce">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Booking Confirmed! 🎉
            </h1>
            <p className="text-gray-600 mb-4">
              Your {tripType.toLowerCase()} has been successfully booked.
            </p>

            {/* Travel Countdown */}
            {daysUntilTrip !== null && daysUntilTrip >= 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-medium">
                <Calendar className="w-4 h-4" />
                {daysUntilTrip === 0 ? (
                  <span>Your trip is today! ✈️</span>
                ) : daysUntilTrip === 1 ? (
                  <span>Your trip is tomorrow!</span>
                ) : (
                  <span>{daysUntilTrip} days until your trip</span>
                )}
              </div>
            )}
          </div>

          {/* Main Trip Card */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-6 border border-gray-100">
            {/* Trip Header with Visual Route */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-8 text-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <TripIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{tripType} Booking</h2>
                  <p className="text-blue-200 text-sm">#{bookingData.orderId || bookingData.bookingReference || 'N/A'}</p>
                </div>
                <div className="ml-auto">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-sm font-semibold rounded-full">
                    <CheckCircle className="w-4 h-4" /> Confirmed
                  </span>
                </div>
              </div>

              {/* Visual Route Display for Flights */}
              {isFlight && (bookingData.origin || bookingData.destination || bookingData.flightData) && (
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{bookingData.origin || bookingData.flightData?.origin || 'DEP'}</p>
                      <p className="text-blue-200 text-sm">{bookingData.originCity || 'Departure'}</p>
                      {(bookingData.departureTime || bookingData.flightData?.departureTime) && (
                        <p className="text-white font-semibold mt-1">{bookingData.departureTime || bookingData.flightData?.departureTime}</p>
                      )}
                    </div>
                    <div className="flex-1 px-4">
                      <div className="relative">
                        <div className="border-t-2 border-dashed border-white/40"></div>
                        <Plane className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-white rotate-90" />
                      </div>
                      {(bookingData.duration || bookingData.flightData?.duration) && (
                        <p className="text-center text-blue-200 text-xs mt-2">
                          {formatDuration(bookingData.duration || bookingData.flightData?.duration)}
                        </p>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{bookingData.destination || bookingData.flightData?.destination || 'ARR'}</p>
                      <p className="text-blue-200 text-sm">{bookingData.destinationCity || 'Arrival'}</p>
                      {(bookingData.arrivalTime || bookingData.flightData?.arrivalTime) && (
                        <p className="text-white font-semibold mt-1">{bookingData.arrivalTime || bookingData.flightData?.arrivalTime}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Visual Display for Cruise */}
              {isCruise && (bookingData.cruiseDestination || bookingData.cruiseData) && (
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    <MapPin className="w-5 h-5 text-blue-200" />
                    <div>
                      <p className="font-semibold">{bookingData.cruiseDestination || bookingData.cruiseData?.destination}</p>
                      <p className="text-blue-200 text-sm">{bookingData.cruiseDuration || bookingData.cruiseData?.duration} Days Cruise</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Visual Display for Hotel */}
              {isHotel && (bookingData.hotelDestination || bookingData.hotelData) && (
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    <MapPin className="w-5 h-5 text-blue-200" />
                    <div>
                      <p className="font-semibold">{bookingData.hotelName || bookingData.hotelData?.name || 'Hotel'}</p>
                      <p className="text-blue-200 text-sm">{bookingData.hotelDestination || bookingData.hotelData?.destination}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Trip Details Grid */}
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Travel Details
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {/* Travel Date */}
                {getTravelDate() && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                      {isFlight ? 'Departure' : isHotel ? 'Check-in' : 'Start Date'}
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      {new Date(getTravelDate()).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}

                {/* Return/End Date */}
                {(bookingData.returnDate || bookingData.checkoutDate || bookingData.packageEndDate) && (
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">
                      {isFlight ? 'Return' : isHotel ? 'Check-out' : 'End Date'}
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      {new Date(bookingData.returnDate || bookingData.checkoutDate || bookingData.packageEndDate).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}

                {/* Passengers/Guests */}
                {(bookingData.passengers || bookingData.travelers || bookingData.guests) && (
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Travelers</p>
                    <p className="text-sm font-bold text-gray-900">
                      {(() => {
                        const data = bookingData.passengers || bookingData.travelers || bookingData.guests;
                        // If it's an array of traveler objects
                        if (Array.isArray(data)) {
                          if (data.length === 0) return '1 Traveler';
                          // Show names if available
                          if (typeof data[0] === 'object' && (data[0].firstName || data[0].name)) {
                            return data.map(t => `${t.firstName || t.name?.firstName || ''} ${t.lastName || t.name?.lastName || ''}`.trim()).join(', ') || `${data.length} Traveler(s)`;
                          }
                          return `${data.length} Traveler(s)`;
                        }
                        // If it's an object with adults/children
                        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                          return `${(data.adults?.length || 0) + (data.children?.length || 0)} Passengers`;
                        }
                        // If it's a number
                        if (typeof data === 'number') {
                          return `${data} Traveler(s)`;
                        }
                        return '1 Traveler';
                      })()}
                    </p>
                  </div>
                )}

                {/* Class/Cabin Type */}
                {(bookingData.travelClass || bookingData.cabinType || bookingData.roomType) && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">
                      {isFlight ? 'Class' : isHotel ? 'Room Type' : 'Cabin'}
                    </p>
                    <p className="text-sm font-bold text-gray-900 capitalize">
                      {(bookingData.travelClass || bookingData.cabinType || bookingData.roomType || 'Standard').replace('_', ' ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Booking Reference Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-6 p-5 bg-gray-50 rounded-xl">
                <div className="border-r-0 sm:border-r border-gray-200 pr-0 sm:pr-6">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Booking Reference</p>
                  <p className="text-lg font-bold text-gray-900 font-mono">{bookingData.orderId || bookingData.bookingReference || 'N/A'}</p>
                </div>
                {bookingData.pnr && (
                  <div className="border-r-0 md:border-r border-gray-200 pr-0 md:pr-6">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">PNR Number</p>
                    <p className="text-lg font-bold text-blue-600 font-mono">{bookingData.pnr}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Transaction ID</p>
                  <p className="text-lg font-bold text-gray-900 font-mono break-all">{bookingData.transactionId || 'N/A'}</p>
                </div>
              </div>

              {/* Passenger Details */}
              {bookingData.passengers && typeof bookingData.passengers === 'object' && (
                <div className="mb-6">
                  <h4 className="text-md font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    Passenger Details
                  </h4>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    {bookingData.passengers.adults?.map((passenger, index) => (
                      <div key={`adult-${index}`} className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                          A{index + 1}
                        </span>
                        <span className="text-gray-700 font-medium">
                          {passenger.firstName} {passenger.lastName}
                        </span>
                        {passenger.email && <span className="text-gray-400 text-sm">({passenger.email})</span>}
                      </div>
                    ))}
                    {bookingData.passengers.children?.filter(child => child.firstName).map((passenger, index) => (
                      <div key={`child-${index}`} className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                          C{index + 1}
                        </span>
                        <span className="text-gray-700 font-medium">
                          {passenger.firstName} {passenger.lastName}
                        </span>
                        <span className="text-xs text-gray-400">(Child)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Summary */}
              <div className="border-t pt-6">
                <h4 className="text-md font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  Payment Summary
                </h4>
                <div className="flex justify-between items-center p-4 bg-green-50 rounded-xl border border-green-200">
                  <div>
                    <p className="text-sm text-green-700">Total Paid</p>
                    <p className="text-2xl font-bold text-green-800">
                      {bookingData.currency || 'USD'} {parseFloat(bookingData.amount || bookingData.totalAmount || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Payment Successful</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/my-trips')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              View All Trips
            </button>

            <button
              onClick={() => navigate(isCruise ? '/cruise' : isFlight ? '/flights' : isHotel ? '/hotels' : '/packages')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-lg"
            >
              Book Another {tripType}
            </button>
          </div>

          <p className="text-center text-sm text-gray-500 mt-6">
            📧 A confirmation email has been sent with all the details of your booking.
          </p>
        </div>
      </div>
    </>
  );
}

export default BookingConfirmation; 