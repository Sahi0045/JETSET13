import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatIsoDuration } from '../../../utils/dateUtils';
import {
  ArrowLeft, Plane, User, CreditCard,
  AlertCircle, AlertTriangle, CheckCircle, Info, Phone, Mail, Edit3,
  Download, X
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import FlightETicket from './FlightETicket';
import { isPaid, ticketState } from '../../../utils/eTicket';
import { attentionMessage, bookingStatusBadge, cancellationMessage, refundStatus } from '../../../utils/bookingStatus';
import { refundOutcome } from '../../../../../shared/cancellationOutcome';
import ArcPayService from '../../../Services/ArcPayService';
import { useFlightBooking } from '../../../hooks/queries';
import { useQueryClient } from '@tanstack/react-query';

function ManageBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookingId } = useParams();

  const queryClient = useQueryClient();
  // Set once the server confirms a cancellation. `bookingData` is derived from
  // router state or the query - it is not owned here, and the old cancel
  // handler called a `setBookingData` that did not exist. That threw inside
  // its try, after the airline had released the seat and the refund had run,
  // so every successful cancellation was reported to the customer as
  // "Failed to cancel booking. Please contact support."
  const [cancelledLocally, setCancelledLocally] = useState(false);

  // If live data was passed from My Trips routing, use it; otherwise fetch via hook.
  const passedData = (location.state?.bookingData?.source !== 'localStorage') ? location.state?.bookingData : null;
  // A guest has no account to own the booking. They prove it is theirs with
  // the email it was made with - the reference alone is not enough. Without
  // this a guest's confirmation email linked to a page they could never open.
  const [lookupEmail, setLookupEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState(null);
  const { data: fetchedBooking, isLoading: queryLoading, error: queryError } = useFlightBooking(bookingId, {
    enabled: !passedData && !!bookingId,
    email: submittedEmail,
  });
  // What the cancel API said happened, once it has answered.
  const [cancelResult, setCancelResult] = useState(null);
  const bookingData = useMemo(() => {
    const base = passedData || fetchedBooking || null;
    // The page's copy takes the cancellation record the server just returned,
    // so the tracker reads the same outcome as the banner - not an older
    // record, or none.
    return base && cancelledLocally
      ? { ...base, status: 'CANCELLED', cancellation: cancelResult?.cancellation ?? base.cancellation }
      : base;
  }, [passedData, fetchedBooking, cancelledLocally, cancelResult]);
  const loading = !passedData && queryLoading;
  const error = !passedData && queryError ? queryError.message : (!bookingId && !passedData ? 'No booking ID provided' : null);

  const [activeTab, setActiveTab] = useState('details');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('Change of plans');

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
        // The email the guest proved the booking with, first. A signed-in owner
        // needs none: the server takes them from the session.
        submittedEmail || bookingData.email || bookingData.bookingDetails?.contact?.email || null,
        cancelReason
      );

      if (result.success) {
        // The server did it: the seat is released and the reversal, if any,
        // has run. The amounts come back on `cancellation` (the handler's
        // cancellationResult); this used to read `booking`, which carries
        // none of them, so the confirmation always showed $0.
        const outcome = result.cancellation || result.booking || {};
        setCancelledLocally(true);
        queryClient.invalidateQueries({ queryKey: ['flights', 'booking', bookingId] });
        setShowCancelModal(false);
        // The record as the server wrote it. The banner, the tracker and the
        // email all word it with cancellationMessage, so one outcome reads the
        // same everywhere.
        setCancelResult({ success: true, cancellation: outcome });
      } else {
        // The server refused. This branch used to mark the booking cancelled
        // anyway - in localStorage, no less - and tell the customer a refund
        // was coming: a cancellation that never happened, and a refund nobody
        // would ever process.
        console.warn('Cancellation refused by the server:', result.error);
        setShowCancelModal(false);
        setCancelResult({
          success: false,
          error: result.error || 'The booking could not be cancelled. Please contact support.'
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
    // A cancelled booking has no document to hand out.
    if (String(bookingData?.status || '').toUpperCase() === 'CANCELLED') return;
    if (!ticketRef.current) {
      alert("Ticket template not ready. Please wait and try again.");
      return;
    }
    const input = ticketRef.current;

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

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
      // The file is named for what it is. A "Ticket" file that is not a
      // ticket makes the same false claim the fake number did, on disk.
      const label = ticketState(bookingData) === 'issued' ? 'ETicket' : 'BookingConfirmation';
      pdf.save(`Jetsetters_${label}_${bookingData?.orderId || bookingData?.bookingReference || 'Booking'}.pdf`);
    } catch (err) {
      console.error("Error generating ticket:", err);
      alert("Failed to generate ticket. Please try again.");
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0890BC] mx-auto mb-4"></div>
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
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">We couldn't open this booking</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            {bookingId && (
              <form
                className="text-left bg-white border border-gray-200 rounded-lg p-4 mb-4"
                onSubmit={(e) => { e.preventDefault(); if (lookupEmail.trim()) setSubmittedEmail(lookupEmail.trim()); }}
              >
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="booking-lookup-email">
                  Booked without an account? Enter the email used when booking.
                </label>
                <div className="flex gap-2">
                  <input
                    id="booking-lookup-email"
                    type="email"
                    required
                    value={lookupEmail}
                    onChange={(e) => setLookupEmail(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="you@example.com"
                  />
                  <button type="submit" className="bg-[#0890BC] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#055B75] transition">
                    Find booking
                  </button>
                </div>
              </form>
            )}
            <button
              onClick={() => navigate('/my-trips')}
              className="bg-[#0890BC] text-white px-6 py-2 rounded-lg hover:bg-[#055B75] transition"
            >
              Back to My Trips
            </button>
          </div>
        </div>
      </div>
    );
  }

  const BANNER_TONES = {
    success: { box: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-800', icon: 'text-emerald-600' },
    danger: { box: 'bg-red-50 border border-red-200', text: 'text-red-800', icon: 'text-red-600' },
    warning: { box: 'bg-amber-50 border border-amber-200', text: 'text-amber-900', icon: 'text-amber-600' },
    neutral: { box: 'bg-[#F0FAFC] border border-[#B9D0DC]', text: 'text-[#034457]', icon: 'text-[#055B75]' },
  };

  const renderStatusBanner = () => {
    const currentStatus = bookingData?.status?.toUpperCase() || '';
    if (currentStatus !== 'CANCELLED' && currentStatus !== 'CANCEL_REQUESTED') {
      // From the whole record - tickets, the queue, a review flag, the payment -
      // not from `status` alone. A reservation with no ticket showed a green
      // "Confirmed", and a raw database status was printed as it was.
      // bookingStatusBadge never says "Confirmed" for a state nobody mapped.
      const badge = bookingStatusBadge(bookingData);
      const tone = BANNER_TONES[badge.tone] || BANNER_TONES.neutral;
      const attention = attentionMessage(bookingData);
      return (
        <div className={`p-4 rounded-lg mb-6 ${tone.box}`}>
          <div className="flex items-center">
            {badge.tone === 'success' ? (
              <CheckCircle className={`w-5 h-5 mr-2 ${tone.icon}`} />
            ) : (
              <Info className={`w-5 h-5 mr-2 ${tone.icon}`} />
            )}
            <span className={`font-medium ${tone.text}`}>
              Booking Status: {badge.label}
            </span>
          </div>
          {attention && <p className={`text-sm mt-2 ${tone.text}`}>{attention}</p>}
        </div>
      );
    }

    // Cancellation tracker.
    //
    // `bookingData.cancellation` is what the bookings list sends, and what the
    // cancel API just returned; the nested form is the older shape. What the
    // money did comes from refundStatus, which puts the cancellation record
    // ahead of payment_status: "Refunded" never appears over a reversal that
    // failed, and a cancellation with no record reads as a refund still owed
    // rather than "Processing Refund - In Progress" for ever.
    const cancelData = bookingData?.cancellation || bookingData?.bookingDetails?.cancellation || {};
    const refund = refundStatus({ ...bookingData, status: 'cancelled', cancellation: cancelData })
      || { key: 'none', label: 'No payment recorded', tone: 'neutral' };
    const refunded = refund.key === 'refunded';

    // [refund step, its state, status step, its state]
    const TRACK = {
      refunded: ['Processed', 'complete', refund.label, 'complete'],
      none_due: ['Reviewed', 'complete', 'No refund due', 'complete'],
      nothing_held: ['Reviewed', 'complete', 'Nothing to refund', 'complete'],
      none: ['No payment recorded', 'complete', 'Nothing to refund', 'complete'],
      failed: ['Not processed', 'error', 'Failed - being handled by our team', 'error'],
      review: ['Under review', 'current', 'Our team will email you', 'upcoming'],
      pending: ['Pending', 'current', 'Not refunded yet', 'upcoming'],
    }[refund.key];

    // Timeline Steps
    const steps = [
      {
        title: 'Cancellation Requested',
        description: cancelData.cancelledAt ? new Date(cancelData.cancelledAt).toLocaleDateString() : 'Received',
        status: 'complete',
      },
      { title: 'Refund', description: TRACK[0], status: TRACK[1] },
      { title: 'Refund Status', description: TRACK[2], status: TRACK[3] },
    ];

    // Said in words wherever the tracker alone does not settle it, in the same
    // sentence the result banner and the email use.
    const NOTICE_TITLES = {
      failed: 'Refund Not Yet Processed',
      review: 'Refund Under Review',
      none_due: 'No Refund Due',
      nothing_held: 'Nothing To Refund',
      pending: 'Refund Pending',
    };
    const noticeTitle = NOTICE_TITLES[refund.key];
    const noticeText = cancelData.paymentAction
      ? cancellationMessage({ cancellation: cancelData })
      : attentionMessage({ ...bookingData, status: 'cancelled', cancellation: cancelData });

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
                      step.status === 'current' ? 'bg-white border-[#0890BC] text-[#0890BC] shadow-lg shadow-[#0890BC]/30' :
                        step.status === 'error' ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/30' :
                          'bg-white border-slate-200 text-slate-300'
                      } transition-all duration-300 md:mb-4 relative z-20 bg-white`}>
                      {step.status === 'complete' ? <CheckCircle className="w-5 h-5" /> :
                        step.status === 'error' ? <AlertCircle className="w-5 h-5" /> :
                          step.status === 'current' ? <div className="w-3 h-3 rounded-full bg-[#0890BC] animate-pulse"></div> :
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-200"></div>}
                    </div>

                    {/* Desktop Connecting Line (Dynamic coloring) */}
                    {index !== steps.length - 1 && (
                      <div className={`absolute top-5 left-[50%] w-full h-1 -translate-y-1/2 hidden md:block ${step.status === 'complete' ? 'bg-emerald-500' : 'bg-transparent'
                        }`} style={{ width: '100%' }}></div>
                    )}

                    <div className="ml-5 md:ml-0 md:text-center mt-0.5 md:mt-0 relative z-20 bg-white/50 md:bg-transparent px-1 rounded">
                      <h4 className={`text-sm md:text-base font-bold ${step.status === 'complete' ? 'text-slate-800' :
                        step.status === 'current' ? 'text-[#034457]' :
                          step.status === 'error' ? 'text-rose-700' :
                            'text-slate-400'
                        }`}>{step.title}</h4>
                      <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Refund outcome notice, for every outcome that is not simply a
                refund made. */}
            {noticeTitle && noticeText && (
              <div className="mt-10 p-5 bg-amber-50/80 backdrop-blur-sm rounded-xl border border-amber-200/60 flex items-start gap-4 shadow-inner">
                <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-base font-bold text-amber-900">{noticeTitle}</h5>
                  <p className="text-sm text-amber-700/90 mt-1.5 leading-relaxed font-medium">{noticeText}</p>
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
                      ${Number(bookingData?.totalAmount || bookingData?.amount || bookingData?.total_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                    {/* Only a fee the cancellation actually kept. It used to be
                        labelled "Standard" beside every booking, including the
                        ones that pay no fee. */}
                    <span className="text-slate-600 font-medium">Cancellation Fee</span>
                    <span className="text-rose-600 font-semibold">
                      -${Number(cancelData.cancellationFee || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-lg font-bold text-slate-800">Refunded To Your Card</span>
                    <span className={`text-xl font-bold ${refunded ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {/* Only what was actually returned. This used to compute
                          the refund the customer WOULD have got when the refund
                          had failed, and print it in the total. */}
                      ${Number(cancelData.refundAmount || cancelData.netRefund || 0).toFixed(2)}
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
    <div className="min-h-screen bg-[#F1FBFD]">
      <Navbar />

      <div className="pt-[80px]">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center mb-6">
            <button
              onClick={() => navigate('/my-trips')}
              className="flex items-center text-[#055B75] hover:text-[#034457] mr-4"
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
            {/* A cancelled booking offers no document. Its tickets were voided
                or refunded with the airline, and a PDF of them is a travel
                document for a flight the customer no longer holds. */}
            {bookingData?.status?.toUpperCase() !== 'CANCELLED' && (
              <button
                onClick={downloadETicket}
                className="flex items-center bg-[#055B75] text-white px-4 py-2 rounded-lg hover:bg-[#034457] transition"
              >
                <Download className="w-4 h-4 mr-2" />
                {/* The document names itself honestly, so the button that offers
                    it must too - clicking "E-Ticket" and receiving a reservation
                    is the same misrepresentation in a different place. */}
                {ticketState(bookingData) === 'issued' ? 'Download E-Ticket' : 'Download Booking Confirmation'}
              </button>
            )}

            {bookingData?.status?.toUpperCase() !== 'CANCELLED' && 
             (!bookingData?.departureDate || new Date(bookingData.departureDate) >= new Date(new Date().setHours(0,0,0,0))) && (
              <>
                {/* Changes are made by the support team; there is no
                    self-serve change flow. This button used to open an alert
                    promising a modification feature that did not exist. */}
                <a
                  href="tel:+18775387380"
                  className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call to change this booking
                </a>
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
                  // `focus-visible`, not `focus`: clicking a tab with a mouse left
                  // the browser's default ring drawn around it until something
                  // else took focus. Keyboard users still get a visible ring —
                  // same treatment as the other tab strips (ServiceTabs,
                  // flight-search-form).
                  className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055B75]/40 ${activeTab === tab.id
                    ? 'border-[#0890BC] text-[#055B75]'
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
                      <p className="text-lg font-semibold font-mono text-[#055B75]">{bookingData?.pnr || 'Not Available'}</p>
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
                  <div className="mt-6 p-6 bg-gradient-to-r from-gray-50 to-[#F0FAFC] rounded-xl border border-gray-200">
                    <h4 className="font-semibold mb-4 text-gray-700">Flight Route</h4>
                    <div className="flex items-center justify-between">
                      {/* Departure */}
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-[#055B75] mb-1">
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
                          <Plane className="w-6 h-6 text-[#0890BC] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rotate-90" />
                        </div>
                        <div className="text-xs text-gray-500 mt-3">
                          {formatIsoDuration(bookingData?.duration || bookingData?.flight?.duration, 'Duration N/A')}
                        </div>
                        {(bookingData?.airline || bookingData?.flightNumber) && (
                          <div className="text-sm font-medium text-gray-700 mt-1">
                            {bookingData?.airlineName || bookingData?.airline || ''} {bookingData?.flightNumber || ''}
                          </div>
                        )}
                      </div>

                      {/* Arrival */}
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-[#055B75] mb-1">
                          {bookingData?.destination || bookingData?.flight?.arrivalCity?.substring(0, 3)?.toUpperCase() || 'ARR'}
                        </div>
                        <div className="text-sm text-gray-600 font-medium">
                          {bookingData?.destinationCity || bookingData?.flight?.arrivalCity || 'Arrival City'}
                        </div>
                        <div className="text-lg font-semibold text-gray-800 mt-2">
                          {bookingData?.arrivalTime || bookingData?.flight?.arrivalTime || '--:--'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {/* The arrival date. This printed the departure date,
                              wrong for every overnight flight. */}
                          {(bookingData?.arrivalDate || bookingData?.arrival_date)
                            ? new Date(bookingData.arrivalDate || bookingData.arrival_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Date N/A'}
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
                {/* Either shape: the record arrives as `travelers` from My Trips
                    and as `passengerData` when this page fetches it itself. */}
                {(bookingData?.travelers?.length ? bookingData.travelers : bookingData?.passengerData)?.length > 0 ? (
                  <div className="space-y-4">
                    {(bookingData?.travelers?.length ? bookingData.travelers : bookingData.passengerData).map((traveler, index) => (
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
                              {/* Masked: this page is opened on shared screens
                                  and captured into the downloadable document.
                                  The server already sends only the last three
                                  characters; this masks a record from anywhere
                                  else the same way. */}
                              <p className="font-mono">{`•••• ${String(traveler.passportNumber).slice(-3)}`}</p>
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
                      {/* From the payment record. This said "Paid" for every
                          booking, including unpaid and refunded ones. */}
                      {isPaid(bookingData) ? (
                        <p className="text-lg font-semibold text-green-600">Paid</p>
                      ) : (
                        <p className="text-lg font-semibold text-gray-700 capitalize">
                          {String(bookingData?.payment_status || bookingData?.paymentStatus || 'Not recorded').replace(/_/g, ' ')}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Transaction ID</label>
                      <p className="font-mono">{bookingData?.transactionId || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Booking Date</label>
                      <p>{(bookingData?.orderCreatedAt || bookingData?.bookingDate) && !Number.isNaN(new Date(bookingData?.orderCreatedAt || bookingData?.bookingDate).getTime())
                        ? new Date(bookingData?.orderCreatedAt || bookingData?.bookingDate).toLocaleDateString()
                        : 'N/A'}</p>
                    </div>
                  </div>

                  {isPaid(bookingData) && (
                    <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center">
                        <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                        <span className="font-medium text-green-800">Payment received</span>
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        Your payment has been received.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Contact Support */}
          <div className="mt-6 bg-[#F0FAFC] border border-[#B9D0DC] rounded-lg p-4">
            <h4 className="font-semibold text-[#034457] mb-2">Need Help?</h4>
            <p className="text-[#034457] text-sm mb-3">Our customer support team is here to assist you with any questions about your booking.</p>
            <div className="flex flex-wrap gap-4">
              <a href="tel:+18775387380" className="flex items-center text-[#055B75] hover:text-[#034457]">
                <Phone className="w-4 h-4 mr-1" />
                (877) 538-7380
              </a>
              <a href="mailto:support@jetsetterss.com" className="flex items-center text-[#055B75] hover:text-[#034457]">
                <Mail className="w-4 h-4 mr-1" />
                support@jetsetterss.com
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation result. Worded by cancellationMessage, like the tracker
          above and the email, so one outcome reads the same everywhere. It was
          a green success banner whatever the refund did, and its own branches
          promised a shorter wait than the email did. */}
      {cancelResult && (() => {
        if (!cancelResult.success) {
          return (
            <div className="mx-4 sm:mx-8 mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-800">Cancellation Error</h4>
                  <p className="text-red-700 text-sm mt-1">{cancelResult.error}</p>
                </div>
              </div>
            </div>
          );
        }
        const outcome = refundOutcome(cancelResult.cancellation || {});
        const tone = outcome === 'stuck' ? 'bg-red-50 border border-red-200 text-red-800'
          : ['review', 'unknown'].includes(outcome) ? 'bg-amber-50 border border-amber-200 text-amber-900'
            : 'bg-green-50 border border-green-200 text-green-800';
        return (
          <div className={`mx-4 sm:mx-8 mb-6 p-4 rounded-lg ${tone}`}>
            <div className="flex items-start gap-3">
              {outcome === 'stuck'
                ? <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                : <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />}
              <div>
                <h4 className="font-semibold">Booking Cancelled</h4>
                <p className="text-sm mt-1">{cancellationMessage({ cancellation: cancelResult.cancellation })}</p>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <p className="font-medium mb-2">What happens to your payment</p>
                  {/* Only what the cancellation will do. This promised a fee on
                      every booking and 5-7 days, while the result screen and
                      the email said 5-10 - and a booking never ticketed pays
                      no fee at all. */}
                  {['issued', 'pending'].includes(ticketState(bookingData)) ? (
                    <>
                      <p>• Your ticket has been issued, so a cancellation fee may apply.</p>
                      <p>• What is refunded depends on your fare's rules; some fares need our team to review the refund first.</p>
                    </>
                  ) : (
                    <p>• No ticket has been issued yet, so no cancellation fee applies and what you paid is returned.</p>
                  )}
                  <p>• You will see what happens to your payment as soon as the cancellation completes.</p>
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0890BC] focus:border-[#0890BC]"
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

      {/* The document a customer downloads. A second, inline template used to
          live here - 300 lines that printed "328" + the PNR + a counter as a
          per-passenger ticket number, a CSS barcode, and a green "your flight
          is booked" banner with no status check - so the honest FlightETicket
          component, imported above, was never the one on this page. It is now. */}
      <FlightETicket ref={ticketRef} bookingData={bookingData} />
    </div>
  );
}

export default ManageBooking;