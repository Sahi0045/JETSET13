/**
 * The URL contract for the flight search results page.
 *
 * The results page writes `?from=&to=&date=` onto its own URL when the user
 * picks a date in the strip, so that URL is a real, shareable search. Nothing
 * ever read it back: the page took its criteria only from router navigation
 * state, which does not survive a refresh, a bookmark, a pasted link or a
 * restored tab. All of those fell through to a hardcoded DEL-HYD search for
 * today — the wrong route, silently, under the URL the user was looking at.
 *
 * Both directions live here so the reader and the writer cannot drift apart.
 */

/**
 * "New Delhi (DEL)" -> "DEL"; "DEL" -> "DEL"; anything else unchanged.
 *
 * Three identical copies of this lived inside three different callbacks.
 */
export const extractIata = (str) => {
  if (!str) return '';
  const m = String(str).match(/\(([A-Z]{3})\)$/);
  if (m) return m[1];
  if (/^[A-Z]{3}$/.test(String(str).trim())) return String(str).trim();
  return str;
};

/**
 * The code - or failing that the typed text - a search field names.
 *
 * What the field shows wins over the `fromCode` the form remembers from the
 * last suggestion picked: typing a new city over a picked one leaves that code
 * behind, and trusting it searched the old city.
 */
export const fieldCode = (label, code) => String(extractIata(label) || code || '').trim();

/**
 * The body POST /flights/search receives for a search.
 *
 * One builder for every search the results page runs. The modify form's
 * search built its own and sent the display label, "New Delhi (DEL)", which
 * the server matched as text - to New York.
 */
export const buildSearchPayload = (sd) => {
  const payload = {
    from: fieldCode(sd.from, sd.fromCode),
    to: fieldCode(sd.to, sd.toCode),
    departDate: sd.departDate,
    adults: parseInt(sd.adults) || parseInt(sd.travelers) || 1,
    children: parseInt(sd.children) || 0,
    infants: parseInt(sd.infants) || 0,
    travelClass: sd.travelClass || 'ECONOMY',
    max: 50,
  };
  if (sd.returnDate) payload.returnDate = sd.returnDate;
  if (sd.maxPrice) payload.maxPrice = sd.maxPrice;
  if (sd.nonStop) payload.nonStop = sd.nonStop;
  if (sd.includedAirlineCodes) payload.includedAirlineCodes = sd.includedAirlineCodes;
  if (sd.excludedAirlineCodes) payload.excludedAirlineCodes = sd.excludedAirlineCodes;
  return payload;
};

/**
 * What makes two searches the same search: the criteria, not the identity of
 * the object carrying them. Router state is a fresh object after every
 * navigation, so keying on identity re-ran a search whenever the URL was
 * rewritten with the same criteria.
 */
export const searchKeyOf = (sd) => (sd ? JSON.stringify([
  fieldCode(sd.from, sd.fromCode),
  fieldCode(sd.to, sd.toCode),
  sd.departDate,
  sd.returnDate || '',
  parseInt(sd.adults) || parseInt(sd.travelers) || 1,
  parseInt(sd.children) || 0,
  parseInt(sd.infants) || 0,
  sd.travelClass || 'ECONOMY',
]) : null);

/**
 * The query string this page puts on its own URL.
 *
 * Shared with the date strip so the two cannot drift: it used to write only
 * from/to/date, so refreshing after picking a date on a three-passenger
 * business search came back as one passenger in economy.
 */
export const searchToQuery = (sd, isoDate) => {
  const q = new URLSearchParams({
    from: fieldCode(sd.from, sd.fromCode),
    to: fieldCode(sd.to, sd.toCode),
    date: isoDate || sd.departDate,
  });
  if (sd.returnDate) q.set('returnDate', sd.returnDate);
  const adults = parseInt(sd.adults) || parseInt(sd.travelers) || 1;
  if (adults !== 1) q.set('adults', String(adults));
  if (parseInt(sd.children)) q.set('children', String(parseInt(sd.children)));
  if (parseInt(sd.infants)) q.set('infants', String(parseInt(sd.infants)));
  if (sd.travelClass && sd.travelClass !== 'ECONOMY') q.set('travelClass', sd.travelClass);
  return q.toString();
};

/**
 * The trip type in the search form's spelling: 'roundTrip' or 'oneWay'.
 *
 * Searches read from the URL were written as 'round-trip' and 'one-way', and
 * the form checks for 'roundTrip': after a refresh, Modify showed a round trip
 * as one way. The old spelling is still read, from tabs and state saved before.
 * With no type at all, a return date makes it a round trip.
 */
export const normalizeTripType = (tripType, returnDate) => {
  const type = String(tripType ?? '').replace(/[^a-z]/gi, '').toLowerCase();
  if (type === 'roundtrip') return 'roundTrip';
  if (type === 'oneway') return 'oneWay';
  return returnDate ? 'roundTrip' : 'oneWay';
};

/** Reverse of the above. Returns null unless the URL describes a whole search. */
export const searchFromQuery = (search) => {
  const q = new URLSearchParams(search);
  const from = q.get('from');
  const to = q.get('to');
  const departDate = q.get('date') || q.get('departDate');
  if (!from || !to || !departDate) return null;

  const returnDate = q.get('returnDate') || '';
  const adults = parseInt(q.get('adults')) || 1;
  return {
    from,
    to,
    departDate,
    returnDate,
    tripType: normalizeTripType(null, returnDate),
    adults,
    travelers: adults,
    children: parseInt(q.get('children')) || 0,
    infants: parseInt(q.get('infants')) || 0,
    travelClass: q.get('travelClass') || 'ECONOMY',
  };
};
