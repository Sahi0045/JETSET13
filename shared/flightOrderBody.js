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

  const incomplete = passengerDetails.length === 0 || passengerDetails.some(
    (p) => !p.firstName || !p.lastName || !p.dateOfBirth || !p.gender
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
    })),
    passengerDetails,
    fareBreakdown: orderData.calculatedFare || null,
    // Contact details go onto the PNR; an invented phone number is what the
    // airline would call about a schedule change.
    contactInfo: {
      email: orderData.bookingDetails?.contact?.email || orderData.customerEmail || passengerDetails[0]?.email || '',
      countryCode: orderData.bookingDetails?.contact?.countryCode || '1',
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
    customerEmail: bookingData.passengerData?.[0]?.email || checkout.customerEmail || '',
  };
}
