/**
 * What a flight booking leaves in this browser's localStorage, and clearing it.
 *
 * `pendingFlightBooking` holds every traveller's name, date of birth and passport
 * number: the review page writes it before payment so the order page can book
 * after the round trip to ARC Pay. Nothing removed it. The order page also wrote
 * `completedFlightBookings` and `completedFlightBooking` - the same details again,
 * for every booking - and nothing read them. On a shared computer the next person
 * at the browser could read them all, signed out or not.
 */
export const BOOKING_STORAGE_KEYS = Object.freeze([
  'pendingFlightBooking',
  'pendingPaymentSession',
  'completedFlightBookings',
  'completedFlightBooking',
]);

/** Remove every booking draft and copy this browser holds. Never throws. */
export function clearStoredBookings(storage = globalThis.localStorage) {
  for (const key of BOOKING_STORAGE_KEYS) {
    try {
      storage?.removeItem(key);
    } catch {
      // Storage blocked: there is nothing this page can remove.
    }
  }
}
