import { isUsableEmail } from '../../../shared/email';
import { bookingTravellerProblems } from '../../../shared/travellerDetails';

/**
 * What a traveller form still needs before payment, in words the customer can
 * act on.
 *
 * One list for the payment check and for the "1/2 added" progress, so the page
 * never marks a traveller done that payment then refuses. What the airline needs
 * of every traveller - name, date of birth and age, gender, passport - is the
 * rule checkout refuses by too (shared/travellerDetails.js); this adds what the
 * page asks of the lead traveller for the booking's contact details.
 *
 * @param {object} traveller a form: { type, firstName, lastName, dateOfBirth,
 *   gender, mobile, countryCode, email, nationality, passportNumber, passportExpiry }
 * @param {object} ctx
 * @param {number}  ctx.index          position on the page; the first traveller is the lead
 * @param {boolean} ctx.international  whether the trip crosses a border
 * @param {string}  ctx.travelDate     YYYY-MM-DD, for the age a fare depends on
 * @param {string}  [ctx.lastDate]     the trip's last day, for later ages and passport expiry
 * @param {boolean} [ctx.bookingAsGuest]
 * @param {string}  [ctx.contactEmail] the booking's contact email, if any
 * @returns {string[]}
 */
export function travellerProblems(traveller, {
  index = 0, international = true, travelDate, lastDate, bookingAsGuest = false, contactEmail = '',
} = {}) {
  const t = traveller || {};
  const problems = bookingTravellerProblems(t, { international, travelDate, lastDate });
  const add = (text) => problems.push(text);

  if (index === 0 && !t.mobile) add('Enter a mobile number for booking updates.');
  // The number goes onto the booking with this code. There is no default to
  // fall back on: the old one wrote every number as +1.
  if (index === 0 && t.mobile && !String(t.countryCode ?? '').replace(/\D/g, '')) {
    add('Select the country code for the mobile number.');
  }
  // A guest's ticket goes to this address, and it is their only way back to the
  // booking - there is no account for it to appear under. Checkout refuses a
  // guest without one.
  if (index === 0 && bookingAsGuest && !isUsableEmail(contactEmail || t.email)) {
    add('Enter an email address. Your ticket is sent there, and it is how you find this booking without an account.');
  }
  return problems;
}

const TYPE_ORDER = ['ADULT', 'CHILD', 'HELD_INFANT', 'SEATED_INFANT'];

/**
 * How many forms of each type are complete: [{ type, done, total }], adults
 * first - "Adults 1/2 · Child 0/1".
 *
 * @param {Array} travellers
 * @param {(traveller, index) => string[]} problemsOf
 */
export function travellerProgress(travellers, problemsOf) {
  const byType = new Map();
  (travellers ?? []).forEach((traveller, index) => {
    const entry = byType.get(traveller.type) ?? { type: traveller.type, done: 0, total: 0 };
    entry.total += 1;
    if (problemsOf(traveller, index).length === 0) entry.done += 1;
    byType.set(traveller.type, entry);
  });
  return TYPE_ORDER.filter((type) => byType.has(type)).map((type) => byType.get(type));
}
