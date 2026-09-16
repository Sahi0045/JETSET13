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

/**
 * How long a draft may sit in a browser before it is cleared unread.
 *
 * `clearStoredBookings` runs on logout and once an order has answered. A
 * customer who reaches ARC Pay and closes the tab does neither, so their
 * travellers' names, dates of birth and passport numbers stayed in
 * localStorage indefinitely - on a shared computer, for whoever used the
 * browser next. The draft only has to outlive the round trip to the payment
 * page and back, which is minutes.
 */
export const BOOKING_DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Remove a draft that is older than the payment round trip it exists for, or
 * one saved before `savedAt` was written at all. Never throws.
 *
 * Runs on mount, AFTER a cancelled-payment return has read the draft back
 * (utils/cancelledCheckout.js), so coming back from ARC still restores the
 * flight and the travellers.
 */
export function clearStaleStoredBookings(storage = globalThis.localStorage, now = Date.now()) {
  let savedAt = null;
  try {
    savedAt = JSON.parse(storage?.getItem('pendingFlightBooking') || 'null')?.savedAt ?? null;
  } catch {
    // Unreadable is as good a reason to clear it as stale.
  }
  if (savedAt !== null && now - Number(savedAt) < BOOKING_DRAFT_MAX_AGE_MS) return false;
  clearStoredBookings(storage);
  return true;
}
