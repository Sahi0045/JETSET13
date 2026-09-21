/**
 * Coming back to the review page after cancelling on ARC's payment page.
 *
 * The cancel link sent the customer to /flights?cancelled=true, which the
 * landing page ignores, and the review page had already cleared the flight it
 * kept for this tab: the flight they chose and every detail they typed were
 * gone, and nothing said whether they had been charged. The cancel link now
 * returns to the review page, which restores the flight and the travellers
 * from the booking it saved before opening the payment page.
 *
 * Only on that return. The saved booking is removed once an order has
 * answered (FlightCreateOrders.jsx); restoring it on any other visit could put
 * a trip that has already been paid for back on a page with a Pay button.
 */

const SAVED_BOOKING = 'pendingFlightBooking';

/** Where ARC sends a customer who cancels: this review page, marked as a cancelled payment. */
export const cancelUrlFor = (origin) => `${origin}/flights/booking-confirmation?payment=cancelled`;

/** Whether this visit is the return from a cancelled payment. */
export const isCancelledReturn = (search) => new URLSearchParams(search || '').get('payment') === 'cancelled';

/**
 * The review page as it was before the payment page opened: its router state
 * (the flight, the search and the attempt id), the travellers and the contact
 * details. Null when nothing usable was saved.
 *
 * The attempt id is what ties the traveller draft to this booking and no other
 * (utils/flightTravellerDraft.js). It was left behind here, like
 * flightReviewResume.js once did, so after a cancelled payment the draft fell
 * back to the route-and-party fingerprint any booking of the same flight shares.
 *
 * @param {Storage} [storage]
 * @returns {{ reviewState: { flightData: object, searchData: object|null, attemptId: string|null }, travellers: object[], contact: object|null }|null}
 */
export function readCancelledCheckout(storage = globalThis.sessionStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(SAVED_BOOKING) || 'null');
    const flightData = saved?.selectedFlight;
    // Without the airline's offer there is no fare to price or book.
    if (!flightData?.originalOffer) return null;
    return {
      reviewState: { flightData, searchData: saved.searchData ?? null, attemptId: saved.attemptId ?? null },
      travellers: Array.isArray(saved.passengerData) ? saved.passengerData : [],
      contact: saved.bookingDetails?.contact ?? null,
    };
  } catch {
    return null;
  }
}
