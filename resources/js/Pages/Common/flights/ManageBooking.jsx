import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plane, Calendar, Clock, User, CreditCard,
  AlertCircle, CheckCircle, Info, Phone, Mail, Edit3,
  Download, X, Wifi, Utensils, Luggage
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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

  const downloadETicket = async () => {
    const input = document.getElementById('eticket-content');
    if (!input) return;

    try {
      const canvas = await html2canvas(input, {
        scale: 2,
        logging: false,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`JetSetters_Ticket_${bookingData?.orderId || 'Booking'}.pdf`);
    } catch (err) {
      console.error("Error generating ticket:", err);
      alert("Failed to generate ticket. Please try again.");
    }
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
          <div className={`p-4 rounded-lg mb-6 ${bookingData?.status === 'CONFIRMED' ? 'bg-green-50 border border-green-200' :
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
              <span className={`font-medium ${bookingData?.status === 'CONFIRMED' ? 'text-green-800' :
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
                  className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="border-r-0 sm:border-r border-gray-200 pr-0 sm:pr-4">
                      <label className="text-sm font-medium text-gray-500 block mb-1">PNR Number</label>
                      <p className="text-lg font-semibold font-mono text-blue-600">{bookingData?.pnr || 'Not Available'}</p>
                    </div>
                    <div className="border-r-0 md:border-r border-gray-200 pr-0 md:pr-4">
                      <label className="text-sm font-medium text-gray-500 block mb-1">Booking Reference</label>
                      <p className="text-lg font-semibold font-mono">{bookingData?.orderId || bookingData?.bookingReference}</p>
                    </div>
                    <div className="border-r-0 md:border-r border-gray-200 pr-0 md:pr-4">
                      <label className="text-sm font-medium text-gray-500 block mb-1">Amount Paid</label>
                      <p className="text-lg font-semibold">${bookingData?.amount || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 block mb-1">Transaction ID</label>
                      <p className="text-lg font-semibold font-mono break-all">{bookingData?.transactionId || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Flight Route Information */}
                  <div className="mt-6 p-6 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl border border-gray-200">
                    <h4 className="font-semibold mb-4 text-gray-700">Flight Route</h4>
                    <div className="flex items-center justify-between">
                      {/* Departure */}
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-blue-600 mb-1">
                          {bookingData?.origin || bookingData?.flight?.departureCity?.substring(0, 3)?.toUpperCase() || 'DEP'}
                        </div>
                        <div className="text-sm text-gray-600 font-medium">
                          {bookingData?.originCity || bookingData?.flight?.departureCity || 'Departure City'}
                        </div>
                        <div className="text-lg font-semibold text-gray-800 mt-2">
                          {bookingData?.departureTime || bookingData?.flight?.departureTime || '--:--'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {bookingData?.departureDate ? new Date(bookingData.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date N/A'}
                        </div>
                      </div>

                      {/* Flight Path */}
                      <div className="flex-1 px-4 text-center">
                        <div className="relative">
                          <div className="border-t-2 border-dashed border-gray-300 w-full"></div>
                          <Plane className="w-6 h-6 text-blue-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rotate-90" />
                        </div>
                        <div className="text-xs text-gray-500 mt-3">
                          {bookingData?.duration || bookingData?.flight?.duration || 'Duration N/A'}
                        </div>
                        {(bookingData?.airline || bookingData?.flightNumber) && (
                          <div className="text-sm font-medium text-gray-700 mt-1">
                            {bookingData?.airlineName || bookingData?.airline || ''} {bookingData?.flightNumber || ''}
                          </div>
                        )}
                      </div>

                      {/* Arrival */}
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-blue-600 mb-1">
                          {bookingData?.destination || bookingData?.flight?.arrivalCity?.substring(0, 3)?.toUpperCase() || 'ARR'}
                        </div>
                        <div className="text-sm text-gray-600 font-medium">
                          {bookingData?.destinationCity || bookingData?.flight?.arrivalCity || 'Arrival City'}
                        </div>
                        <div className="text-lg font-semibold text-gray-800 mt-2">
                          {bookingData?.arrivalTime || bookingData?.flight?.arrivalTime || '--:--'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {bookingData?.departureDate ? new Date(bookingData.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Additional Flight Info */}
                    {(bookingData?.cabinClass || bookingData?.passengers) && (
                      <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-gray-200">
                        {bookingData?.cabinClass && (
                          <div className="text-center">
                            <span className="text-xs text-gray-500 block">Class</span>
                            <span className="text-sm font-medium text-gray-700 capitalize">{bookingData.cabinClass.toLowerCase().replace('_', ' ')}</span>
                          </div>
                        )}
                        {bookingData?.passengers && (
                          <div className="text-center">
                            <span className="text-xs text-gray-500 block">Passengers</span>
                            <span className="text-sm font-medium text-gray-700">{bookingData.passengers}</span>
                          </div>
                        )}
                      </div>
                    )}
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
              <a href="tel:(877) 538-7380" className="flex items-center text-blue-600 hover:text-blue-700">
                <Phone className="w-4 h-4 mr-1" />
                (877) 538-7380
              </a>
              <a href="mailto:support@jetsetterss.com" className="flex items-center text-blue-600 hover:text-blue-700">
                <Mail className="w-4 h-4 mr-1" />
                support@jetsetterss.com
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

      {/* Hidden E-Ticket Template for PDF Generation */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
        <div id="eticket-content" className="w-[800px] bg-white text-gray-800 font-sans relative">
          {/* Ticket Header */}
          <div className="bg-[#055B75] text-white p-8 flex justify-between items-center rounded-t-lg">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">JetSetters</h1>
              <p className="text-sm uppercase tracking-widest opacity-80">Electronic Ticket Receipt</p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase opacity-70 mb-1">Booking Reference</div>
              <div className="text-3xl font-mono font-bold tracking-wider">{bookingData?.orderId || bookingData?.bookingReference || 'PENDING'}</div>
            </div>
          </div>

          <div className="p-8 border-x border-b border-gray-200 rounded-b-lg">
            {/* Flight Info */}
            <div className="flex justify-between items-start mb-10 pb-8 border-b border-dashed border-gray-300">
              <div className="flex-1">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Flight</div>
                <div className="text-xl font-bold text-[#055B75]">{bookingData?.airlineName || bookingData?.airline || 'JetSetters Air'} {bookingData?.flightNumber || 'JS-001'}</div>
                <div className="text-sm text-gray-600 mt-1">{bookingData?.cabinClass?.replace('_', ' ') || 'Economy'} Class</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date</div>
                <div className="text-xl font-bold">{bookingData?.departureDate ? new Date(bookingData.departureDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date N/A'}</div>
              </div>
              <div className="flex-1 text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</div>
                <div className="text-xl font-bold text-green-600 uppercase">{bookingData?.status || 'Confirmed'}</div>
              </div>
            </div>

            {/* PNR and Reference Row */}
            <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-200">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">PNR Number</div>
                <div className="text-2xl font-bold font-mono text-[#055B75]">{bookingData?.pnr || 'N/A'}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Transaction ID</div>
                <div className="text-lg font-mono text-gray-700">{bookingData?.transactionId || 'N/A'}</div>
              </div>
            </div>

            {/* Route */}
            <div className="flex items-center justify-between mb-12">
              <div>
                <div className="text-4xl font-bold text-[#055B75] mb-1">{bookingData?.origin || 'DEP'}</div>
                <div className="text-sm text-gray-500 font-medium">{bookingData?.originCity || 'Departure City'}</div>
                <div className="text-lg font-bold mt-2">{bookingData?.departureTime || '--:--'}</div>
                <div className="text-xs text-gray-400">{bookingData?.departureDate ? new Date(bookingData.departureDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</div>
              </div>

              <div className="flex-1 px-8 text-center relative">
                <div className="border-t-2 border-dashed border-gray-300 w-full absolute top-1/2 left-0 -z-10"></div>
                <div className="bg-white px-2 inline-block">
                  <Plane className="w-6 h-6 text-[#055B75] transform rotate-90" />
                </div>
                <div className="text-xs text-gray-400 mt-2">{bookingData?.duration || 'Direct'}</div>
              </div>

              <div className="text-right">
                <div className="text-4xl font-bold text-[#055B75] mb-1">{bookingData?.destination || 'ARR'}</div>
                <div className="text-sm text-gray-500 font-medium">{bookingData?.destinationCity || 'Arrival City'}</div>
                <div className="text-lg font-bold mt-2">{bookingData?.arrivalTime || '--:--'}</div>
                <div className="text-xs text-gray-400">{bookingData?.departureDate ? new Date(bookingData.departureDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</div>
              </div>
            </div>

            {/* Passenger Grid */}
            <div className="mb-10">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 border-b pb-2">Passenger Information</h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-gray-400">
                    <th className="pb-2 font-normal">Passenger Name</th>
                    <th className="pb-2 font-normal">Ticket Number</th>
                    <th className="pb-2 font-normal text-right">Baggage</th>
                  </tr>
                </thead>
                <tbody>
                  {bookingData?.travelers?.map((p, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 font-semibold text-gray-700">{p.firstName} {p.lastName}</td>
                      <td className="py-3 font-mono text-gray-600">JS-{Math.random().toString(36).substr(2, 9).toUpperCase()}</td>
                      <td className="py-3 text-right text-gray-600">23 KG</td>
                    </tr>
                  )) || (
                      <tr>
                        <td className="py-3 font-semibold text-gray-700">{bookingData?.username || 'Guest'}</td>
                        <td className="py-3 font-mono text-gray-600">JS-TICKET-001</td>
                        <td className="py-3 text-right text-gray-600">23 KG</td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>

            {/* Payment Summary */}
            <div className="bg-gray-50 p-6 rounded-lg mb-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 text-sm">Base Fare</span>
                <span className="font-semibold">{bookingData?.currency || 'USD'} {(parseFloat(bookingData?.amount || 0) * 0.85).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
                <span className="text-gray-600 text-sm">Taxes & Fees</span>
                <span className="font-semibold">{bookingData?.currency || 'USD'} {(parseFloat(bookingData?.amount || 0) * 0.15).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-lg">
                <span className="font-bold text-[#055B75]">Total Paid</span>
                <span className="font-bold text-[#055B75]">{bookingData?.currency || 'USD'} {parseFloat(bookingData?.amount || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-400 mt-12">
              <p className="mb-1">This is an electronic ticket. Please execute carriage under the conditions of contract.</p>
              <p>© 2026 JetSetters Airlines. All rights reserved.</p>
            </div>
          </div>
          {/* Decorative bottom edge */}
          <div className="bg-[#055B75] h-2 rounded-b-lg mt-0"></div>
        </div>
      </div>
    </div>
  );
}

export default ManageBooking; 