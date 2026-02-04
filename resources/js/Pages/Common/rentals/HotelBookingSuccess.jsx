import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Download, Calendar, MapPin, Users, Mail, Phone, CreditCard, Clock, Share, Star } from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import './styles.css';

export default function HotelBookingSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [bookingDetails, setBookingDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const bookingReference = searchParams.get('booking');
  const orderId = searchParams.get('orderId');
  const paymentId = searchParams.get('paymentId');

  useEffect(() => {
    if (!bookingReference) {
      navigate('/rental');
      return;
    }

    // Simulate fetching booking details
    // In a real implementation, you would fetch from your API using the booking reference
    const fetchBookingDetails = async () => {
      try {
        setLoading(true);

        // Mock booking data - replace with actual API call
        const mockBookingData = {
          bookingReference: bookingReference,
          confirmationNumber: `HTL${bookingReference.slice(-6)}`,
          status: 'CONFIRMED',
          hotelDetails: {
            name: 'Grand Luxury Resort',
            address: '123 Main Street, City Center',
            location: 'New York, NY',
            rating: 4.5,
            phone: '+(877) 538-7380',
            email: 'reservations@grandluxury.com',
            image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80'
          },
          roomDetails: {
            type: 'Deluxe King Room',
            bedType: 'King Bed',
            maxOccupancy: 2,
            amenities: ['Free WiFi', 'Air Conditioning', 'Mini Bar', 'Room Service']
          },
          stayDetails: {
            checkInDate: '2025-07-24',
            checkOutDate: '2025-07-28',
            nights: 4,
            guests: 2
          },
          guestDetails: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1 (555) 987-6543'
          },
          paymentDetails: {
            totalAmount: 796.00,
            currency: 'USD',
            paymentMethod: 'Credit Card',
            paymentDate: new Date().toISOString(),
            transactionId: paymentId || `TXN${Date.now()}`
          },
          bookingDate: new Date().toISOString(),
          specialRequests: 'Late check-in requested'
        };

        setBookingDetails(mockBookingData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching booking details:', error);
        setError('Unable to load booking details');
        setLoading(false);
      }
    };

    fetchBookingDetails();
  }, [bookingReference, navigate, paymentId]);

  const handleDownloadConfirmation = () => {
    // Generate and download booking confirmation PDF
    const bookingInfo = `
HOTEL BOOKING CONFIRMATION

Confirmation Number: ${bookingDetails.confirmationNumber}
Booking Reference: ${bookingDetails.bookingReference}

HOTEL DETAILS:
${bookingDetails.hotelDetails.name}
${bookingDetails.hotelDetails.address}
Phone: ${bookingDetails.hotelDetails.phone}
Email: ${bookingDetails.hotelDetails.email}

GUEST DETAILS:
${bookingDetails.guestDetails.firstName} ${bookingDetails.guestDetails.lastName}
Email: ${bookingDetails.guestDetails.email}
Phone: ${bookingDetails.guestDetails.phone}

STAY DETAILS:
Check-in: ${new Date(bookingDetails.stayDetails.checkInDate).toLocaleDateString()}
Check-out: ${new Date(bookingDetails.stayDetails.checkOutDate).toLocaleDateString()}
Nights: ${bookingDetails.stayDetails.nights}
Guests: ${bookingDetails.stayDetails.guests}
Room Type: ${bookingDetails.roomDetails.type}

PAYMENT DETAILS:
Total Amount: ${bookingDetails.paymentDetails.currency} ${bookingDetails.paymentDetails.totalAmount.toFixed(2)}
Payment Method: ${bookingDetails.paymentDetails.paymentMethod}
Transaction ID: ${bookingDetails.paymentDetails.transactionId}

Booking Date: ${new Date(bookingDetails.bookingDate).toLocaleDateString()}
    `;

    const element = document.createElement('a');
    const file = new Blob([bookingInfo], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Hotel_Booking_${bookingDetails.confirmationNumber}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Hotel Booking Confirmation',
        text: `My hotel booking is confirmed! ${bookingDetails.hotelDetails.name} - ${bookingDetails.confirmationNumber}`,
        url: window.location.href
      });
    } else {
      // Fallback for browsers that don't support Web Share API
      navigator.clipboard.writeText(window.location.href);
      alert('Booking link copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar forceScrolled={true} />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading booking details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !bookingDetails) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar forceScrolled={true} />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md px-4">
            <div className="text-red-500 text-5xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Booking Not Found</h2>
            <p className="text-gray-600 mb-6">{error || 'We couldn\'t find your booking details.'}</p>
            <button
              onClick={() => navigate('/rental')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
            >
              Back to Hotels
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar forceScrolled={true} />

      <div className="pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
            <p className="text-lg text-gray-600">
              Your hotel reservation has been successfully confirmed
            </p>
            <div className="mt-4 inline-flex items-center px-4 py-2 bg-green-100 rounded-full">
              <span className="text-sm font-medium text-green-800">
                Confirmation #: {bookingDetails.confirmationNumber}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <button
              onClick={handleDownloadConfirmation}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="h-5 w-5 mr-2" />
              Download Confirmation
            </button>
            <button
              onClick={handleShare}
              className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Share className="h-5 w-5 mr-2" />
              Share
            </button>
          </div>

          {/* Booking Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Hotel Information */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <img
                src={bookingDetails.hotelDetails.image}
                alt={bookingDetails.hotelDetails.name}
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {bookingDetails.hotelDetails.name}
                </h3>
                <div className="flex items-center mb-2">
                  <Star className="h-4 w-4 text-yellow-400 fill-current" />
                  <span className="ml-1 text-sm text-gray-600">{bookingDetails.hotelDetails.rating}</span>
                </div>
                <div className="flex items-start text-gray-600 mb-2">
                  <MapPin className="h-4 w-4 mr-2 mt-1 flex-shrink-0" />
                  <span className="text-sm">{bookingDetails.hotelDetails.address}</span>
                </div>
                <div className="flex items-center text-gray-600 mb-2">
                  <Phone className="h-4 w-4 mr-2" />
                  <span className="text-sm">{bookingDetails.hotelDetails.phone}</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <Mail className="h-4 w-4 mr-2" />
                  <span className="text-sm">{bookingDetails.hotelDetails.email}</span>
                </div>
              </div>
            </div>

            {/* Booking Summary */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Booking Summary</h3>

              {/* Stay Details */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Stay Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                    <span>Check-in: {new Date(bookingDetails.stayDetails.checkInDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                    <span>Check-out: {new Date(bookingDetails.stayDetails.checkOutDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2 text-gray-400" />
                    <span>{bookingDetails.stayDetails.nights} nights</span>
                  </div>
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-2 text-gray-400" />
                    <span>{bookingDetails.stayDetails.guests} guests</span>
                  </div>
                </div>
              </div>

              {/* Room Details */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Room Details</h4>
                <div className="text-sm">
                  <p className="mb-2">{bookingDetails.roomDetails.type}</p>
                  <p className="text-gray-600 mb-2">{bookingDetails.roomDetails.bedType}</p>
                  <div className="flex flex-wrap gap-1">
                    {bookingDetails.roomDetails.amenities.map((amenity, index) => (
                      <span key={index} className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Guest Details */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Guest Details</h4>
                <div className="text-sm">
                  <p className="mb-1">{bookingDetails.guestDetails.firstName} {bookingDetails.guestDetails.lastName}</p>
                  <p className="text-gray-600 mb-1">{bookingDetails.guestDetails.email}</p>
                  <p className="text-gray-600">{bookingDetails.guestDetails.phone}</p>
                </div>
              </div>

              {/* Payment Summary */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-3">Payment Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Total Amount:</span>
                    <span className="font-medium">
                      {bookingDetails.paymentDetails.currency} {bookingDetails.paymentDetails.totalAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Payment Method:</span>
                    <span>{bookingDetails.paymentDetails.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Transaction ID:</span>
                    <span className="font-mono text-xs">{bookingDetails.paymentDetails.transactionId}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Important Information */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-4">Important Information</h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p>• Check-in time is typically after 3:00 PM</p>
              <p>• Check-out time is typically before 11:00 AM</p>
              <p>• Please bring a valid ID and credit card for incidentals</p>
              <p>• Confirmation email has been sent to {bookingDetails.guestDetails.email}</p>
              <p>• For any changes or cancellations, contact the hotel directly</p>
              {bookingDetails.specialRequests && (
                <p>• Special Request: {bookingDetails.specialRequests}</p>
              )}
            </div>
          </div>

          {/* Return Button */}
          <div className="text-center mt-8">
            <button
              onClick={() => navigate('/rental')}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Book Another Hotel
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
} 