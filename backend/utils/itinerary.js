import { countryOfAirport } from '../services/airportsIndex.js';

/**
 * Whether an itinerary crosses a border - which decides whether travellers need
 * passport data and a date of birth (shared/travellerDetails.js).
 *
 * Decided from the offer's own airports, the data the fare was sold on, never
 * from a flag the page sent. An airport the index does not know counts as
 * crossing: asking for a document nobody needed costs a form field, and a
 * missing one costs a ticket.
 */
export const crossesBorder = (offer) => {
  const codes = (offer?.itineraries ?? []).flatMap((itinerary) => (itinerary?.segments ?? [])
    .flatMap((segment) => [segment?.departure?.iataCode, segment?.arrival?.iataCode]));
  if (codes.length === 0) return true;

  const countries = codes.map((code) => countryOfAirport(code));
  if (countries.some((country) => !country)) return true;
  return new Set(countries).size > 1;
};

/** The United States and the territories Secure Flight covers. */
const SECURE_FLIGHT_COUNTRIES = new Set(['US', 'PR', 'VI', 'GU', 'MP', 'AS']);

/**
 * Whether any flight of an itinerary lands in or leaves the United States or a
 * US territory - where Secure Flight needs every traveller's name, date of birth
 * and gender, passport or not. An American Airlines JFK-LAX ticket was refused
 * without them (PDT, 15 Sep 2026).
 */
export const touchesUnitedStates = (offer) => (offer?.itineraries ?? [])
  .flatMap((itinerary) => (itinerary?.segments ?? []).flatMap((segment) => [segment?.departure?.iataCode, segment?.arrival?.iataCode]))
  .some((code) => SECURE_FLIGHT_COUNTRIES.has(countryOfAirport(code)));
