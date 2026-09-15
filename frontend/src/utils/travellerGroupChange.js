/**
 * Changing who travels, on the review page, the way Amadeus prices it.
 *
 * A fare is priced for an exact group: the search asks for N seats and prices
 * each passenger type, checkout re-prices that group, and the booking sells
 * that many seats. So a different group is a new search for the same route and
 * dates - and from it the review page takes the SAME flights in the SAME
 * booking classes, never the nearest thing. Another class is another fare, with
 * its own rules, baggage and price.
 *
 * The page used to let customers add a traveller form to a fare priced for
 * someone else, and charge them all the one fare.
 */

/** The flights, times and booking classes that make a fare this fare. */
export const fareIdentity = (offer) => {
  const itineraries = offer?.itineraries ?? [];
  const flights = itineraries
    .map((itinerary) => (itinerary?.segments ?? [])
      .map((s) => [s.carrierCode, s.number, s.departure?.iataCode, s.departure?.at, s.arrival?.iataCode].join('|'))
      .join('>'))
    .join('||');
  if (!flights) return null;

  const classes = (offer?._ama?.segments ?? []).map((s) => s.rbd).filter(Boolean);
  const adultFare = (offer?.travelerPricings ?? []).find((t) => t.travelerType === 'ADULT') ?? offer?.travelerPricings?.[0];
  const bookingClasses = classes.length
    ? classes
    : (adultFare?.fareDetailsBySegment ?? []).map((d) => d.class);
  // The fare basis too: one flight and booking class can be sold as a
  // refundable and a non-refundable fare, and taking the cheaper one silently
  // changed what the customer had chosen.
  const fareBases = (offer?._ama?.segments ?? []).map((s) => s.fareBasis).filter(Boolean);
  const fareBasis = fareBases.length
    ? fareBases
    : (adultFare?.fareDetailsBySegment ?? []).map((d) => d.fareBasis).filter(Boolean);
  return `${flights}#${bookingClasses.join('')}#${fareBasis.join('/')}#${offer?.validatingAirlineCodes?.[0] ?? ''}`;
};

/**
 * The search result that is this same fare, cheapest first, or null when the
 * new group cannot have it - the class sold out for that many seats, or the
 * flight is gone.
 *
 * @param {object} current  the offer on the review page
 * @param {Array}  results  search results: cards carrying `originalOffer`, or offers
 */
export const findSameFare = (current, results) => {
  const wanted = fareIdentity(current);
  if (!wanted) return null;
  const offerOf = (result) => result?.originalOffer ?? result;
  return (results ?? [])
    .filter((result) => fareIdentity(offerOf(result)) === wanted)
    .sort((a, b) => Number(offerOf(a).price?.total) - Number(offerOf(b).price?.total))[0] ?? null;
};

const isoDate = (at) => String(at ?? '').slice(0, 10);

/**
 * The search to run for `group`: the route, dates and cabin this fare was
 * found with. The search the customer ran is preferred - a city code finds the
 * same flights it did the first time - and the offer fills any gap.
 */
export const searchForGroup = (searchData, offer, group) => {
  const itineraries = offer?.itineraries ?? [];
  const outbound = itineraries[0]?.segments ?? [];
  const returning = itineraries[1]?.segments ?? [];
  const returnDate = itineraries.length > 1
    ? (searchData?.returnDate || isoDate(returning[0]?.departure?.at))
    : '';

  return {
    from: searchData?.from || outbound[0]?.departure?.iataCode,
    to: searchData?.to || outbound[outbound.length - 1]?.arrival?.iataCode,
    departDate: searchData?.departDate || isoDate(outbound[0]?.departure?.at),
    returnDate,
    // The search form's spelling (searchQuery.js normalizeTripType): Modify
    // read 'round-trip' as one way.
    tripType: returnDate ? 'roundTrip' : 'oneWay',
    ...(searchData?.travelClass ? { travelClass: searchData.travelClass } : {}),
    adults: group.adults,
    children: group.children,
    infants: group.infants,
    travelers: group.adults + group.children + group.infants,
  };
};

/**
 * One form per traveller the new fare prices, in its order - the order the
 * booking pairs names with fares - keeping what was already typed: the first
 * adult typed stays the first adult, and the same for children and infants.
 * Travellers the new group no longer has are dropped; new ones start blank.
 *
 * @param {Array}    current  the forms on the page, each with a `type`
 * @param {Array}    pricings the new offer's travelerPricings
 * @param {Function} blank    (type, index) => an empty form
 */
export const rebuildTravellers = (current, pricings, blank) => {
  const typed = {};
  for (const traveller of current ?? []) {
    (typed[traveller.type] ??= []).push(traveller);
  }
  return (pricings ?? []).map((pricing, index) => {
    const type = pricing?.travelerType || 'ADULT';
    const kept = typed[type]?.shift();
    return kept ? { ...kept, id: index + 1, type } : blank(type, index);
  });
};
