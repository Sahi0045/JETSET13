import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { getApiUrl } from '../../utils/apiHelper';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { isUsableEmail } from '../../../../shared/email';

const SUPPORT_PHONE = '(877) 538-7380';
// How often a payment-link payer's payment is asked about while the payment
// gateway cannot be reached (complete-payment-link answers 402 `retryable`).
const LINK_CONFIRM_ATTEMPTS = 3;
const LINK_CONFIRM_RETRY_MS = 3000;

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Checking your payment...');
  const [error, setError] = useState(null);
  // An error this page stays on: the payer has something to read and do, and
  // nothing to be redirected to.
  const [isStaying, setIsStaying] = useState(false);
  const [retryHref, setRetryHref] = useState(null);
  const { user } = useSupabaseAuth();

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Get the full URL for debugging
        console.log('🔍 PaymentCallback - Full URL:', window.location.href);
        console.log('🔍 PaymentCallback - Search params:', window.location.search);

        // ARC Pay may send parameters with different names
        const resultIndicator = searchParams.get('resultIndicator') ||
          searchParams.get('result');
        const sessionId = searchParams.get('sessionId') ||
          searchParams.get('session.id') ||
          searchParams.get('session_id');
        const quoteId = searchParams.get('quote_id');
        const inquiryId = searchParams.get('inquiry_id');
        const orderId = searchParams.get('orderId');
        const bookingType = searchParams.get('bookingType');
        const statusParam = searchParams.get('status');
        const paymentLinkToken = searchParams.get('paymentLinkToken');

        console.log('📋 Payment callback received:', {
          resultIndicator: resultIndicator || '(not provided)',
          sessionId: sessionId || '(not provided)',
          quoteId: quoteId || '(not provided)',
          inquiryId: inquiryId || '(not provided)',
          orderId: orderId || '(not provided)',
          bookingType: bookingType || '(not provided)',
          paymentLinkToken: paymentLinkToken || '(not provided)',
          status: statusParam || '(not provided)',
          allParams: Object.fromEntries(searchParams.entries())
        });

        // Handle payment link callback — update status and show receipt
        if (paymentLinkToken && orderId) {
          console.log('🔗 Processing payment link callback for:', paymentLinkToken);
          setStatus('Verifying payment link payment...');

          /**
           * Only a confirmed payment is called confirmed.
           *
           * complete-payment-link answers 403 when the payment cannot be
           * verified and 402 when the gateway holds no capture for it. This
           * read the body, never looked at `success`, announced "Payment
           * confirmed!" and opened the receipt - which prints "Payment
           * Successful!" and PAID for whatever payment it is given. A request
           * that never answered said "Your payment went through" and did the
           * same. The payer then travelled on a payment nobody had seen.
           */
          const askToComplete = async () => {
            const response = await fetch(getApiUrl(`payments?action=complete-payment-link`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentLinkToken,
                orderId,
                resultIndicator: resultIndicator || ''
              })
            });
            const body = await response.json().catch(() => ({}));
            return { ok: response.ok, status: response.status, body: body || {} };
          };

          let outcome = null;
          try {
            for (let attempt = 1; attempt <= LINK_CONFIRM_ATTEMPTS; attempt += 1) {
              outcome = await askToComplete();
              console.log('🔗 Payment link update result:', outcome.status, outcome.body?.success ?? null);
              const gatewayUnreachable = outcome.status === 402 && outcome.body?.retryable;
              if (!gatewayUnreachable || attempt === LINK_CONFIRM_ATTEMPTS) break;
              setStatus('Still confirming your payment with the payment gateway...');
              await new Promise((resolve) => setTimeout(resolve, LINK_CONFIRM_RETRY_MS));
            }
          } catch (plError) {
            console.error('⚠️ Payment link update failed:', plError);
            outcome = null;
          }

          if (outcome?.ok && outcome.body?.success) {
            const paymentId = outcome.body.paymentId || orderId;
            setStatus('Payment confirmed! Generating your receipt...');
            setTimeout(() => {
              navigate(`/payment/success?paymentId=${paymentId}`);
            }, 1500);
            return;
          }

          setIsStaying(true);
          if (outcome?.status === 403) {
            setError(`We could not verify this payment. If your card was charged, please call ${SUPPORT_PHONE} and do not pay again.`);
          } else if (outcome?.status === 402 && !outcome.body?.retryable) {
            setError(`The payment gateway shows no completed payment for this link. If your card was charged, please call ${SUPPORT_PHONE}; otherwise you can try again from your payment link.`);
            setRetryHref(`/pay/${encodeURIComponent(paymentLinkToken)}`);
          } else {
            setError(`We could not confirm your payment yet. Please do not pay again - call ${SUPPORT_PHONE} and we will confirm it for you.`);
          }
          return;
        }

        // Check if this is a direct booking (flight, hotel, cruise, package)
        if (bookingType && orderId) {
          console.log(`🎫 Processing ${bookingType} booking callback for order:`, orderId);
          setStatus(`Checking your ${bookingType} payment...`);

          // Retrieve booking data: DB first, localStorage fallback
          let bookingData = {};
          let sessionData = {};
          // The address checkout was given, kept beside (not inside) the
          // booking the server stored.
          let checkoutEmail = null;
          const pendingBookingKey = `pending${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)}Booking`;

          // 1. Try retrieving from database (survives browser clears/device changes)
          try {
            console.log('🗄️ Fetching pending booking from DB for orderId:', orderId);
            // Pass the ARC resultIndicator: get-pending-booking now requires it
            // as proof this browser completed the payment (it returns 403 otherwise).
            const dbResponse = await fetch(`/api/payments?action=get-pending-booking&orderId=${encodeURIComponent(orderId)}&resultIndicator=${encodeURIComponent(resultIndicator || '')}`);
            if (dbResponse.ok) {
              const dbResult = await dbResponse.json();
              if (dbResult.success && dbResult.pendingBookingData) {
                // The DB stores req.body which has bookingData nested inside it
                bookingData = dbResult.pendingBookingData.bookingData || dbResult.pendingBookingData;
                checkoutEmail = dbResult.pendingBookingData.customerEmail || null;
                sessionData = {
                  sessionId: dbResult.booking?.booking_details?.session_id,
                  orderId: orderId,
                  bookingType: bookingType,
                  amount: dbResult.booking?.total_amount
                };
                console.log('✅ Booking data retrieved from DB');
              }
            }
          } catch (dbError) {
            console.warn('⚠️ DB fetch failed, falling back to localStorage:', dbError.message);
          }

          // 2. Fallback to localStorage if DB didn't have data
          if (!bookingData?.selectedFlight && !bookingData?.flightData && !bookingData?.amount) {
            console.log('📦 Falling back to localStorage...');
            // A flight's draft is in this tab's storage (the review page).
            const storedBookingData = (bookingType === 'flight' ? sessionStorage.getItem(pendingBookingKey) : null)
              || localStorage.getItem(pendingBookingKey);
            const pendingSession = localStorage.getItem('pendingPaymentSession');

            try {
              const stored = storedBookingData ? JSON.parse(storedBookingData) : null;
              // Only the draft saved for this payment.
              if (stored && !(stored.orderId && orderId && stored.orderId !== orderId)) {
                bookingData = stored;
                console.log('📦 Booking data retrieved from browser storage');
              }
              if (pendingSession) {
                sessionData = JSON.parse(pendingSession);
              }
            } catch (parseError) {
              console.warn('Could not parse stored booking data:', parseError);
            }
          }

          console.log('📋 Final booking data source:', bookingData?.selectedFlight ? 'has flight data' : 'no flight data');

          // Durably record the payment server-side BEFORE handing off to the (browser-driven)
          // order-creation step. If that step never completes (tab closed / order-create error),
          // the booking is still marked paid from the gateway and is recoverable. Best-effort:
          // never block the redirect on this.
          // What the gateway said about the payment: true, false, or null when
          // the check did not answer. Only `true` lets this page say "received".
          let paymentConfirmed = null;
          if (orderId) {
            try {
              const reconcileRes = await fetch(getApiUrl('payments?action=reconcile-booking-payment'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId })
              });
              const reconcileData = await reconcileRes.json().catch(() => null);
              console.log('🧾 Booking payment reconciled:', reconcileData);
              if (typeof reconcileData?.paid === 'boolean') paymentConfirmed = reconcileData.paid;
            } catch (reconcileErr) {
              console.warn('⚠️ Booking payment reconcile failed (non-blocking):', reconcileErr?.message);
            }
          }

          // For flights, navigate to FlightCreateOrders to complete the booking
          if (bookingType === 'flight') {
            console.log('✈️ Navigating to flight order creation...');
            console.log('📦 Booking data retrieved');
            console.log('🔍 Data breakdown:', {
              hasSelectedFlight: !!bookingData?.selectedFlight,
              hasOriginalOffer: !!bookingData?.originalOffer,
              hasPassengerData: !!bookingData?.passengerData,
              hasBookingDetails: !!bookingData?.bookingDetails,
              hasFlightData: !!bookingData?.flightData,
              hasCalculatedFare: !!bookingData?.calculatedFare,
              amount: bookingData?.amount
            });

            // Only what was checked. This said "Payment verified!" before
            // anything had been; the order page has the server ask the gateway,
            // and says what it answered.
            setStatus(paymentConfirmed
              ? 'Payment received. Creating your flight booking...'
              : 'Confirming your payment and creating your booking...');

            // ⚠️ DO NOT clean up localStorage here - keep it until order is created successfully
            // The FlightCreateOrders component will clean it up after successful order creation
            // localStorage.removeItem(pendingBookingKey);
            // localStorage.removeItem('pendingPaymentSession');

            // Navigate to FlightCreateOrders with the stored data
            setTimeout(() => {
              const navigationState = {
                // Payment data from ARC Pay callback
                // Null, not TXN-<timestamp>: this is printed on the customer's
                // confirmation page as their transaction id.
                transactionId: resultIndicator || sessionData?.sessionId || null,
                orderId: orderId,
                amount: bookingData?.amount || sessionData?.amount || 0,
                // Flight and passenger data from localStorage
                selectedFlight: bookingData?.selectedFlight || bookingData?.flightData,
                flightData: bookingData?.flightData || bookingData?.selectedFlight,
                originalOffer: bookingData?.originalOffer,
                passengerData: bookingData?.passengerData,
                bookingDetails: bookingData?.bookingDetails,
                calculatedFare: bookingData?.calculatedFare,

                // The first address that can be delivered to, in the order
                // orderDataFromCheckoutRow takes them: checkout's, then the lead
                // traveller's. The lead's was taken whatever it held, and a
                // typed "jane@gmailcom" hid checkout's good one.
                customerEmail: [checkoutEmail, bookingData?.passengerData?.[0]?.email].find(isUsableEmail) || ''
              };

              console.log('🚀 Navigating with state:', navigationState);
              navigate('/flight-create-orders', { state: navigationState });
            }, 1500);
            return;
          }

          // For other booking types (hotel, cruise, package)
          // Navigate to appropriate confirmation pages
          const confirmationRoutes = {
            hotel: '/hotel-booking-success',
            cruise: '/cruise-booking-success',
            package: '/package-booking-success'
          };

          const confirmationRoute = confirmationRoutes[bookingType] || '/booking-success';

          // Save cruise booking to database
          if (bookingType === 'cruise') {
            try {
              setStatus('Saving cruise booking...');
              console.log('🚢 Saving cruise booking to database...');

              const userId = user?.id || null;

              const saveResponse = await fetch(getApiUrl('cruises/bookings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId,
                  cruiseName: bookingData.cruiseName || '',
                  cruiseImage: bookingData.cruiseImage || '',
                  duration: bookingData.duration || '',
                  departure: bookingData.departure || '',
                  arrival: bookingData.arrival || '',
                  departureDate: bookingData.departureDate || '',
                  returnDate: bookingData.returnDate || '',
                  basePrice: bookingData.basePrice || 0,
                  taxesAndFees: bookingData.taxesAndFees || 0,
                  portCharges: bookingData.portCharges || 0,
                  totalAmount: bookingData.totalAmount || sessionData?.amount || 0,
                  passengerDetails: bookingData.passengerDetails || {},
                  transactionId: resultIndicator || '',
                  sessionId: sessionId || sessionData?.sessionId || '',
                  userId: userId
                })
              });

              const saveResult = await saveResponse.json();
              console.log('🚢 Database save result:', saveResult);
            } catch (saveError) {
              console.error('⚠️ Failed to save cruise booking to database:', saveError);
              // Continue even if DB save fails - we still redirect to success
            }
          }

          // Save hotel booking to database
          if (bookingType === 'hotel') {
            try {
              setStatus('Saving hotel booking...');
              console.log('🏨 Saving hotel booking to database...');

              const userId = user?.id || null;

              const saveResponse = await fetch(getApiUrl('hotels/bookings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId,
                  hotelId: bookingData.hotelId || '',
                  hotelName: bookingData.hotel?.name || bookingData.hotelName || '',
                  hotelImage: bookingData.hotel?.image || bookingData.hotelImage || '',
                  location: bookingData.hotel?.location || bookingData.location || '',
                  roomType: bookingData.roomType || '',
                  checkInDate: bookingData.checkInDate || '',
                  checkOutDate: bookingData.checkOutDate || '',
                  nights: bookingData.nights || 0,
                  guests: bookingData.guests || 0,
                  pricePerNight: bookingData.pricePerNight || 0,
                  subtotal: bookingData.subtotal || 0,
                  taxes: bookingData.taxes || 0,
                  serviceFee: bookingData.serviceFee || 0,
                  fixedFees: bookingData.fixedFees || 0,
                  totalAmount: bookingData.totalPrice || bookingData.totalAmount || sessionData?.amount || 0,
                  guestInfo: bookingData.guestInfo || {},
                  transactionId: resultIndicator || '',
                  resultIndicator: resultIndicator || '',
                  sessionId: sessionId || sessionData?.sessionId || '',
                  userId: userId
                })
              });

              const saveResult = await saveResponse.json();
              console.log('🏨 Database save result:', saveResult);
            } catch (saveError) {
              console.error('⚠️ Failed to save hotel booking to database:', saveError);
              // Continue even if DB save fails - we still redirect to success
            }
          }

          setTimeout(() => {
            // Also save to localStorage as fallback
            const completedBooking = {
              ...bookingData,
              orderId,
              bookingReference: orderId,
              type: bookingType,
              status: 'CONFIRMED',
              paymentVerified: true,
              transactionId: resultIndicator || sessionData?.sessionId || '',
              orderCreatedAt: new Date().toISOString()
            };

            if (bookingType === 'cruise') {
              localStorage.setItem('completedBooking', JSON.stringify(completedBooking));
            } else if (bookingType === 'hotel') {
              localStorage.setItem('completedHotelBooking', JSON.stringify(completedBooking));
            } else if (bookingType === 'package') {
              localStorage.setItem('completedPackageBooking', JSON.stringify(completedBooking));
            }

            // Clean up pending data
            localStorage.removeItem(pendingBookingKey);
            try { sessionStorage.removeItem(pendingBookingKey); } catch { /* storage blocked */ }
            localStorage.removeItem('pendingPaymentSession');
            navigate(confirmationRoute, {
              state: {
                orderId,
                bookingData: completedBooking,
                paymentVerified: true
              }
            });
          }, 1500);
          return;
        }

        // Original inquiry/quote flow
        setStatus('Verifying payment with gateway...');

        // Build backend URL with available parameters
        const params = new URLSearchParams();
        if (resultIndicator) params.append('resultIndicator', resultIndicator);
        if (sessionId) params.append('sessionId', sessionId);
        if (quoteId) params.append('quote_id', quoteId);
        if (inquiryId) params.append('inquiry_id', inquiryId);

        // If we have at least resultIndicator or sessionId or quoteId, proceed
        if (!resultIndicator && !sessionId && !quoteId) {
          console.error('❌ Missing required payment parameters:', { resultIndicator, sessionId, quoteId });
          setError('Missing payment verification parameters. The payment may not have completed properly.');

          // Wait a moment then redirect
          setTimeout(() => {
            const redirectUrl = inquiryId
              ? `/inquiry/${inquiryId}?payment=failed&error=missing_params`
              : '/payment/failed?error=missing_params';
            navigate(redirectUrl);
          }, 3000);
          return;
        }

        // Backend will verify and redirect
        setStatus('Confirming payment status...');
        console.log('🔄 Redirecting to backend for payment verification...');
        const backendUrl = `/api/payments?action=payment-callback&${params.toString()}`;
        console.log('🔗 Backend URL:', backendUrl);
        window.location.href = backendUrl;
      } catch (error) {
        console.error('❌ Payment callback error:', error);
        setError(`Error processing payment: ${error.message || 'Unknown error'}`);

        setTimeout(() => {
          const inquiryId = searchParams.get('inquiry_id');
          const redirectUrl = inquiryId
            ? `/inquiry/${inquiryId}?payment=failed&error=processing_error`
            : '/payment/failed?error=processing_error';
          navigate(redirectUrl);
        }, 3000);
      }
    };

    verifyPayment();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-md">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">Payment Verification Issue</h1>
            <p className="text-red-600 mb-4">{error}</p>
            {isStaying ? (
              retryHref && (
                <Link to={retryHref} className="text-blue-600 underline">Back to your payment link</Link>
              )
            ) : (
              <p className="text-sm text-gray-500">Redirecting you shortly...</p>
            )}
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">Checking Your Payment</h1>
            <p className="text-gray-600">{status}</p>
            <p className="text-sm text-gray-500 mt-4">Please wait while we confirm your payment with ARC Pay Gateway.</p>
          </>
        )}
      </div>
    </div>
  );
}

