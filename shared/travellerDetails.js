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

const dayOf = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : null);

/**
 * The first and last days of a trip, from every flight the offer sells.
 *
 * A round trip's return is the offer's second itinerary. The review page read
 * the last day from the outbound flights alone, so an infant who turns 2
 * before the flight home, or a passport that runs out before it, passed every
 * check and was found at the airport.
 *
 * @param {object} offer an offer with `itineraries[].segments[]`
 * @returns {{ firstDate: string|null, lastDate: string|null }} YYYY-MM-DD
 */
export function tripDates(offer) {
  const segments = (Array.isArray(offer?.itineraries) ? offer.itineraries : [])
    .flatMap((itinerary) => (Array.isArray(itinerary?.segments) ? itinerary.segments : []));
  const firstDate = dayOf(segments[0]?.departure?.at);
  const last = segments[segments.length - 1];
  const lastDate = dayOf(last?.arrival?.at) || dayOf(last?.departure?.at) || firstDate;
  return { firstDate, lastDate };
}
