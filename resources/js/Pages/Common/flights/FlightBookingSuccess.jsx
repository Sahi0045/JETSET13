import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Download, Printer, Share2, Copy, ArrowLeft } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Navbar from '../Navbar';
import Footer from '../Footer';
import Price from '../../../Components/Price';
import FlightETicket from './FlightETicket';

export default function FlightBookingSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCopiedMsg, setShowCopiedMsg] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const ticketRef = React.useRef(null);

  useEffect(() => {
    // Get booking data from location state
    if (location.state) {
      setBookingData(location.state);
      setLoading(false);
    } else {
      // If no state, redirect back to flight search
      navigate('/flights');
    }
  }, [location, navigate]);

  const handlePrintTicket = () => {
    window.print();
  };

  const handleDownloadTicket = async () => {
    if (!ticketRef.current) {
      alert("Ticket template not ready. Please wait and try again.");
      return;
    }

    setIsGenerating(true);
    try {
      const element = ticketRef.current;

      // Wait for images to fully load
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 0,
        removeContainer: true
      });

      // Use JPEG format to avoid PNG signature issues
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`JetSetters_Ticket_${bookingData.bookingDetails?.bookingId || 'Booking'}.pdf`);
    } catch (error) {
      console.error('Error generating ticket:', error);
      alert('Failed to generate ticket. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareTicket = () => {
    // In a real app, this would open a share dialog
    alert('Share dialog would open in a real application');
  };

  const copyBookingId = () => {
    if (bookingData?.bookingDetails?.bookingId) {
      navigator.clipboard.writeText(bookingData.bookingDetails.bookingId);
      setShowCopiedMsg(true);
      setTimeout(() => {
        setShowCopiedMsg(false);
      }, 2000);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-20">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-center text-gray-500">Loading your booking confirmation...</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <Navbar />

      <div className="container mx-auto px-4 pt-24 pb-10">
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-blue-600"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            <span>Back</span>
          </button>
        </div>

        {/* Booking Success Banner */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row items-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 md:mb-0 md:mr-6">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Booking Confirmed!</h1>
              <p className="text-gray-600 mb-2">
                Your flight tickets have been successfully booked and confirmed. A confirmation email has been sent to {bookingData.passengerData[0]?.email || 'your email address'}.
              </p>
              <div className="flex items-center justify-center md:justify-start">
                <div className="font-medium text-gray-700 mr-2">Booking ID:</div>
                <div className="font-bold">{bookingData.bookingDetails.bookingId}</div>
                <button
                  onClick={copyBookingId}
                  className="text-blue-600 ml-2 p-1 hover:bg-blue-50 rounded transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {showCopiedMsg && (
                  <span className="text-sm text-green-600 ml-2">Copied!</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap -mx-3">
          {/* Left Column - Ticket Details */}
          <div className="w-full lg:w-2/3 px-3 mb-6">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-blue-600 flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">E-Ticket</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={handlePrintTicket}
                    className="bg-white text-blue-600 p-2 rounded hover:bg-blue-50 transition-colors"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleDownloadTicket}
                    disabled={isGenerating}
                    className="bg-white text-blue-600 p-2 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Download className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={handleShareTicket}
                    className="bg-white text-blue-600 p-2 rounded hover:bg-blue-50 transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* Flight Information */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-lg font-semibold text-gray-800">
                      {bookingData.bookingDetails.flight.departureCity} → {bookingData.bookingDetails.flight.arrivalCity}
                    </div>
                    <div className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                      {bookingData.bookingDetails.status.toUpperCase()}
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 mb-4">
                    {formatDate(bookingData.bookingDetails.flight.departureDate)}
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
                    <div className="flex items-center mb-4 md:mb-0">
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                        <span className="font-semibold text-gray-700">
                          {bookingData.bookingDetails.flight.airline.split(' ').map(word => word[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium">{bookingData.bookingDetails.flight.airline}</div>
                        <div className="text-sm text-gray-600">{bookingData.bookingDetails.flight.flightNumber}</div>
                      </div>
                    </div>

                    <div className="text-sm">
                      <span className="font-medium">PNR:</span> {bookingData.bookingDetails.pnr}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4">
                    {/* Departure */}
                    <div className="col-span-5">
                      <div className="text-2xl font-bold">{bookingData.bookingDetails.flight.departureTime}</div>
                      <div className="text-gray-700">{bookingData.bookingDetails.flight.departureCity}</div>
                      <div className="text-sm text-gray-600">{bookingData.bookingDetails.flight.departureAirport}</div>
                    </div>

                    {/* Flight Duration */}
                    <div className="col-span-2 flex flex-col items-center justify-center">
                      <div className="text-sm text-gray-600">{bookingData.bookingDetails.flight.duration}</div>
                      <div className="h-px w-full bg-gray-300 relative my-2">
                        <div className="absolute h-2 w-2 rounded-full bg-gray-400 -top-1 left-0"></div>
                        <div className="absolute h-2 w-2 rounded-full bg-gray-400 -top-1 right-0"></div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {bookingData.bookingDetails.flight.stops === 0 ? 'Non-stop' : `${bookingData.bookingDetails.flight.stops} stop`}
                      </div>
                    </div>

                    {/* Arrival */}
                    <div className="col-span-5">
                      <div className="text-2xl font-bold">{bookingData.bookingDetails.flight.arrivalTime}</div>
                      <div className="text-gray-700">{bookingData.bookingDetails.flight.arrivalCity}</div>
                      <div className="text-sm text-gray-600">{bookingData.bookingDetails.flight.arrivalAirport}</div>
                    </div>
                  </div>
                </div>

                {/* Passenger Details */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Passenger Details</h3>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Seat
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Meal
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Baggage
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {bookingData.passengerData.map((passenger, index) => (
                          <tr key={index}>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-medium text-gray-900">
                                {passenger.title} {passenger.firstName} {passenger.lastName}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {passenger.type}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {passenger.seatNumber || "Not assigned"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {passenger.meal}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {passenger.baggage}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Baggage Information */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Baggage Information</h3>

                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="font-medium mb-1">Cabin Baggage</div>
                      <div className="text-sm text-gray-600">{bookingData.bookingDetails.baggage.cabin}</div>
                    </div>

                    <div className="flex-1 bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="font-medium mb-1">Check-in Baggage</div>
                      <div className="text-sm text-gray-600">{bookingData.bookingDetails.baggage.checkIn}</div>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Contact Information</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Mobile</div>
                      <div className="font-medium">{bookingData.bookingDetails.contact.phone}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Email</div>
                      <div className="font-medium">{bookingData.bookingDetails.contact.email}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Payment Summary */}
          <div className="w-full lg:w-1/3 px-3">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-6">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">Payment Summary</h2>
              </div>

              <div className="p-4">
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-gray-600">Payment Method</div>
                    <div className="font-medium">
                      {bookingData.paymentMethod === "creditCard" ? "Credit Card" :
                        bookingData.paymentMethod === "upi" ? "UPI" :
                          bookingData.paymentMethod === "netBanking" ? "Net Banking" :
                            bookingData.paymentMethod === "wallet" ? "Wallet" :
                              bookingData.paymentMethod === "paypal" ? "PayPal" : "Credit Card"}
                    </div>
                  </div>

                  {bookingData.paymentMethod === "creditCard" && bookingData.paymentDetails && (
                    <div className="text-sm text-gray-500 flex justify-end items-center">
                      {bookingData.paymentDetails.cardNumber}
                    </div>
                  )}

                  {bookingData.paymentMethod === "upi" && bookingData.paymentDetails && (
                    <div className="text-sm text-gray-500 flex justify-end items-center">
                      {bookingData.paymentDetails.upiId}
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-2">
                    <div className="text-gray-600">Status</div>
                    <div className="text-green-600 font-medium">Paid</div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center">
                    <div className="text-gray-600">Base Fare</div>
                    <div><Price amount={bookingData.calculatedFare.baseFare} /></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-gray-600">Taxes & Fees</div>
                    <div><Price amount={bookingData.calculatedFare.tax} /></div>
                  </div>

                  {bookingData.calculatedFare.addonsTotal > 0 && (
                    <div className="flex justify-between items-center">
                      <div className="text-gray-600">Add-ons</div>
                      <div><Price amount={bookingData.calculatedFare.addonsTotal} /></div>
                    </div>
                  )}

                  {bookingData.calculatedFare.vipServiceFee > 0 && (
                    <div className="flex justify-between items-center">
                      <div className="text-gray-600">VIP Service</div>
                      <div><Price amount={bookingData.calculatedFare.vipServiceFee} /></div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="flex justify-between items-center">
                    <div className="font-semibold text-gray-800">Total Amount</div>
                    <div className="font-bold text-xl"><Price amount={bookingData.calculatedFare.totalAmount} /></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Important Information */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">Important Information</h2>
              </div>

              <div className="p-4">
                <ul className="space-y-4">
                  <li className="flex">
                    <div className="text-blue-600 mr-2 mt-0.5 flex-shrink-0">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                    <div className="text-sm text-gray-600">
                      Please arrive at the airport at least 2 hours before departure for domestic flights and 3 hours for international flights.
                    </div>
                  </li>
                  <li className="flex">
                    <div className="text-blue-600 mr-2 mt-0.5 flex-shrink-0">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                    <div className="text-sm text-gray-600">
                      Carry a valid photo ID for verification at the airport.
                    </div>
                  </li>
                  <li className="flex">
                    <div className="text-blue-600 mr-2 mt-0.5 flex-shrink-0">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                    <div className="text-sm text-gray-600">
                      Web check-in opens 48 hours before departure and closes 3 hours before departure.
                    </div>
                  </li>
                  <li className="flex">
                    <div className="text-blue-600 mr-2 mt-0.5 flex-shrink-0">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                    <div className="text-sm text-gray-600">
                      For any changes or cancellations, please contact customer support at least 24 hours before departure.
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Hidden container for PDF Generation */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
        <FlightETicket ref={ticketRef} bookingData={bookingData} />
      </div>
    </div>
  );
} 