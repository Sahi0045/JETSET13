/**
 * The whole trip on the flight review page: the flights home as well as the
 * flights out.
 *
 * The results page keeps a round trip's return in `returnLeg`, and the review
 * page read only `segments` - the outbound. So the page a customer confirms
 * and pays on never showed the flight home, and the airline data sent with the
 * charge carried the outbound legs only. Both now come from the offer's own
 * itineraries, every one of them. Kept out of the page so they can be tested
 * without rendering it.
 */

const segmentsOf = (itinerary) => (Array.isArray(itinerary?.segments) ? itinerary.segments : []);

/**
 * An Amadeus segment in the shape the results page gives a flight's segments,
 * for a return the results page did not describe.
 */
const displaySegment = (segment) => {
  const carrier = String(segment?.carrierCode || '').toUpperCase();
  return {
    departure: {
      airport: segment?.departure?.iataCode || '',
      terminal: segment?.departure?.terminal || '',
      at: segment?.departure?.at || null,
    },
    arrival: {
      airport: segment?.arrival?.iataCode || '',
      terminal: segment?.arrival?.terminal || '',
      at: segment?.arrival?.at || null,
    },
    // Only the code is known here: another carrier's name or logo would be a guess.
    airline: carrier ? { code: carrier, name: carrier, logo: `https://pics.avs.io/200/200/${carrier}.png` } : null,
    duration: segment?.duration || '',
    flightNumber: carrier && segment?.number ? `${carrier} ${segment.number}` : '',
    aircraft: segment?.aircraft?.code || '',
  };
};

/**
 * The return flights of a round trip, in the results page's segment shape, or
 * null for a one-way trip. The results page's own description is preferred -
 * it carries airline names - and the offer's second itinerary stands in when
 * there is none.
 *
 * @param {object} flightData the flight the results page handed over
 * @returns {{ segments: object[], duration: string }|null}
 */
export function returnLegOf(flightData) {
  const itinerary = flightData?.originalOffer?.itineraries?.[1];
  const described = Array.isArray(flightData?.returnLeg?.segments) ? flightData.returnLeg.segments : [];
  const segments = described.length > 0 ? described : segmentsOf(itinerary).map(displaySegment);
  if (segments.length === 0) return null;
  return {
    segments,
    duration: flightData?.returnLeg?.duration || itinerary?.duration || '',
  };
}

const arcSegment = (segment) => ({
  carrierCode: segment?.carrierCode || '',
  number: segment?.number || '',
  departure: { iataCode: segment?.departure?.iataCode || '', at: segment?.departure?.at || '' },
  arrival: { iataCode: segment?.arrival?.iataCode || '', at: segment?.arrival?.at || '' },
});

/**
 * Every leg of the trip for the airline data sent with the charge: one
 * itinerary per direction, from the offer the airline priced. `fallback` is
 * used only when the offer has no itineraries to read.
 *
 * @param {object} offer the Amadeus offer
 * @param {Array} [fallback] itineraries built from the page's own segments
 */
export function arcItineraries(offer, fallback = []) {
  const itineraries = Array.isArray(offer?.itineraries) ? offer.itineraries : [];
  const legs = itineraries
    .map((itinerary) => ({ segments: segmentsOf(itinerary).map(arcSegment) }))
    .filter((itinerary) => itinerary.segments.length > 0);
  return legs.length > 0 ? legs : fallback;
}
