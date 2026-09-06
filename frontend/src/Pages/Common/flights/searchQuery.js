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
 * The query string this page puts on its own URL.
 *
 * Shared with the date strip so the two cannot drift: it used to write only
 * from/to/date, so refreshing after picking a date on a three-passenger
 * business search came back as one passenger in economy.
 */
export const searchToQuery = (sd, isoDate) => {
  const q = new URLSearchParams({
    from: extractIata(sd.from),
    to: extractIata(sd.to),
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
    tripType: returnDate ? 'round-trip' : 'one-way',
    adults,
    travelers: adults,
    children: parseInt(q.get('children')) || 0,
    infants: parseInt(q.get('infants')) || 0,
    travelClass: q.get('travelClass') || 'ECONOMY',
  };
};
