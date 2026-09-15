/**
 * Is this the same trip as that one?
 *
 * One trip could be paid for twice. Every Pay click on the review page opened
 * a new ARC hosted checkout under a new reference, so a double click, the back
 * button after the payment page opened, or a second tab gave the customer two
 * live payment pages. Pay both, and each paid checkout was booked: two PNRs,
 * two charges. Checkout now hands back the payment page already open for the
 * same trip, and the order route holds a second paid one for a human.
 *
 * Both have to tell a repeat of one trip from a family booking the same flight
 * twice for different people, which is why travellers are always compared.
 * Every function here answers null when its input cannot be told apart from
 * another: missing data is never "the same".
 */

const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
/** A name as an airline compares it: letters only, one case. */
const nameOf = (value) => upper(value).replace(/[^A-Z]/g, '');

/**
 * The flights an offer sells, as one string: carrier, flight number, airports
 * and departure minute of every segment, in order.
 */
export function flightsKey(offer) {
  const segments = (Array.isArray(offer?.itineraries) ? offer.itineraries : [])
    .flatMap((itinerary) => (Array.isArray(itinerary?.segments) ? itinerary.segments : []));
  if (segments.length === 0) return null;

  const parts = segments.map((segment) => [
    upper(segment?.carrierCode),
    upper(segment?.number),
    upper(segment?.departure?.iataCode),
    upper(segment?.arrival?.iataCode),
    text(segment?.departure?.at).slice(0, 16),
  ]);
  if (parts.some((fields) => fields.includes(''))) return null;
  return parts.map((fields) => fields.join(':')).join('|');
}

/** The travellers' names, whatever order they were typed in. */
export function travellerNamesKey(travellers) {
  const list = Array.isArray(travellers) ? travellers : [];
  if (list.length === 0) return null;

  const names = list.map((traveller) => {
    const first = nameOf(traveller?.firstName ?? traveller?.name?.firstName);
    const last = nameOf(traveller?.lastName ?? traveller?.name?.lastName);
    return first && last ? `${first} ${last}` : null;
  });
  return names.includes(null) ? null : names.sort().join('|');
}

// Everything about a traveller that goes onto the booking, from the review
// page's form (shared/flightOrderBody.js reads the same fields).
const TRAVELLER_FIELDS = [
  'title', 'firstName', 'lastName', 'type', 'dateOfBirth', 'gender', 'email', 'mobile', 'meal',
  'requiresWheelchair', 'nationality', 'passportNumber', 'passportExpiry', 'documentType',
];

/**
 * Every traveller detail that goes onto the booking, order ignored. Two
 * checkouts that differ in any of it are not interchangeable: handing back the
 * first would book the details the customer has just corrected.
 */
export function travellerDetailsKey(travellers) {
  const list = Array.isArray(travellers) ? travellers : [];
  if (list.length === 0) return null;
  if (!travellerNamesKey(list)) return null;
  return list
    .map((traveller) => JSON.stringify(TRAVELLER_FIELDS.map((field) => text(traveller?.[field]))))
    .sort()
    .join('|');
}

/**
 * What a flight checkout would book and charge, as one string: the flights,
 * every traveller detail, the contact details, the coupon and the verified
 * total in cents. Null when any of the parts that identify a trip is missing.
 *
 * @param {{ bookingData?: object, customerEmail?: string, total?: number, couponCode?: string }} checkout
 */
export function checkoutKey({ bookingData, customerEmail, total, couponCode } = {}) {
  const flights = flightsKey(bookingData?.originalOffer);
  const travellers = travellerDetailsKey(bookingData?.passengerData);
  const cents = Math.round(Number(total) * 100);
  if (!flights || !travellers || !Number.isFinite(cents) || cents <= 0) return null;

  const contact = bookingData?.bookingDetails?.contact || {};
  return JSON.stringify([
    flights,
    travellers,
    text(customerEmail).toLowerCase(),
    text(contact.email).toLowerCase(),
    text(contact.phone),
    // The calling code travels with the phone: a customer who corrects +1 to
    // +91 must get a new payment page carrying the corrected number, not the
    // one opened with the wrong code.
    text(contact.countryCode).replace(/\D/g, ''),
    upper(couponCode),
    cents,
  ]);
}
