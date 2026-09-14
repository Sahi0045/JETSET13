/**
 * Which traveller details a flight booking needs.
 *
 *  - Name and gender: always. They go on the ticket, and the gender picks the
 *    title Amadeus files with the name.
 *  - Date of birth: for a child or an infant, whose fare depends on their age
 *    on the day of travel, and for everyone on a trip that crosses a border,
 *    where it is part of the passport data (SSR DOCS) Amadeus will not issue a
 *    ticket without. A domestic adult does not need one: the PNR does not carry
 *    it, and MakeMyTrip does not ask for it.
 *  - Passport: trips that cross a border only.
 *
 * Shared by the review page, the order body and the order route, so the page
 * never lets through what the server refuses, nor asks for what it does not.
 */

/**
 * @param {object} p
 * @param {string} p.type            ADULT | CHILD | HELD_INFANT | SEATED_INFANT
 * @param {boolean} [p.international] whether the trip crosses a border; unknown
 *   counts as yes, because a missing document costs a ticket and an extra field
 *   costs a few seconds
 */
export function needsDateOfBirth({ type, international } = {}) {
  return international !== false || type !== 'ADULT';
}
