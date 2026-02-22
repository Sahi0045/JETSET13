import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plane, Calendar, Clock, User, CreditCard,
  AlertCircle, AlertTriangle, CheckCircle, Info, Phone, Mail, Edit3,
  Download, X, Wifi, Utensils, Luggage, Flame, Zap, Ban, Skull, Battery, Scissors, Droplet, Briefcase
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Navbar from '../Navbar';
import Footer from '../Footer';
import FlightETicket from './FlightETicket';
import ArcPayService from '../../../Services/ArcPayService';

function ManageBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookingId } = useParams();

  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('Change of plans');
  const [cancelResult, setCancelResult] = useState(null);

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

  const confirmCancelBooking = async () => {
    if (!bookingData) return;

    setCancelling(true);
    try {
      const bookingRef = bookingData.orderId || bookingData.bookingReference || bookingData.bookingDetails?.bookingId;

      // Call the cancel-booking API
      const result = await ArcPayService.cancelBooking(
        bookingRef,
        bookingData.email || bookingData.bookingDetails?.contact?.email || null,
        cancelReason
      );

      if (result.success) {
        // Update local state
        const updatedBooking = { ...bookingData, status: 'CANCELLED' };
        localStorage.setItem('completedFlightBooking', JSON.stringify(updatedBooking));
        setBookingData(updatedBooking);
        setShowCancelModal(false);
        setCancelResult({
          success: true,
          refundAmount: result.booking?.refundAmount || result.booking?.netRefund || 0,
          cancellationFee: result.booking?.cancellationFee || 0,
          netRefund: result.booking?.netRefund || result.booking?.refundAmount || 0,
          paymentAction: result.booking?.paymentAction
        });
      } else {
        // API failed — still update locally as fallback
        console.warn('API cancellation failed, updating locally:', result.error);
        const updatedBooking = { ...bookingData, status: 'CANCELLED' };
        localStorage.setItem('completedFlightBooking', JSON.stringify(updatedBooking));
        setBookingData(updatedBooking);
        setShowCancelModal(false);
        setCancelResult({
          success: true,
          refundAmount: null,
          paymentAction: null,
          note: 'Booking marked as cancelled. Refund will be processed by our support team.'
        });
      }
    } catch (err) {
      console.error('Cancel booking error:', err);
      setCancelResult({
        success: false,
        error: 'Failed to cancel booking. Please contact support.'
      });
      setShowCancelModal(false);
    } finally {
      setCancelling(false);
    }
  };

  const ticketRef = React.useRef(null);

  const downloadETicket = async () => {
    if (!ticketRef.current) {
      alert("Ticket template not ready. Please wait and try again.");
      return;
    }
    const input = ticketRef.current;

    try {
      // Wait a bit for any images to fully load
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(input, {
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        imageTimeout: 0,
        removeContainer: true
      });

      // Use JPEG format to avoid PNG signature issues
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`JetSetters_Ticket_${bookingData?.orderId || bookingData?.bookingReference || 'Booking'}.pdf`);
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

  const renderStatusBanner = () => {
    if (bookingData?.status !== 'CANCELLED' && bookingData?.status !== 'CANCEL_REQUESTED') {
      return (
        <div className={`p-4 rounded-lg mb-6 ${bookingData?.status === 'CONFIRMED' ? 'bg-emerald-50 border border-emerald-200' :
          bookingData?.status === 'FAILED' ? 'bg-red-50 border border-red-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
          <div className="flex items-center">
            {bookingData?.status === 'CONFIRMED' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 mr-2" />
            ) : (
              <Info className="w-5 h-5 text-blue-600 mr-2" />
            )}
            <span className={`font-medium ${bookingData?.status === 'CONFIRMED' ? 'text-emerald-800' : 'text-blue-800'}`}>
              Booking Status: {bookingData?.status || 'Confirmed'}
            </span>
          </div>
        </div>
      );
    }

    // Cancellation Logic
    const cancelData = cancelResult || bookingData?.bookingDetails?.cancellation || {};
    const paymentAction = cancelData.paymentAction || bookingData?.paymentAction;
    const isRefundFailed = paymentAction === 'REFUND_FAILED';
    const isManual = paymentAction === 'MANUAL_PROCESS_REQUIRED';
    const isNoRefund = paymentAction === 'NO_REFUND_FEE_COVERS';
    const isRefunded = paymentAction === 'PARTIAL_REFUND' || paymentAction === 'REFUNDED' || bookingData?.payment_status === 'partially_refunded' || bookingData?.payment_status === 'refunded';

    // Default to pending if we have cancel data but it's not explicitly terminal
    const isPending = !isRefunded && !isRefundFailed && !isNoRefund && !isManual;

    // Timeline Steps
    const steps = [
      {
        title: 'Cancellation Requested',
        description: cancelData.cancelledAt ? new Date(cancelData.cancelledAt).toLocaleDateString() : 'Received',
        status: 'complete',
      },
      {
        title: 'Processing Refund',
        description: isRefunded ? 'Approved' : (isRefundFailed || isNoRefund || isManual) ? 'Reviewed' : 'In Progress',
        status: isRefunded || isRefundFailed || isNoRefund || isManual ? 'complete' : 'current',
      },
      {
        title: 'Refund Status',
        description: isRefunded ? `Successful ($${(cancelData.refundAmount || cancelData.netRefund || 0).toFixed(2)})` :
          isRefundFailed ? 'Failed (Sandbox)' :
            isNoRefund ? 'No Refund Due' :
              isManual ? 'Manual Review' : 'Pending',
        status: isRefunded ? 'complete' : (isRefundFailed || isNoRefund || isManual) ? 'error' : 'upcoming',
      }
    ];

    return (
      <div className="mb-8">
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200/60 bg-gradient-to-br from-white to-slate-50 relative overflow-hidden">
          {/* Glassmorphism background effect */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-rose-100/50 rounded-full blur-3xl opacity-50 mix-blend-multiply pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-slate-100/50 rounded-full blur-3xl opacity-50 mix-blend-multiply pointer-events-none"></div>

          <div className="relative z-10">
            <div className="flex items-start md:items-center justify-between mb-8 flex-col md:flex-row gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <X className="w-6 h-6 text-rose-500" />
                  Booking Cancelled
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Reason: {cancelData.reason || 'Requested by user'}
                </p>
              </div>
              <div className="text-left md:text-right">
                <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold bg-rose-100 text-rose-700 border border-rose-200 shadow-sm">
                  Status: Cancelled
                </span>
              </div>
            </div>

            {/* Custom Tracking Timeline */}
            <div className="relative pt-6 pb-2">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 rounded-full hidden md:block"></div>

              <div className="relative flex flex-col md:flex-row justify-between gap-8 md:gap-0">
                {steps.map((step, index) => (
                  <div key={index} className="flex flex-row md:flex-col items-start md:items-center relative z-10 md:w-1/3">
                    {/* Progress Connecting Line (Mobile) */}
                    {index !== steps.length - 1 && (
                      <div className="absolute left-[19px] top-[40px] bottom-[-30px] w-1 bg-slate-100 md:hidden rounded-full"></div>
                    )}

                    {/* Circle Icon */}
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 ${step.status === 'complete' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
                      step.status === 'current' ? 'bg-white border-blue-500 text-blue-500 shadow-lg shadow-blue-500/30' :
                        step.status === 'error' ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/30' :
                          'bg-white border-slate-200 text-slate-300'
                      } transition-all duration-300 md:mb-4 relative z-20 bg-white`}>
                      {step.status === 'complete' ? <CheckCircle className="w-5 h-5" /> :
                        step.status === 'error' ? <AlertCircle className="w-5 h-5" /> :
                          step.status === 'current' ? <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div> :
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-200"></div>}
                    </div>

                    {/* Desktop Connecting Line (Dynamic coloring) */}
                    {index !== steps.length - 1 && (
                      <div className={`absolute top-5 left-[50%] w-full h-1 -translate-y-1/2 hidden md:block ${step.status === 'complete' ? 'bg-emerald-500' : 'bg-transparent'
                        }`} style={{ width: '100%' }}></div>
                    )}

                    <div className="ml-5 md:ml-0 md:text-center mt-0.5 md:mt-0 relative z-20 bg-white/50 md:bg-transparent px-1 rounded">
                      <h4 className={`text-sm md:text-base font-bold ${step.status === 'complete' ? 'text-slate-800' :
                        step.status === 'current' ? 'text-blue-700' :
                          step.status === 'error' ? 'text-rose-700' :
                            'text-slate-400'
                        }`}>{step.title}</h4>
                      <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Error/Notice Message for Sandbox */}
            {(isRefundFailed || isNoRefund || isManual) && (
              <div className="mt-10 p-5 bg-amber-50/80 backdrop-blur-sm rounded-xl border border-amber-200/60 flex items-start gap-4 shadow-inner">
                <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-base font-bold text-amber-900">
                    {isRefundFailed ? 'Test Environment Notice' : isManual ? 'Manual Review Required' : 'No Refund Due'}
                  </h5>
                  <p className="text-sm text-amber-700/90 mt-1.5 leading-relaxed font-medium">
                    {isRefundFailed ? "Refunds for test cards in the Sandbox environment deliberately return a failed status because real funds were never captured. In a live production environment, this step would process completely." :
                      isManual ? "The automated refund could not be processed fully. Our support team has been notified and will manually review this transaction offline." :
                        "The cancellation fee for this booking exceeds or equals the original amount paid. Therefore, no refund relies are due to this account."}
                  </p>
                </div>
              </div>
            )}

            {/* Refund Financial Breakdown */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-slate-500" />
                Refund Breakdown
              </h3>
              <div className="bg-slate-50 rounded-xl p-5 md:p-6 border border-slate-200/60 max-w-2xl">
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                    <span className="text-slate-600 font-medium">Original Booking Amount</span>
                    <span className="font-semibold text-slate-800">
                      ${(bookingData?.totalAmount || bookingData?.amount || bookingData?.total_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                    <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                      Cancellation Fee
                      <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full font-bold">Standard</span>
                    </span>
                    <span className="text-rose-600 font-semibold">
                      -${(cancelData.cancellationFee || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-lg font-bold text-slate-800">Net Refund Total</span>
                    <span className={`text-xl font-bold ${isRefundFailed || isNoRefund ? 'text-slate-400' : 'text-emerald-600'}`}>
                      ${(cancelData.refundAmount || cancelData.netRefund || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

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

          {/* Status Banner / Cancellation Tracker */}
          {renderStatusBanner()}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={downloadETicket}
              className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Download className="w-4 h-4 mr-2" />
              Download E-Ticket
            </button>

            {bookingData?.status?.toUpperCase() !== 'CANCELLED' && (
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
                      <p className="text-lg font-semibold">{bookingData?.currency || 'USD'} {bookingData?.amount || 'N/A'}</p>
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
                    {(bookingData?.cabinClass || bookingData?.passengers || bookingData?.departureTerminal || bookingData?.arrivalTerminal || bookingData?.aircraft) && (
                      <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-gray-200 flex-wrap">
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
                        {bookingData?.departureTerminal && (
                          <div className="text-center">
                            <span className="text-xs text-gray-500 block">Dep. Terminal</span>
                            <span className="text-sm font-medium text-gray-700">T{bookingData.departureTerminal}</span>
                          </div>
                        )}
                        {bookingData?.arrivalTerminal && (
                          <div className="text-center">
                            <span className="text-xs text-gray-500 block">Arr. Terminal</span>
                            <span className="text-sm font-medium text-gray-700">T{bookingData.arrivalTerminal}</span>
                          </div>
                        )}
                        {bookingData?.aircraft && (
                          <div className="text-center">
                            <span className="text-xs text-gray-500 block">Aircraft</span>
                            <span className="text-sm font-medium text-gray-700">{bookingData.aircraft}</span>
                          </div>
                        )}
                        {bookingData?.brandedFareLabel && (
                          <div className="text-center">
                            <span className="text-xs text-gray-500 block">Fare</span>
                            <span className="text-sm font-medium text-gray-700">{bookingData.brandedFareLabel}</span>
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
                          {traveler.nationality && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Nationality</label>
                              <p>{traveler.nationality}</p>
                            </div>
                          )}
                          {traveler.passportNumber && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Passport Number</label>
                              <p className="font-mono">{traveler.passportNumber}</p>
                            </div>
                          )}
                          {traveler.passportExpiry && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Passport Expiry</label>
                              <p>{traveler.passportExpiry}</p>
                            </div>
                          )}
                          {traveler.mobile && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Mobile</label>
                              <p>{traveler.mobile}</p>
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
                      <p className="text-xl font-bold text-green-600">{bookingData?.currency || 'USD'} {bookingData?.amount || 'N/A'}</p>
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

      {/* Cancellation Result Banner */}
      {cancelResult && (
        <div className={`mx-4 sm:mx-8 mb-6 p-4 rounded-lg ${cancelResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {cancelResult.success ? (
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-green-800">Booking Cancelled Successfully</h4>
                {cancelResult.paymentAction === 'PARTIAL_REFUND' && cancelResult.refundAmount > 0 ? (
                  <p className="text-green-700 text-sm mt-1">
                    Net refund of <strong>${parseFloat(cancelResult.refundAmount).toFixed(2)}</strong> has been initiated (after ${parseFloat(cancelResult.cancellationFee || 0).toFixed(2)} cancellation fee).
                    It may take 5-7 business days to appear in your account.
                  </p>
                ) : (cancelResult.paymentAction === 'FEE_CHARGED' || cancelResult.paymentAction === 'FULL_FEE') ? (
                  <p className="text-yellow-700 text-sm mt-1">
                    A cancellation fee of <strong>${parseFloat(cancelResult.cancellationFee || 0).toFixed(2)}</strong> has been charged.
                    {cancelResult.paymentAction === 'FULL_FEE' ? ' No refund is due as the fee covers the full booking amount.' : ' No additional refund is due.'}
                  </p>
                ) : cancelResult.paymentAction === 'VOID_AND_FEE' ? (
                  <p className="text-green-700 text-sm mt-1">
                    Original payment has been voided and a cancellation fee of <strong>${parseFloat(cancelResult.cancellationFee || 0).toFixed(2)}</strong> has been charged.
                  </p>
                ) : cancelResult.refundAmount ? (
                  <p className="text-green-700 text-sm mt-1">
                    A {cancelResult.paymentAction === 'REFUND' ? 'full refund' : 'reversal'} of <strong>${parseFloat(cancelResult.refundAmount).toFixed(2)}</strong> has been initiated.
                    It may take 5-10 business days to appear in your account.
                  </p>
                ) : cancelResult.note ? (
                  <p className="text-green-700 text-sm mt-1">{cancelResult.note}</p>
                ) : (
                  <p className="text-green-700 text-sm mt-1">Your booking has been cancelled.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-red-800">Cancellation Error</h4>
                <p className="text-red-700 text-sm mt-1">{cancelResult.error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancel Booking Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Cancel Booking</h3>

            {/* Cancellation Fee Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                <div className="text-sm text-yellow-700">
                  <p className="font-medium mb-2">Cancellation Policy</p>
                  <p>• A cancellation fee will be deducted from your refund</p>
                  <p>• Estimated net refund will be calculated at processing time</p>
                  <p>• Processing time: 5-7 business days</p>
                </div>
              </div>
            </div>

            <p className="text-gray-600 mb-4">
              Are you sure you want to cancel this booking? This action cannot be undone.
            </p>

            {/* Cancel Reason */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason for cancellation</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option>Change of plans</option>
                <option>Found a better deal</option>
                <option>Schedule conflict</option>
                <option>Personal reasons</option>
                <option>Medical emergency</option>
                <option>Other</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
              >
                Keep Booking
              </button>
              <button
                onClick={confirmCancelBooking}
                disabled={cancelling}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelling ? (
                  <><span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Cancelling...</>
                ) : (
                  'Cancel Booking'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* Hidden E-Ticket Template for PDF Generation */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
        <div ref={ticketRef} className="w-[850px] bg-white text-gray-800 font-sans relative pb-8" style={{ width: '850px' }}>

          {/* 1. Header with Logo and Booking ID */}
          <div className="flex justify-between items-center p-6 border-b border-gray-200">
            <img src="/images/jetset.jpeg" alt="JetSetters" className="h-12 object-contain" crossOrigin="anonymous" />
            <div className="text-right">
              <div className="text-sm font-bold text-gray-700">Booking ID: {bookingData?.orderId || bookingData?.bookingDetails?.bookingId || 'PENDING'}</div>
              <div className="text-xs text-gray-500">Booked on {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
          </div>

          <div className="px-6 py-4">

            {/* 2. Top Barcode Information */}
            <div className="bg-blue-50 rounded-t-lg border border-blue-100 p-4 mb-0">
              <p className="text-sm text-blue-800">
                Barcode(s) for your journey <span className="font-bold">{bookingData?.originCity || bookingData?.bookingDetails?.flight?.departureCity || 'Origin'}-{bookingData?.destinationCity || bookingData?.bookingDetails?.flight?.arrivalCity || 'Dest'}</span> on <span className="font-bold">{bookingData?.airlineName || bookingData?.bookingDetails?.flight?.airline || 'JetSetters Air'}</span>
              </p>
            </div>

            <div className="border-x border-b border-blue-100 rounded-b-lg mb-6 p-4">
              {(bookingData?.travelers || bookingData?.passengerData)?.map((traveler, idx) => (
                <div key={idx} className="flex justify-between items-center mb-4 last:mb-0">
                  <div className="font-medium text-gray-700">{traveler.firstName} {traveler.lastName}</div>
                  {/* Fake Barcode Visual */}
                  <div className="h-12 w-48 bg-gray-100 flex items-center justify-center overflow-hidden relative">
                    <div className="absolute inset-0" style={{
                      backgroundImage: 'repeating-linear-gradient(90deg, #333 0px, #333 1px, transparent 1px, transparent 3px, #333 3px, #333 4px, transparent 4px, transparent 6px)'
                    }}></div>
                  </div>
                </div>
              )) || (
                  <div className="flex justify-between items-center">
                    <div className="font-medium text-gray-700">{bookingData?.username || 'Guest Traveler'}</div>
                    <div className="h-12 w-48 bg-gray-100 flex items-center justify-center overflow-hidden relative">
                      <div className="absolute inset-0" style={{
                        backgroundImage: 'repeating-linear-gradient(90deg, #333 0px, #333 1px, transparent 1px, transparent 3px, #333 3px, #333 4px, transparent 4px, transparent 6px)'
                      }}></div>
                    </div>
                  </div>
                )}
            </div>

            {/* 3. Green Status Banner */}
            <div className="bg-green-600 text-white rounded-lg p-5 mb-6 flex items-start shadow-sm">
              <div className="bg-white/20 p-2 rounded-full mr-4">
                <Plane className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-1">
                  Your {bookingData?.originCity || bookingData?.bookingDetails?.flight?.departureCity || 'Origin'} - {bookingData?.destinationCity || bookingData?.bookingDetails?.flight?.arrivalCity || 'Dest'} flight is booked for travel on {bookingData?.departureDate || bookingData?.bookingDetails?.flight?.departureDate ? new Date(bookingData?.departureDate || bookingData?.bookingDetails?.flight?.departureDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long' }) : ''}
                </h2>
                <p className="opacity-90 text-sm">Thank you for booking with us. We wish you a pleasant journey!</p>
              </div>
            </div>

            {/* 4. Action Buttons (Visual Only) */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-gradient-to-r from-orange-400 to-orange-500 text-white text-center py-3 rounded-lg font-bold shadow-sm uppercase text-sm tracking-wide">
                Web Check-in
              </div>
              <div className="flex-1 border-2 border-orange-400 text-orange-500 text-center py-3 rounded-lg font-bold uppercase text-sm tracking-wide bg-white">
                Manage Booking
              </div>
            </div>

            {/* 5. Trip Details Card */}
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-6 shadow-sm">
              <div className="bg-blue-600 px-4 py-3">
                <h3 className="text-white font-bold text-lg">Your trip details</h3>
              </div>

              <div className="p-5">
                <div className="mb-4">
                  <h4 className="text-xl font-bold text-gray-800">{bookingData?.originCity || bookingData?.bookingDetails?.flight?.departureCity} - {bookingData?.destinationCity || bookingData?.bookingDetails?.flight?.arrivalCity}</h4>
                  <p className="text-gray-500 text-sm">
                    {bookingData?.departureDate || bookingData?.bookingDetails?.flight?.departureDate ? new Date(bookingData?.departureDate || bookingData?.bookingDetails?.flight?.departureDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''} • {bookingData?.stops === 0 ? 'Nonstop' : `${bookingData?.stops} Stop(s)`} • {bookingData?.duration || bookingData?.bookingDetails?.flight?.duration || 'Duration N/A'}
                  </p>
                </div>

                <div className="border-t border-gray-100 py-4 flex flex-wrap md:flex-nowrap items-center">
                  <div className="flex items-center w-1/4">
                    <div className="mr-3">
                      <img src="/images/jetset.jpeg" alt="Airline" className="w-10 h-10 object-contain" crossOrigin="anonymous" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-gray-700">{bookingData?.airlineName || bookingData?.bookingDetails?.flight?.airline || 'JetSetters Air'}</div>
                      <div className="text-xs text-gray-500">{bookingData?.flightNumber || bookingData?.bookingDetails?.flight?.flightNumber || 'JS-001'}</div>
                    </div>
                  </div>

                  <div className="flex-1 flex justify-between items-center px-4">
                    <div className="text-left">
                      <div className="font-bold text-gray-700">{bookingData?.origin || bookingData?.bookingDetails?.flight?.departureAirport || 'ORIGIN'}</div>
                      <div className="text-xl font-bold text-gray-900">{bookingData?.departureTime || bookingData?.bookingDetails?.flight?.departureTime || '--:--'}</div>
                      <div className="text-xs text-gray-500 mt-1">{bookingData?.departureDate || bookingData?.bookingDetails?.flight?.departureDate ? new Date(bookingData?.departureDate || bookingData?.bookingDetails?.flight?.departureDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}</div>
                      <div className="text-xs text-gray-500 mt-1">{(() => {
                        const t = bookingData?.departureTerminal || bookingData?.bookingDetails?.departure_terminal;
                        return t ? `Terminal ${t}` : '';
                      })()}</div>
                    </div>

                    <div className="flex flex-col items-center px-4">
                      <Clock className="w-4 h-4 text-gray-400 mb-1" />
                      <div className="text-xs text-gray-500">{bookingData?.duration || bookingData?.bookingDetails?.flight?.duration || '--'}</div>
                      <div className="w-24 h-[1px] bg-gray-300 my-1 relative">
                        <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-1 h-1 bg-gray-400 rounded-full"></div>
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-1 bg-gray-400 rounded-full"></div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-gray-700">{bookingData?.destination || bookingData?.bookingDetails?.flight?.arrivalAirport || 'DEST'}</div>
                      <div className="text-xl font-bold text-gray-900">{bookingData?.arrivalTime || bookingData?.bookingDetails?.flight?.arrivalTime || '--:--'}</div>
                      <div className="text-xs text-gray-500 mt-1">{bookingData?.arrivalDate || bookingData?.bookingDetails?.flight?.arrivalDate ? new Date(bookingData?.arrivalDate || bookingData?.bookingDetails?.flight?.arrivalDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}</div>
                      <div className="text-xs text-gray-500 mt-1">{(() => {
                        const t = bookingData?.arrivalTerminal || bookingData?.bookingDetails?.arrival_terminal;
                        return t ? `Terminal ${t}` : '';
                      })()}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded p-3 mt-4 flex justify-between items-center text-sm border border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded text-xs uppercase">PNR</span>
                    <span className="font-mono font-bold text-gray-800">{bookingData?.pnr || bookingData?.bookingDetails?.pnr || 'CONFIRMED'}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                      <Luggage className="w-4 h-4 text-green-600" />
                      <span className="text-gray-600 text-xs">Check-in: <span className="font-bold text-gray-800">{(() => {
                        const bd = bookingData?.baggageDetails?.checked || bookingData?.bookingDetails?.baggageDetails?.checked;
                        if (bd?.weight) return `${bd.weight} ${bd.weightUnit || 'Kgs'}`;
                        if (bd?.quantity) return `${bd.quantity} Piece(s)`;
                        const b = bookingData?.baggage || bookingData?.bookingDetails?.baggage;
                        if (b && typeof b === 'string') return b;
                        return 'Included';
                      })()}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-green-600" />
                      <span className="text-gray-600 text-xs">Cabin: <span className="font-bold text-gray-800">{(() => {
                        const cb = bookingData?.baggageDetails?.cabin || bookingData?.bookingDetails?.baggageDetails?.cabin;
                        if (cb?.weight) return `${cb.weight} ${cb.weightUnit || 'Kgs'}`;
                        if (cb?.quantity) return `${cb.quantity} Piece(s)`;
                        return 'Included';
                      })()}</span></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold uppercase">{bookingData?.cabinClass || bookingData?.bookingDetails?.flight?.cabin || 'Economy'}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2 font-medium">Traveller</th>
                        <th className="px-4 py-2 font-medium">Seat</th>
                        <th className="px-4 py-2 font-medium">Meal</th>
                        <th className="px-4 py-2 font-medium text-right">E-Ticket No</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(bookingData?.travelers || bookingData?.passengerData)?.map((t, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium text-gray-800">{t.firstName} {t.lastName}</td>
                          <td className="px-4 py-2 text-gray-600">--</td>
                          <td className="px-4 py-2 text-gray-600">Standard</td>
                          <td className="px-4 py-2 text-gray-600 text-right font-mono">328{bookingData?.pnr || 'TKT'}{i + 45}</td>
                        </tr>
                      )) || (
                          <tr>
                            <td className="px-4 py-2 font-medium text-gray-800">{bookingData?.username || 'Guest'}</td>
                            <td className="px-4 py-2 text-gray-600">--</td>
                            <td className="px-4 py-2 text-gray-600">Standard</td>
                            <td className="px-4 py-2 text-gray-600 text-right font-mono">328{bookingData?.pnr || 'TKT'}01</td>
                          </tr>
                        )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>

            {/* 6. Dangerous Goods Warning */}
            <div className="border border-red-200 rounded-lg overflow-hidden mb-6">
              <div className="bg-red-600 text-white px-4 py-2 font-bold flex justify-between items-center">
                <span>Items not allowed in the aircraft</span>
                <span className="text-xs bg-yellow-400 text-red-900 px-2 py-0.5 rounded font-bold">SAFETY FIRST</span>
              </div>
              <div className="p-4 bg-red-50">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center mb-1 bg-white">
                      <Flame className="w-5 h-5 text-red-500" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-gray-700">Lighters</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center mb-1 bg-white">
                      <Droplet className="w-5 h-5 text-red-500" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-gray-700">Liquids</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center mb-1 bg-white">
                      <Skull className="w-5 h-5 text-red-500" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-gray-700">Toxic</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center mb-1 bg-white">
                      <Scissors className="w-5 h-5 text-red-500" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-gray-700">Sharp Objects</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. Guidelines */}
            <div className="bg-blue-50 rounded-lg p-5 mb-6 border border-blue-100">
              <h4 className="font-bold text-gray-800 mb-3 flex items-center">
                <Info className="w-4 h-4 mr-2 text-blue-600" />
                For convenient travel, follow these guidelines
              </h4>
              <ul className="text-xs text-gray-600 space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="w-3 h-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span><span className="font-bold text-gray-700">Web Check-in:</span> Web Check-in is now a mandatory step for your air travel. Please check in online to avoid queues.</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-3 h-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span><span className="font-bold text-gray-700">ID Proof:</span> Please carry a valid photo identification proof (Driver Licence, Aadhar Card, Pan Card or any other Government recognised photo identification).</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-3 h-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span><span className="font-bold text-gray-700">Check-in Time:</span> We advise you to reach the airport at least 2 hours before scheduled departure. Check-in counters close 45 minutes prior to departure.</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-3 h-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span><span className="font-bold text-gray-700">Baggage:</span> Check-in baggage allowance is as per your fare class. Hand baggage limits apply as per airline policy.</span>
                </li>
              </ul>
            </div>

            {/* 8. Payment Information */}
            <div className="border border-gray-200 rounded-lg p-5 mb-6">
              <h4 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide">Payment Information</h4>
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-gray-600">Total Base Fare</span>
                <span className="font-medium">{bookingData?.currency || 'USD'} {(() => {
                  const base = parseFloat(bookingData?.priceBase || bookingData?.calculatedFare?.baseFare || bookingData?.fareBreakdown?.baseFare || 0);
                  if (base > 0) return base.toFixed(2);
                  const total = parseFloat(bookingData?.amount || bookingData?.calculatedFare?.totalAmount || 0);
                  const taxes = parseFloat(bookingData?.fareBreakdown?.totalTax || 0);
                  if (taxes > 0 && total > taxes) return (total - taxes).toFixed(2);
                  return total.toFixed(2);
                })()}</span>
              </div>
              <div className="flex justify-between items-center text-sm mb-3">
                <span className="text-gray-600">Taxes & Fees</span>
                <span className="font-medium">{bookingData?.currency || 'USD'} {(() => {
                  const total = parseFloat(bookingData?.amount || bookingData?.calculatedFare?.totalAmount || 0);
                  const base = parseFloat(bookingData?.priceBase || bookingData?.calculatedFare?.baseFare || bookingData?.fareBreakdown?.baseFare || 0);
                  const taxes = parseFloat(bookingData?.fareBreakdown?.totalTax || 0);
                  if (taxes > 0) return taxes.toFixed(2);
                  if (base > 0 && total > base) return (total - base).toFixed(2);
                  return '0.00';
                })()}</span>
              </div>
              <div className="border-t border-dashed border-gray-200 pt-3 flex justify-between items-center">
                <span className="font-bold text-gray-800">Total Paid</span>
                <span className="font-bold text-xl text-green-600">{bookingData?.currency || 'USD'} {parseFloat(bookingData?.amount || bookingData?.calculatedFare?.totalAmount || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-end border-t border-gray-200 pt-6">
              <div className="text-xs text-gray-500">
                <p className="font-bold text-gray-700 mb-1">JetSetters Support</p>
                <p>Tel: +1 (555) 123-4567</p>
                <p>Email: help@jetsetters.com</p>
              </div>
              <div className="text-right">
                <img src="/images/jetset.jpeg" alt="JetSetters" className="h-8 object-contain opacity-50 ml-auto" crossOrigin="anonymous" />
                <p className="text-[10px] text-gray-400 mt-1">© 2026 JetSetters Inc.</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default ManageBooking;