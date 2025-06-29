import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, Plane, Calendar, Clock, User, CreditCard, 
  AlertCircle, CheckCircle, Info, Phone, Mail, Edit3,
  Download, X, Wifi, Utensils, Luggage
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';

function ManageBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookingId } = useParams();
  
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    // Get booking data from location state or localStorage
    let booking = null;
    
    if (location.state?.bookingData) {
      booking = location.state.bookingData;
    } else if (bookingId) {
      // Try to find booking by ID in localStorage
      const flightBooking = localStorage.getItem('completedFlightBooking');
      if (flightBooking) {
        const parsed = JSON.parse(flightBooking);
        if (parsed.orderId === bookingId || parsed.bookingReference === bookingId) {
          booking = parsed;
        }
      }
    }

    if (booking) {
      setBookingData(booking);
    } else {
      setError('Booking not found');
    }
    
    setLoading(false);
  }, [location.state, bookingId]);

  const handleCancelBooking = () => {
    setShowCancelModal(true);
  };

  const confirmCancelBooking = () => {
    // Update booking status to cancelled
    if (bookingData) {
      const updatedBooking = { ...bookingData, status: 'CANCELLED' };
      localStorage.setItem('completedFlightBooking', JSON.stringify(updatedBooking));
      setBookingData(updatedBooking);
      setShowCancelModal(false);
      
      // Show success message
      alert('Booking cancelled successfully');
    }
  };

  const downloadETicket = () => {
    // Simulate e-ticket download
    alert('E-ticket download will be implemented soon');
  };

  const modifyBooking = () => {
    // Navigate to modify booking flow
    alert('Booking modification will be implemented soon');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading booking details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Error Loading Booking</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button 
              onClick={() => navigate('/my-trips')}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition"
            >
              Back to My Trips
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="pt-[80px]">
        <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button 
            onClick={() => navigate('/my-trips')}
            className="flex items-center text-blue-600 hover:text-blue-700 mr-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back to My Trips
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Manage Booking</h1>
            <p className="text-gray-600">Booking Reference: {bookingData?.orderId || bookingData?.bookingReference}</p>
          </div>
        </div>

        {/* Status Banner */}
        <div className={`p-4 rounded-lg mb-6 ${
          bookingData?.status === 'CONFIRMED' ? 'bg-green-50 border border-green-200' :
          bookingData?.status === 'CANCELLED' ? 'bg-red-50 border border-red-200' :
          bookingData?.status === 'FAILED' ? 'bg-red-50 border border-red-200' :
          'bg-blue-50 border border-blue-200'
        }`}>
          <div className="flex items-center">
            {bookingData?.status === 'CONFIRMED' ? (
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            ) : bookingData?.status === 'CANCELLED' ? (
              <X className="w-5 h-5 text-red-600 mr-2" />
            ) : (
              <Info className="w-5 h-5 text-blue-600 mr-2" />
            )}
            <span className={`font-medium ${
              bookingData?.status === 'CONFIRMED' ? 'text-green-800' :
              bookingData?.status === 'CANCELLED' ? 'text-red-800' :
              'text-blue-800'
            }`}>
              Booking Status: {bookingData?.status || 'Confirmed'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={downloadETicket}
            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Download className="w-4 h-4 mr-2" />
            Download E-Ticket
          </button>
          
          {bookingData?.status === 'CONFIRMED' && (
            <>
              <button
                onClick={modifyBooking}
                className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Modify Booking
              </button>
              <button
                onClick={handleCancelBooking}
                className="flex items-center bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel Booking
              </button>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {[
              { id: 'details', label: 'Flight Details', icon: Plane },
              { id: 'passenger', label: 'Passenger Info', icon: User },
              { id: 'payment', label: 'Payment', icon: CreditCard },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          {activeTab === 'details' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Flight Information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">PNR Number</label>
                    <p className="text-lg font-semibold">{bookingData?.pnr || 'Not Available'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Booking Reference</label>
                    <p className="text-lg font-semibold">{bookingData?.orderId || bookingData?.bookingReference}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Amount Paid</label>
                    <p className="text-lg font-semibold">${bookingData?.amount || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Transaction ID</label>
                    <p className="text-lg font-semibold">{bookingData?.transactionId || 'N/A'}</p>
                  </div>
                </div>

                {/* Flight Route Information */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-3">Flight Route</h4>
                  <div className="flex items-center space-x-4">
                    <div className="text-center">
                      <div className="text-sm text-gray-500">From</div>
                      <div className="font-semibold">Flight Details</div>
                      <div className="text-sm text-gray-500">Available in flight data</div>
                    </div>
                    <Plane className="w-5 h-5 text-blue-500" />
                    <div className="text-center">
                      <div className="text-sm text-gray-500">To</div>
                      <div className="font-semibold">Check confirmation</div>
                      <div className="text-sm text-gray-500">for full details</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'passenger' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Passenger Information</h3>
              {bookingData?.travelers && bookingData.travelers.length > 0 ? (
                <div className="space-y-4">
                  {bookingData.travelers.map((traveler, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-semibold mb-2">Passenger {index + 1}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500">Name</label>
                          <p>{traveler.firstName} {traveler.lastName}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Email</label>
                          <p>{traveler.email || 'Not provided'}</p>
                        </div>
                        {traveler.dateOfBirth && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Date of Birth</label>
                            <p>{traveler.dateOfBirth}</p>
                          </div>
                        )}
                        {traveler.gender && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Gender</label>
                            <p>{traveler.gender}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No passenger information available</p>
              )}
            </div>
          )}

          {activeTab === 'payment' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Payment Information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Total Amount</label>
                    <p className="text-xl font-bold text-green-600">${bookingData?.amount || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Payment Status</label>
                    <p className="text-lg font-semibold text-green-600">Paid</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Transaction ID</label>
                    <p className="font-mono">{bookingData?.transactionId || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Booking Date</label>
                    <p>{new Date(bookingData?.orderCreatedAt || bookingData?.bookingDate).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                    <span className="font-medium text-green-800">Payment Confirmed</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Your payment has been successfully processed and your booking is confirmed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contact Support */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 mb-2">Need Help?</h4>
          <p className="text-blue-700 text-sm mb-3">Our customer support team is here to assist you with any questions about your booking.</p>
          <div className="flex flex-wrap gap-4">
            <a href="tel:+1-800-123-4567" className="flex items-center text-blue-600 hover:text-blue-700">
              <Phone className="w-4 h-4 mr-1" />
              +1-800-123-4567
            </a>
            <a href="mailto:support@jetsetgo.com" className="flex items-center text-blue-600 hover:text-blue-700">
              <Mail className="w-4 h-4 mr-1" />
              support@jetsetgo.com
            </a>
          </div>
        </div>
        </div>
      </div>

      {/* Cancel Booking Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-mx">
            <h3 className="text-lg font-semibold mb-4">Cancel Booking</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to cancel this booking? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition"
              >
                Keep Booking
              </button>
              <button
                onClick={confirmCancelBooking}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition"
              >
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default ManageBooking; 