/**
 * Whether a flight can be booked without an account: the admin panel's switch
 * (Feature Flags > Guest flight booking).
 *
 * Guest checkout was switched off in code on 2026-09-13 (#98). A guest booking
 * has no owner, so it never shows in My Trips, and the only way back to it is
 * an email it was made with. This makes it a setting an admin can flip without
 * a deploy.
 *
 * Off unless an admin turned it on. No row, a read error, anything but a stored
 * `true` means off, so a database hiccup can only ever ask a guest to log in,
 * never let one through.
 *
 * Read on every guest checkout, never cached: turning it off applies to the
 * very next customer on every host. Only checkout asks. A guest who already
 * paid is still booked and can still cancel whatever the switch says now.
 */

export const GUEST_FLIGHT_BOOKING_FLAG = 'guest_flight_booking';

/** @returns {Promise<boolean>} true only when the stored switch is on */
export async function isGuestFlightBookingEnabled(client) {
  try {
    const { data, error } = await client
      .from('feature_flags')
      .select('enabled')
      .eq('flag_name', GUEST_FLIGHT_BOOKING_FLAG)
      .maybeSingle();
    if (error) {
      console.warn('⚠️ Guest booking switch could not be read; treating it as off:', error.message);
      return false;
    }
    return data?.enabled === true;
  } catch (err) {
    console.warn('⚠️ Guest booking switch could not be read; treating it as off:', err?.message);
    return false;
  }
}

// A guest must give an address: it is where the ticket goes, and how they find
// the booking again without an account.
export { isUsableEmail } from '../../shared/email.js';
