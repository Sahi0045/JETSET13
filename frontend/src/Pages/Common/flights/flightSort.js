// Shared helpers for sorting / scoring flight results.

const UNKNOWN = Number.MAX_SAFE_INTEGER;

/**
 * Minutes in a duration, in either spelling the app carries: Amadeus's
 * "PT2H35M" or the search card's "2h 35m". Unknown is MAX_SAFE_INTEGER, so it
 * sorts last.
 *
 * Only the first spelling was understood, and the search card sends the
 * second, so every flight read as zero minutes: "Fastest" sorted nothing and
 * the sort tabs said "0h 00m".
 */
export const parseDurationMin = (duration) => {
  if (typeof duration === 'number') return Number.isFinite(duration) ? duration : UNKNOWN;
  if (!duration) return UNKNOWN;
  const h = String(duration).match(/(\d+)\s*H/i);
  const m = String(duration).match(/(\d+)\s*M/i);
  if (!h && !m) return UNKNOWN;
  return (h ? parseInt(h[1], 10) : 0) * 60 + (m ? parseInt(m[1], 10) : 0);
};

const minutesOf = (leg) => (Number.isFinite(leg?.durationMinutes) ? leg.durationMinutes : parseDurationMin(leg?.duration));

/** The outbound leg and, on a round trip, the return. */
export const legsOf = (f) => [f, f?.returnLeg].filter(Boolean);

/** The outbound duration in minutes - the one the card shows. */
export const legMinutes = (f) => minutesOf(f);

/** Time across every leg: a round trip is only as fast as both of its legs. */
export const totalMinutes = (f) => {
  const legs = legsOf(f).map(minutesOf);
  return legs.includes(UNKNOWN) ? UNKNOWN : legs.reduce((sum, minutes) => sum + minutes, 0);
};

/** The most stops on any leg: a round trip with a connecting return is not non-stop. */
export const maxStops = (f) => Math.max(0, ...legsOf(f).map((leg) => leg.stops || 0));

/** "2h 05m" from minutes, or '' when the duration is unknown. */
export const formatMinutes = (minutes) => (Number.isFinite(minutes) && minutes !== UNKNOWN
  ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
  : '');

export const priceOf = (f) =>
  typeof f?.price?.amount === 'number' ? f.price.amount : parseFloat(f?.price?.total) || Infinity;

// Min/max bounds for price and duration across a list (for normalization).
// Unknown durations are left out: one of them would stretch the range so far
// that every known duration normalized to zero.
export const computeBounds = (flights = []) => {
  let minP = Infinity, maxP = -Infinity, minD = Infinity, maxD = -Infinity;
  flights.forEach((f) => {
    const p = priceOf(f);
    const d = totalMinutes(f);
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
    if (d === UNKNOWN) return;
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  });
  return { minP, maxP, minD, maxD };
};

// Lower score = better "recommended" pick. Balances price, duration and stops —
// the same trade-off MakeMyTrip's "You may prefer" tab surfaces.
export const recommendScore = (f, b) => {
  const p = priceOf(f);
  const d = totalMinutes(f);
  const pn = b.maxP > b.minP ? (p - b.minP) / (b.maxP - b.minP) : 0;
  const dn = d === UNKNOWN ? 1 : (b.maxD > b.minD ? (d - b.minD) / (b.maxD - b.minD) : 0);
  const sn = Math.min(maxStops(f), 3) / 3;
  return pn * 0.5 + dn * 0.35 + sn * 0.15;
};

const departureAt = (f) => f.segments?.[0]?.departure?.at
  || (f.departure?.rawDate ? `${f.departure.rawDate}T${f.departure.time || ''}` : '');

/**
 * When the journey ends: the LAST segment's arrival. "Arrival - Earliest"
 * sorted on the first segment's, so a connecting flight ranked by when it
 * reached its stopover.
 */
const arrivalAt = (f) => {
  const segments = f.segments || [];
  return segments[segments.length - 1]?.arrival?.at
    || (f.arrival?.rawDate ? `${f.arrival.rawDate}T${f.arrival.time || ''}` : '');
};

/** A sorted copy of `flights` in the order the sort control names. */
export const sortFlights = (flights = [], sortOrder = 'price') => {
  const bounds = computeBounds(flights);
  const amount = (f) => f.price?.amount || 0;

  const compare = {
    price: (a, b) => amount(a) - amount(b),
    '-price': (a, b) => amount(b) - amount(a),
    recommended: (a, b) => recommendScore(a, bounds) - recommendScore(b, bounds),
    // Non-stop flights first, then cheapest within each group
    nonstop_first: (a, b) => (maxStops(a) === 0 ? 0 : 1) - (maxStops(b) === 0 ? 0 : 1) || amount(a) - amount(b),
    duration: (a, b) => totalMinutes(a) - totalMinutes(b),
    departure: (a, b) => departureAt(a).localeCompare(departureAt(b)),
    arrival: (a, b) => arrivalAt(a).localeCompare(arrivalAt(b)),
  }[sortOrder];

  return compare ? [...flights].sort(compare) : [...flights];
};
