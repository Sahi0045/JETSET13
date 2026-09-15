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

import { passengerAgeProblem } from './flightCharge.js';
import { travellerNameProblem } from './passengerName.js';

/**
 * @param {object} p
 * @param {string} p.type            ADULT | CHILD | HELD_INFANT | SEATED_INFANT
 * @param {boolean} [p.international] whether the trip crosses a border; unknown
 *   counts as yes, because a missing document costs a ticket and an extra field
 *   costs a few seconds
 * @param {boolean} [p.secureFlight] whether a flight touches the United States,
 *   where Secure Flight needs everyone's date of birth even on a domestic trip -
 *   an American Airlines JFK-LAX ticket was refused without it (PDT, 15 Sep 2026)
 */
export function needsDateOfBirth({ type, international, secureFlight } = {}) {
  return secureFlight === true || international !== false || type !== 'ADULT';
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

/**
 * What a traveller still needs before the airline can book and ticket them, in
 * words the customer can act on. Empty when nothing is missing.
 *
 * One list for the review page (utils/travellerChecks.js, which adds the lead
 * traveller's contact details) and checkout (verifyFlightCharge). Checkout used
 * to check only that names, a gender and a needed date of birth were there, so a
 * client could pay for a child on an adult's fare, an infant turning 2 before
 * the flight home, or an international trip with no passport - bookings the
 * order route then refused, or the airline would not ticket, after the charge.
 *
 * @param {object} traveller { firstName, lastName, dateOfBirth, gender, type,
 *   nationality, passportNumber, passportExpiry }
 * @param {object} ctx
 * @param {string}  [ctx.type]             the fare's type for this traveller; defaults to traveller.type
 * @param {boolean} [ctx.international]    whether the trip crosses a border; unknown counts as yes
 * @param {boolean} [ctx.secureFlight]     whether a flight touches the United States (needsDateOfBirth)
 * @param {boolean} [ctx.passportRequired] whether to ask for the passport; defaults to `international`
 * @param {string}  [ctx.travelDate]       YYYY-MM-DD of the first flight, for the age a fare depends on
 * @param {string}  [ctx.lastDate]         YYYY-MM-DD of the last flight, for later ages and passport expiry
 * @returns {string[]}
 */
export function bookingTravellerProblems(traveller, {
  type, international = true, secureFlight = false, passportRequired = international, travelDate, lastDate,
} = {}) {
  const t = traveller || {};
  const fareType = type || t.type;
  const problems = [];
  const add = (text) => problems.push(text);

  // Present, and printable on the ticket (shared/passengerName.js).
  const nameProblem = travellerNameProblem(t);
  if (nameProblem) add(nameProblem);

  if (!t.dateOfBirth) {
    if (needsDateOfBirth({ type: fareType, international, secureFlight })) add('Enter the date of birth.');
  } else if (travelDate) {
    const ageProblem = passengerAgeProblem(fareType, t.dateOfBirth, travelDate);
    if (ageProblem) {
      add(ageProblem);
    } else if (fareType !== 'ADULT' && lastDate) {
      // An infant who turns 2, or a child who turns 12, before the last flight
      // is on the wrong fare for the rest of the trip - many airlines then
      // require a paid seat on the way back.
      const laterProblem = passengerAgeProblem(fareType, t.dateOfBirth, String(lastDate).slice(0, 10));
      if (laterProblem) add(laterProblem.replace('on the day of travel', 'on every flight of the trip'));
    }
  }

  if (!t.gender) add('Select a gender.');

  // An international ticket cannot be issued without the passport.
  if (passportRequired) {
    if (!t.nationality) add('Select a nationality.');
    if (!String(t.passportNumber ?? '').trim()) add('Enter the passport number.');
    if (!t.passportExpiry) {
      add('Enter the passport expiry date.');
    } else if (lastDate && new Date(t.passportExpiry) <= new Date(String(lastDate).slice(0, 10))) {
      add('The passport expires before the trip ends.');
    }
  }
  return problems;
}
