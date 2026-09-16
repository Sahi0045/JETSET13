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
  // The other three product lines write the same shape of thing and were never
  // added here, so none of this was cleared on logout or aged out. A package
  // draft carries every traveller's passport number and expiry
  // (PackageBookingSummary.jsx), a cruise draft their names and nationalities,
  // a hotel draft the guest's contact details.
  'pendingHotelBooking',
  'pendingCruiseBooking',
  'pendingPackageBooking',
  // Written after payment with the booking, the ARC order id and the
  // transaction id. `completedHotelBooking` and `completedPackageBooking` have
  // no reader anywhere in the app - they were pure residue; `completedBooking`
  // is read by the cruise success page and was removed only if the customer
  // later booked a FLIGHT.
  'completedHotelBooking',
  'completedPackageBooking',
  'completedBooking',
]);

/**
 * The only fields the profile cache needs, which is painting a name before the
 * database answers.
 *
 * `userData` used to hold the whole profile form: passport number, passport
 * expiry, issuing country, PAN number, date of birth, mobile and address, with
 * no expiry and nothing clearing it but the Navbar's logout. The profile page
 * no longer writes those (profiledashboard.jsx) - this removes what is already
 * sitting in customers' browsers from before that change.
 */
const PROFILE_CACHE_FIELDS = ['first_name', 'last_name', 'name', 'email', 'role'];

/**
 * Strip anything but the display fields from a `userData` left by an older
 * build. Runs at app start, so it reaches a customer who never opens their
 * profile page again. Never throws.
 */
export function pruneStoredProfile(storage = globalThis.localStorage) {
  let stored;
  try {
    stored = JSON.parse(storage?.getItem('userData') || 'null');
  } catch {
    try { storage?.removeItem('userData'); } catch { /* nothing to remove */ }
    return true;
  }
  if (!stored || typeof stored !== 'object') return false;

  const extra = Object.keys(stored).filter((key) => !PROFILE_CACHE_FIELDS.includes(key));
  if (extra.length === 0) return false;

  const kept = Object.fromEntries(
    PROFILE_CACHE_FIELDS.filter((key) => stored[key] != null).map((key) => [key, stored[key]]),
  );
  try {
    storage?.setItem('userData', JSON.stringify(kept));
  } catch {
    // Cannot rewrite it; removing it is better than leaving a passport there.
    try { storage?.removeItem('userData'); } catch { /* nothing to remove */ }
  }
  return true;
}

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
