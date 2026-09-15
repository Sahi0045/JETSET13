/**
 * Every leg and every flight of a booked trip, in one plain shape.
 *
 * The pages after payment - the confirmation, My Trips, Manage Booking, the
 * travel document and the confirmation email - each read `itineraries[0]` of the
 * offer and nothing else. A round trip's return flight appeared nowhere once it
 * was paid for, and a connection showed its first flight number beside its last
 * arrival, as though it were one non-stop flight.
 *
 * The order route saves this on the booking (`booking_details.itineraries`), the
 * bookings API sends it, and every one of those surfaces renders it.
 *
 * Times are the airport's own local times, as the airline gives them, and are
 * kept as text. No time zone is known for them, so none is ever applied: a time
 * pushed through `new Date` and printed in the viewer's zone is a different time.
 *
 * Leg:     { direction: 'outbound'|'return'|'onward', duration, origin,
 *            destination, departureDate, arrivalDate, stops, segments, partial? }
 * Segment: { flightNumber, carrierCode, operatingCarrier, aircraft, cabin,
 *            origin, destination, departureDate, departureTime, departureTerminal,
 *            arrivalDate, arrivalTime, arrivalTerminal }
 */

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

/** "2026-11-15T19:25:00" -> { date: '2026-11-15', time: '19:25' }; blanks when absent. */
export function splitLocalDateTime(at) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text(at));
  return { date: match?.[1] || '', time: match?.[2] ? `${match[2]}:${match[3]}` : '' };
}

/** The cabin booked on each segment, by segment id, from the first traveller's fare. */
function cabinsBySegment(offer) {
  const cabins = new Map();
  const fares = offer?.travelerPricings?.[0]?.fareDetailsBySegment;
  for (const fare of Array.isArray(fares) ? fares : []) {
    if (fare?.segmentId != null && fare?.cabin) cabins.set(text(fare.segmentId), text(fare.cabin));
  }
  return cabins;
}

const directionOf = (index, count) => (index === 0 ? 'outbound' : count === 2 ? 'return' : 'onward');

/**
 * The legs of an Amadeus offer (`offer.itineraries[].segments[]`), in the shape
 * above. Nothing is invented: a field the offer does not carry is blank, and a
 * segment without both airports is left out.
 *
 * @param {object|null|undefined} offer
 * @returns {object[]}
 */
export function itinerariesFromOffer(offer) {
  const legs = Array.isArray(offer?.itineraries) ? offer.itineraries : [];
  const cabins = cabinsBySegment(offer);

  return legs.map((leg, index) => {
    const segments = (Array.isArray(leg?.segments) ? leg.segments : []).map((segment) => {
      const departure = splitLocalDateTime(segment?.departure?.at);
      const arrival = splitLocalDateTime(segment?.arrival?.at);
      const carrier = text(segment?.carrierCode);
      const number = text(segment?.number);
      const operating = text(segment?.operating?.carrierCode);
      return {
        flightNumber: carrier && number ? `${carrier}${number}` : number,
        carrierCode: carrier,
        // Only a different airline: the mapper copies the marketing carrier in
        // when the flight is not a codeshare.
        operatingCarrier: operating && operating !== carrier ? operating : '',
        aircraft: text(segment?.aircraft?.code),
        cabin: cabins.get(text(segment?.id)) || '',
        origin: text(segment?.departure?.iataCode),
        destination: text(segment?.arrival?.iataCode),
        departureDate: departure.date,
        departureTime: departure.time,
        departureTerminal: text(segment?.departure?.terminal),
        arrivalDate: arrival.date,
        arrivalTime: arrival.time,
        arrivalTerminal: text(segment?.arrival?.terminal),
      };
    }).filter((segment) => segment.origin && segment.destination);

    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
      direction: directionOf(index, legs.length),
      duration: text(leg?.duration),
      origin: first?.origin || '',
      destination: last?.destination || '',
      departureDate: first?.departureDate || '',
      arrivalDate: last?.arrivalDate || '',
      stops: Math.max(0, segments.length - 1),
      segments,
    };
  }).filter((leg) => leg.segments.length > 0);
}

/**
 * The trip's legs, from a booking in whichever shape it reached the page:
 *
 *  - `itineraries`, as the bookings API sends them and the order page hands on;
 *  - the raw row's `booking_details.itineraries`;
 *  - a booking saved before legs were kept: rebuilt from the offer stored on it,
 *    or else one leg from the flat fields, which is all such a booking recorded.
 *    That leg is `partial` when it has stops, because its connections were never
 *    saved and must not be drawn as one non-stop flight.
 *
 * @returns {object[]}
 */
export function bookingItineraries(booking) {
  const saved = [booking?.itineraries, booking?.booking_details?.itineraries, booking?.bookingDetails?.itineraries]
    .find((legs) => Array.isArray(legs) && legs.length > 0);
  if (saved) return saved;

  const rebuilt = itinerariesFromOffer(booking?.booking_details?.flight_offer || booking?.flightOffer || booking?.originalOffer);
  if (rebuilt.length > 0) return rebuilt;

  const origin = text(booking?.origin);
  const destination = text(booking?.destination);
  if (!origin || !destination) return [];
  const stops = Number(booking?.stops) || 0;
  return [{
    direction: 'outbound',
    duration: text(booking?.duration),
    origin,
    destination,
    departureDate: text(booking?.departureDate),
    arrivalDate: text(booking?.arrivalDate),
    stops,
    ...(stops > 0 ? { partial: true } : {}),
    segments: [{
      flightNumber: text(booking?.flightNumber),
      carrierCode: text(booking?.airline),
      operatingCarrier: '',
      aircraft: text(booking?.aircraft),
      cabin: text(booking?.cabinClass),
      origin,
      destination,
      departureDate: text(booking?.departureDate),
      departureTime: text(booking?.departureTime),
      departureTerminal: text(booking?.departureTerminal),
      arrivalDate: text(booking?.arrivalDate),
      arrivalTime: text(booking?.arrivalTime),
      arrivalTerminal: text(booking?.arrivalTerminal),
    }],
  }];
}

/** "Outbound", "Return", or "Flight 2" on a multi-city trip; "Flight" for a one-way trip. */
export function legLabel(leg, index, count) {
  if (count <= 1) return 'Flight';
  if (leg?.direction === 'outbound' || index === 0) return 'Outbound';
  if (leg?.direction === 'return' || count === 2) return 'Return';
  return `Flight ${index + 1}`;
}

/**
 * "19:25" -> "7:25 PM". A time already formatted ("07:25 PM", from bookings
 * saved before legs were kept) is passed through.
 */
export function clockTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(value));
  if (!match) return text(value);
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
}

/**
 * The wait between two flights at the connecting airport, e.g. "1h 35m", or ''
 * when either time is missing. Both times are local to that same airport, so
 * their difference is the real wait.
 */
export function layoverBetween(arriving, departing) {
  const toMinutes = (date, time) => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(date));
    const t = /^(\d{2}):(\d{2})$/.exec(text(time));
    if (!d || !t) return null;
    return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])) / 60000;
  };
  const landed = toMinutes(arriving?.arrivalDate, arriving?.arrivalTime);
  const leaves = toMinutes(departing?.departureDate, departing?.departureTime);
  if (landed === null || leaves === null || leaves < landed) return '';
  const wait = leaves - landed;
  return [Math.floor(wait / 60) ? `${Math.floor(wait / 60)}h` : null, wait % 60 ? `${wait % 60}m` : null]
    .filter(Boolean).join(' ') || '0m';
}

/** The day the return leg departs, for a trip with exactly one return leg. */
export function returnDateOf(legs) {
  return Array.isArray(legs) && legs.length === 2 ? legs[1]?.departureDate || '' : '';
}
