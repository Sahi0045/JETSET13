/**
 * Who works the bookings, as one list.
 *
 * There was exactly one back-office role, `admin`, and every gate in the app
 * spelled it out (`role === 'admin'`). Customer support needs to work the
 * Slack-alerted bookings - see them, settle the money, record what they did -
 * without the keys to settings, coupons, fees and staff accounts, so `support`
 * is a role of its own and the booking gates ask this list instead.
 *
 * Deliberately NOT `admin`: the admin gate still guards everything else, so a
 * support account cannot change how the site charges or who else can sign in.
 */
export const BOOKING_STAFF_ROLES = Object.freeze(['admin', 'superadmin', 'support']);

/** Whether this role may work bookings and their payments. */
export const isBookingStaff = (role) => BOOKING_STAFF_ROLES.includes(String(role ?? '').toLowerCase());

/** Whether this role may change settings, coupons, fees and staff accounts. */
export const isFullAdmin = (role) => ['admin', 'superadmin'].includes(String(role ?? '').toLowerCase());
