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
import { NAME_NOT_LATIN, travellerNameProblem } from './passengerName.js';
// The SSR DOCS builder itself, not a copy of its rules: checkout refuses what
// it would drop, so the two cannot disagree. Dependency-free (shared/ only),
// so the review page loads it as well.
import { buildDocsFreetext } from '../backend/services/amadeusSoap/operations/travelDocs.js';

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

const INFANT_TYPES = new Set(['HELD_INFANT', 'SEATED_INFANT']);

const dayOf = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : null);

// Every flight the offer sells, in order: the outbound itinerary, then the
// flight home.
const offerSegments = (offer) => (Array.isArray(offer?.itineraries) ? offer.itineraries : [])
  .flatMap((itinerary) => (Array.isArray(itinerary?.segments) ? itinerary.segments : []));

/**
 * The first and last days of a trip, from every flight the offer sells.
 *
 * A round trip's return is the offer's second itinerary. The review page read
 * the last day from the outbound flights alone, so an infant who turns 2
 * before the flight home, or a passport that runs out before it, passed every
 * check and was found at the airport.
 *
 * `lastDate` is the day the last flight lands, which a passport has to last
 * until. An infant's age goes by the day it leaves (lastFlightDepartureDate).
 *
 * @param {object} offer an offer with `itineraries[].segments[]`
 * @returns {{ firstDate: string|null, lastDate: string|null }} YYYY-MM-DD
 */
export function tripDates(offer) {
  const segments = offerSegments(offer);
  const firstDate = dayOf(segments[0]?.departure?.at);
  const last = segments[segments.length - 1];
  const lastDate = dayOf(last?.arrival?.at) || dayOf(last?.departure?.at) || firstDate;
  return { firstDate, lastDate };
}

/**
 * The day the trip's last flight leaves, for an infant's age on every flight.
 *
 * Infant fares go by the traveller's age when each flight departs. Read on the
 * day the last flight lands (tripDates' lastDate), a baby whose second
 * birthday falls during an overnight last flight was refused.
 *
 * @param {object} offer an offer with `itineraries[].segments[]`
 * @returns {string|null} YYYY-MM-DD; tripDates' lastDate when the last flight
 *   has no departure time
 */
export function lastFlightDepartureDate(offer) {
  const segments = offerSegments(offer);
  return dayOf(segments[segments.length - 1]?.departure?.at) || tripDates(offer).lastDate;
}

/**
 * What the customer is told for each field the DOCS builder reports it could
 * not use (buildDocsFreetext's onUnusable). Worded for the review page's own
 * fields: the country that issued the passport is the nationality there.
 */
const DOCS_FIELD_PROBLEMS = Object.freeze({
  nationality: 'Select the nationality from the list, so the airline can read it.',
  issuanceCountry: 'Select the nationality from the list, so the airline can read it.',
  expiryDate: 'Enter the passport expiry date again as a full date (day, month and year).',
  dateOfBirth: 'Enter the date of birth again as a full date (day, month and year).',
  firstName: NAME_NOT_LATIN,
  lastName: NAME_NOT_LATIN,
  length: 'The names and passport number are too long together for the airline\'s passport record. '
    + 'Enter the names exactly as printed on the passport, without titles. If they already are, call (877) 538-7380 to book.',
});

/**
 * The fields of this traveller's passport the SSR DOCS builder would drop.
 *
 * Presence was all checkout asked for, and the builder then left out a
 * nationality with no three-letter code, an expiry not written YYYY-MM-DD, or
 * a DOCS longer than the element holds - and the booking went ahead with no
 * passport record, which the airline will not ticket (27791 SSR DOCS
 * MISSING), after the charge.
 *
 * The traveller goes to the builder as the order route hands them to the
 * chain (flight.routes.js amadeusTravelers, from the checkout row that
 * shared/flightOrderBody.js writes): the passport as the document, the
 * nationality as the issuing country too, the holder mark, and the gender and
 * fare type the DOCS gender is written from.
 */
function unusableDocsFields(t, fareType) {
  const fields = new Set();
  buildDocsFreetext({
    firstName: t.firstName,
    lastName: t.lastName,
    dateOfBirth: t.dateOfBirth,
    gender: String(t.gender ?? '').trim().toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE',
    ptc: fareType,
    documents: [{
      documentType: t.documentType || 'PASSPORT',
      number: t.passportNumber || '',
      expiryDate: t.passportExpiry || '',
      issuanceCountry: t.nationality || '',
      nationality: t.nationality || '',
      holder: true,
    }],
  }, { onUnusable: (unusable) => unusable.forEach((field) => fields.add(field)) });
  return [...fields];
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
 * @param {string}  [ctx.lastDate]         YYYY-MM-DD the last flight lands, for passport expiry
 * @param {string}  [ctx.lastDepartureDate] YYYY-MM-DD the last flight leaves, for an infant's
 *   age on every flight; `lastDate` when not given
 * @returns {string[]}
 */
export function bookingTravellerProblems(traveller, {
  type, international = true, secureFlight = false, passportRequired = international, travelDate, lastDate,
  lastDepartureDate,
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
    } else if (INFANT_TYPES.has(fareType) && (lastDepartureDate || lastDate)) {
      // An infant who turns 2 before the last flight needs a paid seat on the
      // later flights, which no one fare type here sells - so every type
      // refuses them, and the customer is told how to book it. The age is the
      // one on the day that flight leaves, not the day it lands. A child is not
      // checked again: a child's fare is set by their age when the trip begins
      // (IATA), and asking them to be under 12 on the way home as well left a
      // child who turns 12 on the trip with no fare at all.
      const laterProblem = passengerAgeProblem(fareType, t.dateOfBirth, String(lastDepartureDate || lastDate).slice(0, 10));
      if (laterProblem) {
        add(`${laterProblem.replace('on the day of travel', 'on every flight of the trip')} `
          + 'To book an infant who turns 2 during the trip, call (877) 538-7380.');
      }
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
    // Present is not usable: what the DOCS builder would drop is refused here,
    // before payment - and nothing else, since it is the builder that decides.
    // Only once nothing else is wrong, so a field already asked for is not
    // asked for twice.
    if (problems.length === 0) {
      new Set(unusableDocsFields(t, fareType).map((field) => DOCS_FIELD_PROBLEMS[field]).filter(Boolean)).forEach(add);
    }
  }
  return problems;
}
