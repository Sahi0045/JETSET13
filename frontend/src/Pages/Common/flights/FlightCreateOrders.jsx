import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Lock, CheckCircle, Loader, AlertCircle, Check, Clock
} from 'lucide-react';
import axios from 'axios';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import { endpoints } from '@/config/api';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { buildFlightOrderBody } from '../../../../../shared/flightOrderBody';
import { isUsableEmail } from '../../../../../shared/email';
import { clockTime, itinerariesFromOffer, returnDateOf } from '../../../../../shared/bookingItineraries';
import { airportClockLabel } from './searchResults';
import { clearStoredBookings } from '../../../utils/bookingStorage';
import { clearTravellerDraft } from '../../../utils/flightTravellerDraft';

/**
 * Failures where the reference the user is holding can never be completed: the
 * charge was refunded, refused, or the offer is no longer sellable. The only
 * way forward is a new search, so the failure screen must not offer to return
 * to a payment that cannot be used.
 */
const TERMINAL_ERROR_CODES = new Set([
  'BOOKING_CANCELLED',    // row already cancelled and refunded
  'BOOKING_DISABLED',     // booking switched off; the charge was reversed
  'OFFER_NOT_BOOKABLE',   // offer expired or failed the shape gate
  'OFFER_MISSING',        // this session lost the offer; nothing to resend
  'OFFER_NOT_VERIFIED',   // checkout kept no verified fare for the payment; reversed
  'NOT_A_FLIGHT_BOOKING', // the reference belongs to some other kind of booking
  'PRICE_CHANGED',        // the airline raised the fare after payment; reversed
  'PASSENGERS_INCOMPLETE', // this session lost passenger details; same
  'PASSENGER_COUNT_MISMATCH', // more travellers than the fare was priced for
  'PAYER_NOT_VERIFIED',   // this browser cannot prove it made the payment
  'ORDER_FAILED',         // an unexpected error; the payment was reversed or flagged
  'BOOKING_FAILED',       // the booking failed after payment; the payment was reversed or is being refunded
  // Not BOOKING_NEEDS_REVIEW: the payment is still held, a person has the
  // booking, and "Start a new search" sent a charged customer to buy again. It
  // has its own screen (`underReview`).
]);

/**
 * BOOKING_IN_PROGRESS means another request - an earlier tab, a double click,
 * the booking queue - holds this booking and is confirming it now. It showed a
 * red "Booking Failed". The page asks again this many times, this far apart,
 * then says the booking is still being confirmed.
 */
const IN_PROGRESS_RETRIES = 4;
const IN_PROGRESS_RETRY_MS = 8000;

/**
 * How long the browser waits for the booking itself.
 *
 * Longer than the server's own budget for the same work - the chain's
 * post-commit wait plus the queue worker's margin is about 250 seconds - so
 * this only fires once the server has certainly given up too. A shorter
 * deadline would tell a customer their booking failed while it was completing.
 */
const BOOKING_TIMEOUT_MS = 300_000;

/**
 * PAYMENT_NOT_CAPTURED with `retryable: true` means the server could not reach
 * the payment gateway to check, not that the payment failed. The page asks
 * again this many times, this far apart, before offering to check again.
 */
const PAYMENT_CHECK_RETRIES = 3;
const PAYMENT_CHECK_RETRY_MS = 15000;

/**
 * BOOKING_UNAVAILABLE with `retryable: true`: the booking could not be started
 * just then - the database or the queue did not answer - and nothing was sold.
 * Asked again this many times, this far apart, before offering "Try again".
 */
const UNAVAILABLE_RETRIES = 3;
const UNAVAILABLE_RETRY_MS = 15000;

/**
 * What the server actually did with the order. Drives every word on this
 * screen and on /booking-confirmation. Before this existed the page said
 * "Booking Confirmed!" for a 202 that meant "we have not even tried yet".
 *
 *   ticketed - PNR committed and a ticket issued
 *   held     - PNR committed, ticket not yet issued (the normal case while
 *              auto-ticketing is off; also the needs-review case)
 *   queued   - GDS was saturated; the booking is queued and nothing has been
 *              sent to the airline yet
 *   returned / partly_returned - a PNR and no ticket, whose payment the
 *              booking's record says went back (the server's paymentState): a
 *              reload for a held PNR refunded without being cancelled. It
 *              read "Reservation Held - your seats are reserved".
 *   checking - flagged for review with no PNR: the airline commit never
 *              answered (timed out, or no record locator came back), so nobody
 *              knows whether the airline holds anything. It read as held, and
 *              told the customer their seats were reserved.
 *   voided   - no live ticket, and the answer names tickets a cancel voided
 *              (ALREADY_BOOKED after a cancel whose PNR_Cancel was refused).
 *              Neither issued nor held: nobody can fly on it.
 */
function outcomeOf(body) {
  if (body?.queued === true) return 'queued';
  if (body?.ticketed === true) return 'ticketed';
  if (['returned', 'partly_returned'].includes(body?.paymentState)) return body.paymentState;
  if (Array.isArray(body?.voided_tickets) && body.voided_tickets.length > 0) return 'voided';
  if ((body?.needsReview || body?.data?.needsReview) && !pnrOfAnswer(body)) return 'checking';
  return 'held';
}

/** The record locator the order answer carries, if any. */
function pnrOfAnswer(body) {
  return body?.pnr || body?.data?.pnr || body?.data?.associatedRecords?.[0]?.reference || null;
}

/** What the order page and the confirmation page say of the 'checking' outcome. */
const CHECKING_FALLBACK = 'Your payment is safe and our team is checking with the airline whether your booking went '
  + 'through. We will email you either way - please do not book again in the meantime.';

/** The payment reference checkout left in this browser, if any. */
function storedPaymentReference() {
  try {
    return JSON.parse(localStorage.getItem('pendingPaymentSession') || 'null')?.orderId || null;
  } catch {
    return null;
  }
}

function FlightCreateOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [processingOrder, setProcessingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState(null);
  // The backend's error `code`, kept so the failure screen can tell a retryable
  // problem from a terminal one. Sending someone back to a payment they already
  // made - and that was already refunded - can only fail again.
  const [errorCode, setErrorCode] = useState(null);
  // Set when the server tried to reverse the payment because the booking failed
  // (`bookingFailed: true`), with whether the reversal went through. Several of
  // those answers carry no `code`, so this screen offered "Try again" on a
  // payment that had already been reversed.
  const [refundAttempt, setRefundAttempt] = useState(null);
  // The payment reference this page is booking, for any screen that has to
  // name it before the server has answered with one.
  const [orderReference, setOrderReference] = useState('');
  // Set while another request confirms this booking (BOOKING_IN_PROGRESS):
  // { gaveUp, cancelling }. The same order is sent again, which the server
  // answers once whichever request gets there first.
  const [stillConfirming, setStillConfirming] = useState(null);
  // Set when the server found no captured payment (PAYMENT_NOT_CAPTURED or
  // PAYMENT_NOT_FOUND): { retryable, gaveUp }.
  const [paymentProblem, setPaymentProblem] = useState(null);
  const paymentCheckAttempts = useRef(0);
  // Set when this page has nothing to book: { reference } - the payment
  // reference, when one survived.
  const [missingOrder, setMissingOrder] = useState(null);
  // Waiting to try a BOOKING_UNAVAILABLE order again.
  const [retryingUnavailable, setRetryingUnavailable] = useState(false);
  const unavailableAttempts = useRef(0);
  // Set when the server answered BOOKING_NEEDS_REVIEW: { pnr, reference,
  // payment } - for a PNR the airline confirmed no seat on, or a retry of a
  // booking under review. `payment` is what the server read from the booking's
  // payment record ('held', 'returned', 'partly_returned', 'unconfirmed'); the
  // page says the payment is held only when it says 'held'.
  const [underReview, setUnderReview] = useState(null);
  const orderDataRef = useRef(null);
  const inProgressAttempts = useRef(0);
  const retryTimer = useRef(null);
  useEffect(() => () => clearTimeout(retryTimer.current), []);
  const [bookingReference, setBookingReference] = useState('');
  const [pnr, setPnr] = useState('');
  // Held for staff: the airline took the booking, then a later step failed.
  const [heldForReview, setHeldForReview] = useState(false);
  // The server's own sentence for the answer, shown where the outcome has no
  // fixed wording of its own ('checking').
  const [orderMessage, setOrderMessage] = useState('');
  const [pageLoaded, setPageLoaded] = useState(false);

  // Ref guard to prevent duplicate order processing (React StrictMode can cause double renders)
  const orderProcessedRef = useRef(false);

  console.log('🔍 FlightCreateOrders - Component loaded');

  useEffect(() => {
    console.log('🔍 FlightCreateOrders - useEffect triggered');

    // Guard: Prevent duplicate order processing (React StrictMode causes double renders)
    if (orderProcessedRef.current) {
      console.log('⚠️ Order already being processed, skipping duplicate call');
      return;
    }

    // Try to get data from location.state first, then fallback to localStorage
    let orderData = location.state;

    // Check if location.state is missing critical data
    const hasCriticalData = orderData?.selectedFlight || orderData?.originalOffer || orderData?.passengerData;

    if (!hasCriticalData) {
      console.log('⚠️ Location state missing critical data, checking localStorage...');

      // Try to retrieve from localStorage as fallback
      try {
        const storedBookingData = sessionStorage.getItem('pendingFlightBooking') || localStorage.getItem('pendingFlightBooking');
        const storedSessionData = localStorage.getItem('pendingPaymentSession');
        const parsedBooking = storedBookingData ? JSON.parse(storedBookingData) : null;
        const parsedSession = storedSessionData ? JSON.parse(storedSessionData) : {};
        // A draft saved for another payment is not this order's: booking one
        // trip's travellers under another trip's reference books the wrong people.
        const draftForThisOrder = parsedBooking
          && !(parsedBooking.orderId && parsedSession?.orderId && parsedBooking.orderId !== parsedSession.orderId);

        if (draftForThisOrder) {
          const bookingData = parsedBooking;
          const sessionData = parsedSession;


          // Merge localStorage data with location.state (location.state takes priority for payment info)
          orderData = {
            // Payment info from location.state (comes from PaymentCallback).
            // Nothing is invented here: the transaction id and amount end up
            // on the customer's confirmation page, and a made-up id or a
            // default amount there is a fabricated receipt. The server
            // verifies the payment against ARC Pay itself, so the old
            // client-side "verified" flag proved nothing and is gone.
            transactionId: orderData?.transactionId || sessionData?.sessionId || null,
            // Never invented. A made-up reference matches no payment, so the
            // order was refused and the customer's real payment was not named.
            orderId: orderData?.orderId || sessionData?.orderId || null,
            amount: bookingData?.amount || orderData?.amount || sessionData?.amount || null,

            // Flight data from localStorage
            selectedFlight: bookingData?.selectedFlight || bookingData?.flightData,
            flightData: bookingData?.flightData || bookingData?.selectedFlight,
            originalOffer: bookingData?.originalOffer || bookingData?.selectedFlight?.originalOffer,
            passengerData: bookingData?.passengerData,
            bookingDetails: bookingData?.bookingDetails,
            calculatedFare: bookingData?.calculatedFare,

            // The first address that can be delivered to, in the order
            // orderDataFromCheckoutRow takes them: the one the payment
            // callback handed over (checkout's), then the lead traveller's.
            // The lead's was put first whatever it held, and a typed
            // "jane@gmailcom" hid the callback's good one.
            customerEmail: [orderData?.customerEmail, bookingData?.passengerData?.[0]?.email].find(isUsableEmail) || ''
          };

        }
      } catch (e) {
        console.error('❌ Error parsing localStorage data:', e);
      }
    }

    // Final check. With nothing to book - the page opened again after the tab
    // lost its state, from a link, or with storage cleared - this said "Booking
    // data not found. Please start your booking again" and sent the customer to
    // search, whether or not they had just paid. Say what is known instead: the
    // payment reference, if one survived, and what happens next.
    const finalHasCriticalData = orderData?.selectedFlight || orderData?.originalOffer || orderData?.passengerData;

    if (orderData && finalHasCriticalData && orderData.orderId) {
      // Mark as processed to prevent duplicate calls (React StrictMode / re-renders)
      orderProcessedRef.current = true;
      processFlightOrder(orderData);
    } else {
      console.log('❌ No order to confirm on this page');
      setMissingOrder({ reference: orderData?.orderId || storedPaymentReference() });
    }
    setLoading(false);
    const timer = setTimeout(() => setPageLoaded(true), 100);
    return () => clearTimeout(timer);
  }, [location.state, navigate]);

  // Function to call the Flight Create Orders API
  // API: POST /api/flights/order (our backend, which books on Amadeus Enterprise SOAP)
  const processFlightOrder = async (orderData) => {
    setProcessingOrder(true);
    setError(null);
    setErrorCode(null);
    setRefundAttempt(null);
    setUnderReview(null);
    setOrderReference(orderData?.orderId || '');
    orderDataRef.current = orderData;

    try {
      // The same builder the abandoned-checkout job uses to finish a booking
      // whose customer paid and closed the tab - see shared/flightOrderBody.js.
      // It invents nothing: if the form data did not survive the payment
      // round-trip, it says so and we tell the customer instead of booking a
      // stranger.
      const { body: flightBookingData, passengerDetails, problem } = buildFlightOrderBody(orderData, {
        userId: authUser?.id || null,
      });

      if (problem === 'PASSENGERS_INCOMPLETE') {
        const err = new Error(
          `Passenger details are missing from this session, so we did not send the booking to the airline. ` +
          `Your payment reference is ${orderData.orderId || 'unavailable'}. Please contact support and we will complete or refund it.`
        );
        err.code = 'PASSENGERS_INCOMPLETE';
        throw err;
      }

      if (problem === 'OFFER_MISSING') {
        const err = new Error(
          `Your flight selection is missing from this session, so we did not send the booking to the airline. ` +
          `Your payment reference is ${orderData.orderId || 'unavailable'}. Please contact support and we will complete or refund it.`
        );
        err.code = 'OFFER_MISSING';
        throw err;
      }

      // Read back for the confirmation record below.
      const amountPaid = flightBookingData.totalAmount;
      const fareBreakdown = flightBookingData.fareBreakdown;

      console.log('📋 Flight booking request details:', {
        hasFlightOffer: !!flightBookingData.flightOffer,
        flightOfferKeys: flightBookingData.flightOffer ? Object.keys(flightBookingData.flightOffer) : [],
        hasTravelers: !!flightBookingData.travelers,
        travelersCount: flightBookingData.travelers?.length || 0,
        hasContactInfo: !!flightBookingData.contactInfo,
        totalAmount: flightBookingData.totalAmount
      });
      // Not the payload: it carries every traveller's passport number, expiry,
      // date of birth and nationality, and the production build strips no
      // console calls. The shape above is what debugging actually needs.

      // A deadline longer than the server's own budget, never shorter.
      //
      // This request had none at all, and the page it sits behind says "This
      // may take a few moments. Please don't close this window." - so a stalled
      // socket left a customer who had already paid watching that sentence for
      // ever. Amadeus booking is genuinely slow, which is what made the hang
      // indistinguishable from working.
      //
      // The number is derived, not picked: the chain's own post-commit budget
      // is `airlineLocatorMaxWaitMs` (180s) plus the issue retries, and the
      // queue worker allows that plus a minute - about 250s. Giving up earlier
      // than the server would be the worst outcome available: the customer is
      // told it failed while the booking completes behind them.
      const response = await axios.post(endpoints.flights.booking, flightBookingData, {
        timeout: BOOKING_TIMEOUT_MS,
      });

      const body = response.data || {};
      if (body.success) {
        // Read what the server said happened, not what we hoped. A 202 with
        // `queued: true` means the GDS was saturated and nothing has been
        // sent to the airline; `ticketed: false` with a PNR means the seats
        // are held but no ticket exists yet. Both used to render as
        // "Booking Confirmed!".
        const result = outcomeOf(body);
        const needsReview = Boolean(body.needsReview || body.data?.needsReview);
        const reference = body.bookingReference || body.data?.bookingReference || body.data?.id || orderData.orderId || '';
        const pnrValue = pnrOfAnswer(body);
        const status = result === 'queued' ? 'PENDING_CONFIRMATION'
          : result === 'ticketed' ? 'CONFIRMED'
            : 'PENDING_TICKETING';

        setOutcome(result);
        setOrderSuccess(true);
        setBookingReference(reference);
        setPnr(pnrValue);
        setHeldForReview(needsReview);
        setOrderMessage(typeof body.message === 'string' ? body.message : '');
        setStillConfirming(null);
        inProgressAttempts.current = 0;
        setPaymentProblem(null);
        paymentCheckAttempts.current = 0;
        setRetryingUnavailable(false);
        unavailableAttempts.current = 0;

        const orderDetails = {
          reference,
          pnr: pnrValue,
          status,
          createdAt: body.data?.createdAt || new Date().toISOString(),
          travelers: body.data?.travelers || orderData.passengerData || []
        };

        // Clear any old booking data and store fresh flight booking with PNR
        localStorage.removeItem('completedBooking'); // Clear old cruise bookings

        // Extract flight details from the selected flight data
        const flightData = orderData.selectedFlight || orderData.flightData || {};
        const itinerary = flightData.itineraries?.[0] || orderData.originalOffer?.itineraries?.[0] || {};
        const firstSegment = itinerary.segments?.[0] || {};
        const lastSegment = itinerary.segments?.[itinerary.segments?.length - 1] || firstSegment;

        // Every leg and flight of the offer booked. The fields below read only
        // `itineraries[0]`, so the confirmation page never showed a round
        // trip's return flight, and showed a connection as its first flight
        // number beside its last arrival.
        const legs = itinerariesFromOffer(orderData.originalOffer || flightData.originalOffer || flightData);

        // Format travelers properly for display
        const formattedTravelers = (orderDetails.travelers || orderData.passengerData || []).map(traveler => {
          if (typeof traveler === 'object') {
            return {
              firstName: traveler.firstName || traveler.name?.firstName || '',
              lastName: traveler.lastName || traveler.name?.lastName || '',
              dateOfBirth: traveler.dateOfBirth,
              gender: traveler.gender
            };
          }
          return traveler;
        });

        const completedFlightBooking = {
          type: 'flight',
          orderId: orderDetails.reference,
          bookingReference: orderDetails.reference,
          pnr: orderDetails.pnr,
          // The bank's reference the server read from ARC Pay. This was the
          // result indicator the payment page handed over - the value that
          // proves the payment to our server, not a number a bank knows.
          transactionId: body.transactionId || null,
          amount: amountPaid,
          orderCreatedAt: orderDetails.createdAt,
          status: orderDetails.status,
          // The server's verdict, for the confirmation page to render
          // honestly. `tickets` is what a real e-ticket would print.
          queued: result === 'queued',
          ticketed: result === 'ticketed',
          tickets: Array.isArray(body.tickets) ? body.tickets : [],
          // The tickets a cancel voided (ALREADY_BOOKED), for the confirmation
          // page's voided wording: without them it read the booking as issued.
          voided_tickets: Array.isArray(body.voided_tickets) ? body.voided_tickets : [],
          needsReview,
          // The name the confirmation page and bookingStatus read. Saving only
          // `needsReview` meant the "our team is finishing your ticket" line
          // never showed there.
          needs_review: needsReview ? { reason: null } : null,
          // The airline commit never answered: the confirmation page's own
          // outcome for it, as nothing there can tell it from a held PNR.
          ...(result === 'checking' ? { commitUnknown: true } : {}),
          // A payment the booking's record says went back, for the
          // confirmation page (paymentReturned): it said "Total Paid ...
          // Payment received" of a refunded booking.
          ...(body.paymentState === 'returned' ? { payment_status: 'refunded' }
            : body.paymentState === 'partly_returned' ? { payment_status: 'partially_refunded' } : {}),
          mode: body.mode || null,
          message: body.message || '',
          // Include formatted travelers
          travelers: formattedTravelers,
          // Flight route details
          origin: firstSegment.departure?.iataCode || flightData.origin || flightData.departure || '',
          destination: lastSegment.arrival?.iataCode || flightData.destination || flightData.arrival || '',
          originCity: flightData.originCity || flightData.departureCity || '',
          destinationCity: flightData.destinationCity || flightData.arrivalCity || '',
          // Flight times and dates. A time is the airport's own clock, as the
          // airline sends it ("2027-03-14T02:40:00", no offset), read by the
          // results page's helper and printed as the itinerary below prints
          // it ("2:40 AM"). Through `new Date(at).toLocaleTimeString()` it was
          // the viewer's clock: in New York on its spring-forward day a 02:40
          // departure read 03:40 at the top of the confirmation page.
          departureDate: firstSegment.departure?.at?.split('T')[0] || flightData.departureDate || '',
          departureTime: clockTime(airportClockLabel(firstSegment.departure?.at)) || flightData.departureTime || '',
          arrivalTime: clockTime(airportClockLabel(lastSegment.arrival?.at)) || flightData.arrivalTime || '',
          duration: itinerary.duration || flightData.duration || '',
          // Airline info
          airline: firstSegment.carrierCode || flightData.airline || flightData.carrierCode || '',
          airlineName: flightData.airlineName || flightData.carrier || '',
          flightNumber: firstSegment.number ? `${firstSegment.carrierCode}${firstSegment.number}` : flightData.flightNumber || '',
          // Additional details
          cabinClass: flightData.cabinClass || flightData.travelClass || 'ECONOMY',
          passengers: formattedTravelers.length || 1,
          passengerData: passengerDetails, // Store full passenger details
          fareBreakdown: fareBreakdown,    // Store fare breakdown for confirmation page
          contact: orderData.bookingDetails?.contact, // Store contact info
          itineraries: legs,
          returnDate: returnDateOf(legs)
        };

        // Nothing is kept in this browser. `completedFlightBookings` and
        // `completedFlightBooking` held every traveller's passport number and
        // date of birth, for every booking, and no page read them. The review
        // page's draft is removed too, now the order has an answer; the
        // booking itself is on the server and in router state below.
        clearStoredBookings();
        clearTravellerDraft();

        // Hand the booking over in router state. The confirmation page used
        // to re-read localStorage, which is shared across tabs and could
        // show a different booking than the one just made.
        setTimeout(() => {
          navigate('/booking-confirmation', { state: { bookingData: completedFlightBooking } });
        }, 2000);
      } else {
        throw new Error(body.message || body.error || 'Failed to create flight order');
      }
    } catch (error) {
      console.error('Order processing error:', error);
      console.error('Error response data:', error.response?.data);
      console.error('Error status:', error.response?.status);

      // The server answered, so the draft with the travellers' documents has
      // done its job: any retry from here resends what this page holds in
      // memory. Kept only when no answer came, as a dropped connection is
      // retried by reloading this page.
      if (error.response) clearStoredBookings();

      /**
       * No answer within the deadline. The customer has already paid, and the
       * server is very likely still working - so this is "still confirming",
       * not "failed".
       *
       * Asking again is safe and is the right move: the order route holds a
       * compare-and-set claim on the booking reference, so a second request for
       * a booking already under way is answered BOOKING_IN_PROGRESS rather than
       * booking it twice. That is the same machinery used below, and it ends at
       * the honest screen - "You don't need to pay or try again: we will email
       * you as soon as the airline confirms it."
       *
       * The old fallback read "Connection error. Please check your internet
       * connection and try again", under a red Booking Failed, to a customer
       * whose booking was in all likelihood being confirmed at that moment.
       */
      // A gateway answer with none of our codes is the same thing. The request
      // passes Vercel's rewrite to the booking server, which gives up after
      // 120 seconds, and a booking waiting for a slow airline's record locator
      // can take longer: the page said "Booking Failed" while the server went
      // on to issue the ticket, and a customer who paid again was held as a
      // duplicate payment.
      // Only an answer that is not ours: every answer the order route gives carries
      // `success`, and a failed booking it refunded is a 502 too.
      const answer = error.response?.data;
      const gatewayCutOff = [502, 503, 504].includes(error.response?.status)
        && !(answer && typeof answer === 'object' && 'success' in answer);
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        || (!error.response && /timeout/i.test(error.message || ''))
        || gatewayCutOff;
      if (timedOut) {
        inProgressAttempts.current += 1;
        const gaveUp = inProgressAttempts.current > IN_PROGRESS_RETRIES;
        setErrorCode('BOOKING_TIMEOUT');
        setError(null);
        setStillConfirming({ gaveUp, cancelling: false });
        if (!gaveUp) {
          retryTimer.current = setTimeout(() => processFlightOrder(orderDataRef.current), IN_PROGRESS_RETRY_MS);
        }
        return;
      }

      if (error.response?.data?.code === 'BOOKING_IN_PROGRESS') {
        // Not a failure: the request holding this booking is confirming it.
        // Ask again shortly, a few times. A booking being cancelled will not
        // become confirmed, so that one is said once and not asked again.
        const cancelling = /cancel/i.test(error.response.data.error || '');
        inProgressAttempts.current += 1;
        const gaveUp = cancelling || inProgressAttempts.current > IN_PROGRESS_RETRIES;
        setErrorCode('BOOKING_IN_PROGRESS');
        setError(error.response.data.error || null);
        setStillConfirming({ gaveUp, cancelling });
        if (!gaveUp) {
          retryTimer.current = setTimeout(() => processFlightOrder(orderDataRef.current), IN_PROGRESS_RETRY_MS);
        }
        return;
      }
      setStillConfirming(null);

      const failureCode = error.response?.data?.code;
      if (failureCode === 'PAYMENT_NOT_CAPTURED' || failureCode === 'PAYMENT_NOT_FOUND') {
        // Nothing was booked because no captured payment was found. That is not
        // a failed booking, and "Try again" reloaded the same refusal for ever.
        // When the gateway could not be reached (`retryable`), ask again after
        // a short wait; otherwise the payment did not complete.
        const retryable = error.response.data.retryable === true;
        setErrorCode(failureCode);
        setError(error.response.data.error || null);
        if (retryable) {
          paymentCheckAttempts.current += 1;
          const gaveUp = paymentCheckAttempts.current > PAYMENT_CHECK_RETRIES;
          setPaymentProblem({ retryable: true, gaveUp });
          if (!gaveUp) {
            retryTimer.current = setTimeout(() => processFlightOrder(orderDataRef.current), PAYMENT_CHECK_RETRY_MS);
          }
        } else {
          setPaymentProblem({ retryable: false, gaveUp: true });
        }
        return;
      }
      setPaymentProblem(null);

      if (failureCode === 'BOOKING_UNAVAILABLE' && error.response.data.retryable === true) {
        // Nothing was sold and nothing is wrong with the payment: the booking
        // could not be started just then. Try again shortly, a few times,
        // before leaving it to the customer's own "Try again".
        unavailableAttempts.current += 1;
        if (unavailableAttempts.current <= UNAVAILABLE_RETRIES) {
          setErrorCode(failureCode);
          setError(error.response.data.error || null);
          setRetryingUnavailable(true);
          retryTimer.current = setTimeout(() => processFlightOrder(orderDataRef.current), UNAVAILABLE_RETRY_MS);
          return;
        }
      }
      setRetryingUnavailable(false);

      // Charged, and with a person: the airline confirmed no seat on this PNR,
      // or this is a retry of a booking under review. Not a failure to start
      // again from - a second trip bought now is a second charge that no
      // duplicate check catches - so it gets its own screen, in the server's
      // words.
      if (failureCode === 'BOOKING_NEEDS_REVIEW') {
        setErrorCode(failureCode);
        setError(error.response.data.error || error.response.data.message || null);
        setUnderReview({
          pnr: error.response.data.pnr || null,
          reference: error.response.data.bookingReference || orderData?.orderId || null,
          payment: error.response.data.paymentState || null,
        });
        return;
      }

      // Extract more detailed error message with priority order
      let errorMessage = 'Failed to process order';

      setErrorCode(error.response?.data?.code || error.code || null);
      const failure = error.response?.data;
      setRefundAttempt(failure?.bookingFailed === true ? { refunded: failure.refunded === true } : null);

      if (error.response?.data) {
        // Backend returned structured error
        if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.details) {
          errorMessage = error.response.data.details;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        }
      } else if (error.message) {
        // Use error.message as fallback
        errorMessage = error.message;
      }

      // Add context for common errors
      if (errorMessage.includes('Network Error') || errorMessage.includes('timeout')) {
        errorMessage = 'Connection error. Please check your internet connection and try again.';
      } else if (errorMessage.includes('500')) {
        errorMessage = 'Server error. Our team has been notified. Please try again or contact support.';
      } else if (errorMessage.includes('Invalid flight order data')) {
        errorMessage = 'Booking data validation failed. Please try searching for flights again.';
      }

      console.error('📛 Final error message shown to user:', errorMessage);

      setError(errorMessage);
    } finally {
      setProcessingOrder(false);
    }
  };

  // Handle API errors based on Amadeus error codes
  const handleApiError = (err) => {
    // Check if it's an Amadeus API error response
    if (err.response?.data?.errors) {
      const amadeusError = err.response.data.errors[0];

      // Handle specific error codes
      switch (amadeusError.code) {
        case 477:
          setError(`Invalid format: ${amadeusError.detail || 'Please check your booking details'}`);
          break;
        case 141:
          setError('A system error occurred. Please try again later.');
          break;
        default:
          setError(`${amadeusError.title || 'Error'}: ${amadeusError.detail || 'An error occurred during booking'}`);
      }
    } else if (err.response?.data?.error) {
      // Handle our backend error format
      setError(err.response.data.error || 'Failed to create flight order');
    } else {
      // Handle general errors
      setError(err.message || 'An error occurred while creating your flight order');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100">
        <Navbar forceScrolled={true} />
        <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-center text-gray-600 font-medium text-lg">Processing Your Booking...</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-blue-50 via-white to-gray-100 min-h-screen">
      <Navbar forceScrolled={true} />

      {/* Content Container - Starting after navbar */}
      <div className="pt-20 animate-fadeIn">
        {/* Order Processing Title */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-2">
          <div className="flex items-center">
            <div className="bg-blue-100 p-2 rounded-full mr-3">
              <Lock className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Flight Booking</h1>
              <p className="text-gray-600">Creating your flight order with confirmation details</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 overflow-x-auto">
          <div className={`transition-opacity duration-500 ${pageLoaded ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-between max-w-3xl mx-auto">
              {[
                { icon: <Check />, label: "Flight Selection", completed: true },
                { icon: <Check />, label: "Passenger Details", completed: true },
                { icon: <Check />, label: "Payment", completed: true },
                { icon: <CheckCircle />, label: "Confirmation", completed: orderSuccess && outcome === 'ticketed', active: !(orderSuccess && outcome === 'ticketed') }
              ].map((step, index) => (
                <React.Fragment key={step.label}>
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 
                      ${step.completed ? 'bg-green-100 text-green-600 border-green-500' :
                        step.active ? 'bg-blue-600 text-white border-blue-600 animate-pulse shadow-md shadow-blue-300' :
                          'bg-gray-100 text-gray-400 border-gray-300'}`}>
                      {step.icon}
                    </div>
                    <span className={`text-xs mt-2 font-medium ${step.active ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-600'}`}>
                      {step.label}
                    </span>
                  </div>
                  {index < 3 && (
                    <div className={`flex-1 h-1 mx-2 rounded-full transition-all duration-500
                      ${step.completed ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 sm:p-8">
              <div className="text-center">
                {processingOrder && !stillConfirming && !paymentProblem && !retryingUnavailable ? (
                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-full border-4 border-blue-50 flex items-center justify-center">
                      <Loader className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">Creating Your Flight Booking</h2>
                    <p className="text-gray-600">
                      We're securing your flight reservation with the airline...
                    </p>
                    <div className="pt-2 pb-2">
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full animate-progress-indeterminate"></div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">
                      This may take a few moments. Please don't close this window.
                    </p>
                  </div>
                ) : orderSuccess ? (
                  <div className="space-y-4">
                    {outcome === 'ticketed' ? (
                      <>
                        <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                          <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Booking Confirmed!</h2>
                        <p className="text-gray-600">
                          Your ticket has been issued. You'll be redirected to your confirmation shortly.
                        </p>
                      </>
                    ) : outcome === 'queued' ? (
                      <>
                        <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                          <Clock className="w-8 h-8 text-blue-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Booking Received</h2>
                        <p className="text-gray-600">
                          Your payment is complete and your booking is in the queue. We are confirming your seats with the airline now; this can take a few minutes.
                        </p>
                      </>
                    ) : outcome === 'voided' ? (
                      // As the confirmation page says it (tickets_voided).
                      <>
                        <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                          <Clock className="w-8 h-8 text-amber-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Ticket Voided</h2>
                        <p className="text-gray-600">
                          Your ticket has been voided and is not valid for travel. The cancellation has not been completed with the airline yet.
                        </p>
                      </>
                    ) : outcome === 'checking' ? (
                      // No record locator came back, so no seat is promised:
                      // the server's own words, which ask them not to book again.
                      <>
                        <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                          <Clock className="w-8 h-8 text-amber-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Checking Your Booking With the Airline</h2>
                        <p className="text-gray-600">{orderMessage || CHECKING_FALLBACK}</p>
                        <p className="text-sm text-gray-500">Questions? Call (877) 538-7380 with your booking reference.</p>
                      </>
                    ) : ['returned', 'partly_returned'].includes(outcome) ? (
                      // Refunded without being cancelled: no held seat and no
                      // payment to speak of, as the under-review screen says it.
                      <>
                        <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                          <Clock className="w-8 h-8 text-amber-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">This booking was not completed</h2>
                        <p className="text-gray-600">
                          {outcome === 'returned'
                            ? 'Your payment for this booking has been refunded.'
                            : 'Part of your payment for this booking has been refunded.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                          <Clock className="w-8 h-8 text-amber-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Reservation Held</h2>
                        <p className="text-gray-600">
                          {heldForReview
                            // A later step failed after the airline took the
                            // booking. "Your ticket is being issued" was not
                            // true of it.
                            ? 'Your seats are reserved with the airline, but your ticket could not be issued automatically. Our team is finishing it and will email you when it is done.'
                            : 'Your seats are reserved with the airline. Your ticket has not been issued yet; we will email it to you once it is.'}
                        </p>
                      </>
                    )}

                    <div className="py-3">
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Booking Reference:</span>
                          <span className="font-semibold text-gray-800">{bookingReference || 'Pending'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Airline Reference (PNR):</span>
                          <span className="font-semibold text-gray-800">
                            {pnr || (outcome === 'queued' ? 'Pending airline confirmation' : 'Not yet assigned')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="animate-pulse">
                      <p className="text-sm text-gray-600">
                        Redirecting to your booking confirmation...
                      </p>
                    </div>
                  </div>
                ) : stillConfirming ? (
                  // BOOKING_IN_PROGRESS: another request is confirming this
                  // booking now. This was a red "Booking Failed".
                  <div className="space-y-4" role="status">
                    <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                      {stillConfirming.gaveUp
                        ? <Clock className="w-8 h-8 text-blue-600" />
                        : <Loader className="w-8 h-8 text-blue-600 animate-spin" />}
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      {stillConfirming.cancelling ? 'This booking is being cancelled'
                        : stillConfirming.gaveUp ? 'Your booking is still being confirmed'
                          : 'Still confirming your booking'}
                    </h2>
                    <p className="text-gray-600">
                      {stillConfirming.cancelling
                        ? (error || 'This booking is being cancelled, so it cannot be confirmed.')
                        : stillConfirming.gaveUp
                          ? "It is taking longer than usual. You don't need to pay or try again: we will email you as soon as the airline confirms it, and it will show in My Trips."
                          : 'Your booking is already being confirmed with the airline, perhaps from an earlier attempt. We will check on it again in a few seconds.'}
                    </p>
                    {orderReference && (
                      <p className="text-sm text-gray-500">
                        Booking reference: <span className="font-semibold text-gray-800">{orderReference}</span>
                      </p>
                    )}
                    {stillConfirming.gaveUp && (
                      <div className="pt-2">
                        <button
                          onClick={() => navigate(authUser ? '/my-trips' : '/')}
                          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                          {authUser ? 'Go to My Trips' : 'Back to home'}
                        </button>
                        <p className="text-sm text-gray-500 mt-3">Questions? Call (877) 538-7380.</p>
                      </div>
                    )}
                  </div>
                ) : paymentProblem ? (
                  // No captured payment was found, so nothing was booked. This
                  // was "Booking Failed" with a "Try again" that reloaded the
                  // same refusal for ever.
                  <div className="space-y-4" role="status">
                    <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                      {paymentProblem.retryable && !paymentProblem.gaveUp
                        ? <Loader className="w-8 h-8 text-amber-600 animate-spin" />
                        : <AlertCircle className="w-8 h-8 text-amber-600" />}
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      {!paymentProblem.retryable ? 'Payment not completed'
                        : paymentProblem.gaveUp ? 'We could not check your payment'
                          : 'Checking your payment'}
                    </h2>
                    <p className="text-gray-600">
                      {!paymentProblem.retryable
                        ? 'Your payment did not go through, so nothing has been booked. You can go back to your trip and pay again, or start a new search.'
                        : paymentProblem.gaveUp
                          ? 'The payment gateway is not answering right now, so we could not confirm your payment or book your flight. If your card was charged, we will confirm your booking or refund you by email. You can also check again in a few minutes.'
                          : 'We could not reach the payment gateway to confirm your payment. We will check again in a few seconds; please keep this page open.'}
                    </p>
                    {orderReference && (
                      <p className="text-sm text-gray-500">
                        Payment reference: <span className="font-semibold text-gray-800">{orderReference}</span>
                      </p>
                    )}
                    {paymentProblem.gaveUp && (
                      <div className="pt-2 space-y-3">
                        {paymentProblem.retryable ? (
                          <button
                            onClick={() => {
                              paymentCheckAttempts.current = 0;
                              setPaymentProblem(null);
                              processFlightOrder(orderDataRef.current);
                            }}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                          >
                            Check again
                          </button>
                        ) : (orderDataRef.current?.selectedFlight || orderDataRef.current?.flightData) && (
                          // The review page, with the flight they were paying
                          // for: checkout prices it again and takes a new payment.
                          <button
                            onClick={() => navigate('/flights/booking-confirmation', {
                              state: { flightData: orderDataRef.current.selectedFlight || orderDataRef.current.flightData },
                            })}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                          >
                            Back to your trip
                          </button>
                        )}
                        <button
                          onClick={() => navigate('/flights')}
                          className="w-full py-3 bg-white text-blue-700 border border-blue-200 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                        >
                          Search flights
                        </button>
                      </div>
                    )}
                  </div>
                ) : retryingUnavailable ? (
                  // BOOKING_UNAVAILABLE: nothing sold, payment safe; trying again.
                  <div className="space-y-4" role="status">
                    <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                      <Loader className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">Starting your booking</h2>
                    <p className="text-gray-600">
                      We could not start your booking just now. Your payment is safe, and we will try again in a few seconds; please keep this page open.
                    </p>
                    {orderReference && (
                      <p className="text-sm text-gray-500">
                        Booking reference: <span className="font-semibold text-gray-800">{orderReference}</span>
                      </p>
                    )}
                  </div>
                ) : missingOrder ? (
                  // Nothing to book on this page. Never "start your booking
                  // again": this customer may have just paid.
                  <div className="space-y-4" role="status">
                    <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-amber-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      {missingOrder.reference ? 'We received your payment reference' : 'No booking in progress on this page'}
                    </h2>
                    <p className="text-gray-600">
                      {missingOrder.reference
                        ? `Your payment reference is ${missingOrder.reference}. We could not load your booking details on this page, but you do not need to book again: we will confirm your booking or refund you by email.`
                        : 'We could not find a booking in progress on this page. If you completed a payment, we will email you about it, and your booking will appear in My Trips.'}
                    </p>
                    <p className="text-sm text-gray-500">
                      Questions? Call <a href="tel:+18775387380" className="font-semibold text-blue-700">(877) 538-7380</a> or email{' '}
                      <a href="mailto:support@jetsetterss.com" className="font-semibold text-blue-700 break-all">support@jetsetterss.com</a>
                      {missingOrder.reference ? ' with this reference.' : '.'}
                    </p>
                    <div className="pt-2">
                      <button
                        onClick={() => navigate(authUser ? '/my-trips' : '/')}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                      >
                        {authUser ? 'Go to My Trips' : 'Back to home'}
                      </button>
                    </div>
                  </div>
                ) : underReview ? (
                  // BOOKING_NEEDS_REVIEW. It was a red "Booking Failed" with
                  // "Start a new search". Only a PNR the answer names is called
                  // a reservation: a retry's answer names none.
                  //
                  // What the money did is the server's to say (paymentState,
                  // read from the booking's payment record). "Your payment is
                  // held ... do not book this trip again" was said for every
                  // answer, including a booking already refunded - false twice
                  // over, and it kept that customer from rebooking a trip they
                  // no longer held. Held only when held; refunded when refunded;
                  // otherwise neither is claimed.
                  <div className="space-y-4" role="status">
                    <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-amber-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      {['returned', 'partly_returned'].includes(underReview.payment)
                        ? 'This booking was not completed'
                        : 'Our team is reviewing your booking'}
                    </h2>
                    {error && (
                      <div className="bg-amber-50 text-amber-800 p-4 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                    <p className="text-gray-600">
                      {underReview.payment === 'held'
                        ? `${underReview.pnr
                          ? `Your payment is held against your reservation (airline reference ${underReview.pnr}) while our team works on it.`
                          : 'Your payment is held with this booking while our team reviews it.'} `
                          + 'Our team will contact you. Please do not book this trip again in the meantime: a second booking is a second charge.'
                        : underReview.payment === 'returned'
                          ? 'Your payment for this booking has been refunded.'
                          : underReview.payment === 'partly_returned'
                            ? 'Part of your payment for this booking has been refunded.'
                            : 'Our team will contact you about this booking and your payment.'}
                    </p>
                    {underReview.reference && (
                      <p className="text-sm text-gray-500">
                        Booking reference: <span className="font-semibold text-gray-800">{underReview.reference}</span>
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      Questions? Call <a href="tel:+18775387380" className="font-semibold text-blue-700">(877) 538-7380</a> or email{' '}
                      <a href="mailto:support@jetsetterss.com" className="font-semibold text-blue-700 break-all">support@jetsetterss.com</a>.
                    </p>
                    <div className="pt-2">
                      <button
                        onClick={() => navigate(authUser ? '/my-trips' : '/')}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                      >
                        {authUser ? 'Go to My Trips' : 'Back to home'}
                      </button>
                    </div>
                  </div>
                ) : errorCode === 'DUPLICATE_PAYMENT' ? (
                  // A second payment for a trip already booked, or being booked,
                  // for the same travellers. It is held for support, not booked
                  // and not refunded automatically, so this is not "Booking
                  // Failed" and there is nothing to try again.
                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-amber-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">We did not book this trip twice</h2>
                    <div className="bg-amber-50 text-amber-800 p-4 rounded-lg text-sm">
                      {error}
                    </div>
                    <div className="pt-2">
                      <button
                        onClick={() => navigate(authUser ? '/my-trips' : '/flights')}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                      >
                        {authUser ? 'Go to My Trips' : 'Back to flights'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">{refundAttempt ? 'Booking Not Completed' : 'Booking Failed'}</h2>
                    <p className="text-gray-600">
                      We encountered an issue while creating your flight booking.
                    </p>
                    <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
                      {error || "An unexpected error occurred. Please try again."}
                    </div>
                    {refundAttempt && (
                      // What happened to the money, on its own line, as the
                      // server reported it.
                      <p className={`text-sm font-medium ${refundAttempt.refunded ? 'text-green-700' : 'text-amber-800'}`}>
                        {refundAttempt.refunded
                          ? 'Your payment has been reversed. You do not need to do anything.'
                          : 'Your payment has not been reversed yet. Our team has been alerted and will refund you.'}
                        {orderReference ? ` Booking reference: ${orderReference}.` : ''}
                      </p>
                    )}
                    <div className="pt-2">
                      {TERMINAL_ERROR_CODES.has(errorCode) || refundAttempt ? (
                        // The payment behind this reference is gone - refunded,
                        // refused, or spent on a booking that was cancelled.
                        // Returning to it just hits the same guard again, so
                        // send them somewhere that can actually work.
                        <button
                          onClick={() => navigate("/flights")}
                          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                          Start a new search
                        </button>
                      ) : (
                        // A retryable failure (a dropped connection, a busy
                        // moment). Trying again resends this same order, which
                        // the server handles once. "Return to Payment" used to
                        // lead to a legacy payment page that charges again.
                        <button
                          onClick={() => window.location.reload()}
                          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />

      {/* Add CSS for the animate-progress-indeterminate class */}
      <style>{`
        @keyframes progress-indeterminate {
          0% {
            transform: translateX(-100%);
            width: 50%;
          }
          50% {
            transform: translateX(0%);
            width: 50%;
          }
          100% {
            transform: translateX(100%);
            width: 50%;
          }
        }
        .animate-progress-indeterminate {
          animation: progress-indeterminate 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default withPageElements(FlightCreateOrders); 