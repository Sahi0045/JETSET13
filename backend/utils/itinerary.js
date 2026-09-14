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
