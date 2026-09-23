/**
 * The body POST /api/flights/order books from, built from what checkout saved.
 *
 * Two callers build it and must not drift apart:
 *  - the order page (FlightCreateOrders.jsx), when the customer's browser comes
 *    back from ARC Pay;
 *  - the abandoned-checkout job (backend/jobs/abandonedCheckout.job.js), when it
 *    never does, because the customer paid and closed the tab.
 *
 * Nothing is invented: no default name, date of birth, gender, contact or
 * offer. These go onto a real PNR, and a placeholder passenger is a ticket the
 * airline refuses at the gate. A missing piece comes back as `problem` and the
 * caller decides what to do about it.
 */

import { needsDateOfBirth } from './travellerDetails.js';
import { callingCodeDigits } from './countries.js';
import { isUsableEmail } from './email.js';

export const TRAVELLER_TYPES = ['ADULT', 'CHILD', 'HELD_INFANT', 'SEATED_INFANT'];

/**
 * @param {object} orderData the order page's data: { transactionId, orderId, amount,
 *   selectedFlight, flightData, originalOffer, passengerData, bookingDetails,
 *   calculatedFare, customerEmail }
 * @param {{ userId?: string|null }} [options]
 * @returns {{ body: object|null, passengerDetails: object[],
 *   problem: 'PASSENGERS_INCOMPLETE'|'OFFER_MISSING'|null }}
 */
export function buildFlightOrderBody(orderData, { userId = null } = {}) {
  const passengerDetails = (orderData?.passengerData || []).map((p, i) => ({
    id: `${i + 1}`,
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    dateOfBirth: p.dateOfBirth || '',
    gender: p.gender || '',
    // The fare type the review page locked this traveller to.
    ptc: TRAVELLER_TYPES.includes(p.type) ? p.type : '',
    title: p.title || '',
    mobile: p.mobile || '',
    email: p.email || '',
    seatNumber: p.seatNumber || '',
    meal: p.meal || '',
    baggage: p.baggage || '',
    requiresWheelchair: p.requiresWheelchair || false,
    // Travel document. Without it an international ticket cannot be issued:
    // Amadeus refuses with `27791 TICKETING INHIBITED-SSR DOCS MISSING FOR P1`
    // after the PNR commits and the customer has paid.
    nationality: p.nationality || '',
    passportNumber: p.passportNumber || '',
    passportExpiry: p.passportExpiry || '',
    documentType: p.documentType || (p.passportNumber ? 'PASSPORT' : ''),
  }));

  // A domestic adult needs no date of birth (shared/travellerDetails.js). The
  // review page records whether the trip crosses a border; a booking saved
  // without that record needs one for everybody, as before.
  const international = orderData?.bookingDetails?.isInternational;
  const secureFlight = orderData?.bookingDetails?.secureFlight === true;
  const incomplete = passengerDetails.length === 0 || passengerDetails.some(
    (p) => !p.firstName || !p.lastName || !p.gender
      || (!p.dateOfBirth && needsDateOfBirth({ type: p.ptc, international, secureFlight }))
  );
  if (incomplete) return { body: null, passengerDetails, problem: 'PASSENGERS_INCOMPLETE' };

  // The full offer over any transformed card. There is no placeholder: sending
  // one would make the server book (and then refund) an offer that never existed.
  const flightOffer = orderData.originalOffer || orderData.selectedFlight?.originalOffer
    || orderData.selectedFlight || orderData.flightData || null;
  if (!flightOffer) return { body: null, passengerDetails, problem: 'OFFER_MISSING' };

  const body = {
    flightOffer,
    totalAmount: orderData.amount || orderData.calculatedFare?.totalAmount
      || orderData.selectedFlight?.price?.total || orderData.originalOffer?.price?.total || null,
    transactionId: orderData.transactionId || null,
    orderId: orderData.orderId || null,
    bookingReference: orderData.orderId || null,
    travelers: passengerDetails.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      ptc: p.ptc || undefined,
      // `/order` builds the SSR DOCS element from these.
      nationality: p.nationality,
      passportNumber: p.passportNumber,
      passportExpiry: p.passportExpiry,
      documentType: p.documentType,
      // Ticked on the review page; `/order` asks the airline for it (SSR WCHR).
      ...(p.requiresWheelchair === true ? { requiresWheelchair: true } : {}),
    })),
    passengerDetails,
    fareBreakdown: orderData.calculatedFare || null,
    // Contact details go onto the PNR; an invented phone number is what the
    // airline would call about a schedule change. So is an invented country
    // code: the review page never sent one and this defaulted to '1', so every
    // phone was booked as a US number. The lead traveller's own code stands in
    // for a booking saved before the page sent it.
    //
    // The first address that can be delivered to, as the order route picks it.
    // The first one given was taken whatever it held, and a typed
    // "jane@gmailcom" went onto the order as its contact.
    contactInfo: {
      email: [orderData.bookingDetails?.contact?.email, orderData.customerEmail, passengerDetails[0]?.email].find(isUsableEmail) || '',
      countryCode: callingCodeDigits(orderData.bookingDetails?.contact?.countryCode)
        || callingCodeDigits(orderData.passengerData?.[0]?.countryCode),
      phoneNumber: orderData.bookingDetails?.contact?.phone || passengerDetails[0]?.mobile || '',
    },
    userId,
  };

  return { body, passengerDetails, problem: null };
}

/**
 * The order page's data, rebuilt from the booking row hosted checkout wrote.
 *
 * The same mapping PaymentCallback.jsx makes from `pending_booking_data` before
 * it hands over to the order page. Checkout stores its whole request there, with
 * the review page's booking nested under `bookingData`.
 */
export function orderDataFromCheckoutRow(row) {
  const details = row?.booking_details || {};
  const checkout = details.pending_booking_data || {};
  const bookingData = checkout.bookingData || checkout;
  return {
    transactionId: null,
    orderId: row?.booking_reference || checkout.orderId || details.order_id || null,
    amount: bookingData.amount ?? row?.total_amount ?? null,
    selectedFlight: bookingData.selectedFlight || bookingData.flightData,
    flightData: bookingData.flightData || bookingData.selectedFlight,
    originalOffer: bookingData.originalOffer,
    passengerData: bookingData.passengerData,
    bookingDetails: bookingData.bookingDetails,
    calculatedFare: bookingData.calculatedFare,
    // The first address that can be delivered to, in the order route's order:
    // checkout's customerEmail, the lead traveller's, then the one checkout
    // recorded (an account's address, when the one typed was not usable). The
    // lead traveller's typed email was taken first, whatever it held.
    customerEmail: [checkout.customerEmail, bookingData.passengerData?.[0]?.email, details.customer_email].find(isUsableEmail) || '',
  };
}
