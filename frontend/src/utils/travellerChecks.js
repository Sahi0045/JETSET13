import { passengerAgeProblem } from '../../../shared/flightCharge';
import { isUsableEmail } from '../../../shared/email';
import { needsDateOfBirth } from '../../../shared/travellerDetails';

/**
 * What a traveller form still needs before payment, in words the customer can
 * act on.
 *
 * One list for the payment check and for the "1/2 added" progress, so the page
 * never marks a traveller done that payment then refuses. The rules for a date
 * of birth are shared with the order route (shared/travellerDetails.js).
 *
 * @param {object} traveller a form: { type, firstName, lastName, dateOfBirth,
 *   gender, mobile, email, nationality, passportNumber, passportExpiry }
 * @param {object} ctx
 * @param {number}  ctx.index          position on the page; the first traveller is the lead
 * @param {boolean} ctx.international  whether the trip crosses a border
 * @param {string}  ctx.travelDate     YYYY-MM-DD, for the age a fare depends on
 * @param {string}  [ctx.lastDate]     the trip's last day, for passport expiry
 * @param {boolean} [ctx.bookingAsGuest]
 * @param {string}  [ctx.contactEmail] the booking's contact email, if any
 * @returns {string[]}
 */
export function travellerProblems(traveller, {
  index = 0, international = true, travelDate, lastDate, bookingAsGuest = false, contactEmail = '',
} = {}) {
  const t = traveller || {};
  const problems = [];
  const add = (text) => problems.push(text);

  if (!t.firstName?.trim() || !t.lastName?.trim()) add('Enter the first and last name exactly as on the ID.');
  if (!t.dateOfBirth) {
    if (needsDateOfBirth({ type: t.type, international })) add('Enter the date of birth.');
  } else {
    const ageProblem = passengerAgeProblem(t.type, t.dateOfBirth, travelDate);
    if (ageProblem) {
      add(ageProblem);
    } else if (t.type !== 'ADULT' && lastDate) {
      // An infant who turns 2, or a child who turns 12, before the last flight
      // is on the wrong fare for the rest of the trip - many airlines then
      // require a paid seat on the way back.
      const laterProblem = passengerAgeProblem(t.type, t.dateOfBirth, String(lastDate).slice(0, 10));
      if (laterProblem) add(laterProblem.replace('on the day of travel', 'on every flight of the trip'));
    }
  }
  if (!t.gender) add('Select a gender.');
  if (index === 0 && !t.mobile) add('Enter a mobile number for booking updates.');
  // A guest's ticket goes to this address, and it is their only way back to the
  // booking - there is no account for it to appear under. Checkout refuses a
  // guest without one.
  if (index === 0 && bookingAsGuest && !isUsableEmail(contactEmail || t.email)) {
    add('Enter an email address. Your ticket is sent there, and it is how you find this booking without an account.');
  }
  // An international ticket cannot be issued without the passport.
  if (international) {
    if (!t.nationality) add('Select a nationality.');
    if (!t.passportNumber?.trim()) add('Enter the passport number.');
    if (!t.passportExpiry) {
      add('Enter the passport expiry date.');
    } else if (lastDate && new Date(t.passportExpiry) <= new Date(String(lastDate).slice(0, 10))) {
      add('The passport expires before the trip ends.');
    }
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
