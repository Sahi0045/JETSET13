/**
 * Pure pieces of the flight results page: the date strip, the filters and the
 * failure message. Kept out of the component so they can be tested without
 * rendering a page of 1,600 lines.
 */

import { formatDateToISO, getSafeDate, getTodayDate } from '../../../utils/dateUtils';
import { hasCheckedBag } from '../../../utils/baggage';
import { legsOf, maxStops } from './flightSort';

/** A local calendar date `days` after another, both YYYY-MM-DD. */
const addDays = (isoDate, days) => {
  const date = getSafeDate(isoDate);
  date.setDate(date.getDate() + days);
  return formatDateToISO(date);
};

/**
 * "Sun, Nov 15" for a YYYY-MM-DD date. Read in UTC because the date is the
 * airport's own calendar day: parsed as local midnight it is the day before
 * anywhere west of Greenwich.
 */
export const legDateLabel = (isoDate) => {
  const day = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return new Date(`${day}T00:00:00Z`)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/**
 * "+1" when a leg lands on a later calendar day than it left, "-1" when it lands
 * the day before (westward over the date line), "" on the same day. Both dates
 * are local to their airports, which is what a boarding pass shows.
 */
export const arrivalDayOffset = (departureDate, arrivalDate) => {
  const from = Date.parse(`${String(departureDate || '').slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${String(arrivalDate || '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '';
  const days = Math.round((to - from) / 86400000);
  return days === 0 ? '' : `${days > 0 ? '+' : ''}${days}`;
};

/** The seven dates the strip shows: three either side of `centerIso`. */
export const stripDates = (centerIso) => [-3, -2, -1, 0, 1, 2, 3]
  .map((offset) => addDays(centerIso || getTodayDate(), offset));

const stripDay = (isoDate, selectedIso, today) => {
  const date = getSafeDate(isoDate);
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    day: date.toLocaleDateString('en-US', { weekday: 'short' }),
    isoDate,
    price: null,
    currency: null,
    isLowestPrice: false,
    selected: Boolean(selectedIso) && isoDate === selectedIso,
    isWeekend: [0, 6].includes(date.getDay()),
    isPast: isoDate < today,
  };
};

/**
 * The date strip around a date.
 *
 * Every date is a local calendar date built through getSafeDate, so the label
 * and the date searched are the same day wherever the customer is.
 */
export const buildDateStrip = (centerIso, { selectedIso = centerIso, today = getTodayDate() } = {}) =>
  stripDates(centerIso).map((isoDate) => stripDay(isoDate, selectedIso, today));

/**
 * The strip moved by `days` (the week arrows).
 *
 * This parsed each date with `new Date("YYYY-MM-DD")`, which is UTC midnight,
 * then stepped it in local time and wrote it back with toISOString. West of
 * UTC the label and the search came apart by a day: a button reading
 * "Sat, Sep 26" searched 2026-09-27. It also carried `selected` over by
 * position, marking a date in the new week that nobody had searched. Only the
 * date actually searched is selected now, so a week without it has none.
 */
export const shiftDateStrip = (strip, days, { selectedIso, today = getTodayDate() } = {}) =>
  strip.map((day) => stripDay(addDays(day.isoDate, days), selectedIso, today));

/**
 * A search moved to a new departure date, with its return moved by the same
 * number of days.
 *
 * A date picked on the strip or the fare calendar changed only the departure,
 * so a day after the return searched a trip that came home before it left.
 * The trip keeps its length instead.
 */
export const withDepartureDate = (search, isoDate) => {
  if (!search?.returnDate || !search?.departDate) return { ...search, departDate: isoDate };
  // Both at local noon, so a daylight-saving change still rounds to whole days.
  const days = Math.round((getSafeDate(isoDate) - getSafeDate(search.departDate)) / 86400000);
  return { ...search, departDate: isoDate, returnDate: addDays(search.returnDate, days) };
};

/**
 * What to tell the customer when a search fails.
 *
 * A refused request (4xx) says why in words the customer can act on - "Each
 * infant travels on an adult's lap..." - so it is shown as the server wrote
 * it. Anything else is ours or the airlines', and the server's wording for it
 * is not for customers. `status` is null when the request never got an answer.
 */
export const searchFailureMessage = (status, body) => {
  const said = typeof body?.error === 'string' ? body.error.trim() : '';
  if (status >= 400 && status < 500 && said) return said;
  if (status === 503) return 'Flight search is busy right now. Please try again in a moment.';
  if (status === 504) return 'The airlines took too long to answer. Please try again.';
  if (!status) return "We couldn't reach flight search. Please check your connection and try again.";
  return "We couldn't load flights just now. Please try again.";
};

/**
 * The sidebar filters with nothing narrowed: every price from the lowest to
 * the highest of these results, in the currency they are shown in.
 *
 * Both reset buttons set the price to a fixed 0-50,000, in whatever currency
 * the visitor was browsing in. In rupees a USD 700 fare is past 50,000, so
 * "Reset all filters" hid the very flights it was meant to bring back.
 *
 * @param {{ min: number, max: number }} bounds the results' price range
 */
export const filtersWithin = (bounds) => ({
  price: [bounds.min, bounds.max],
  stops: 'any',
  airlines: [],
  departureTime: 'any',
  baggage: 'any',
  refundable: 'any',
  originAirports: [],
  destAirports: [],
});

/**
 * The price slider's step for a range: about fifty steps across it, on a round
 * number. It moved in 500s whatever the fares, so under $500 the slider had
 * two positions - nothing and everything.
 */
export const priceStep = (max) => [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
  .find((step) => step >= (Number(max) || 0) / 50) ?? 5000;

/**
 * What to say about the seats left on a fare, or null. Amadeus reports at most
 * 9 bookable seats, so 9 means "9 or more" - it read "9 seats left", in red, on
 * flights with plenty of room.
 *
 * @returns {{ text: string, urgent: boolean }|null}
 */
export const seatsLeftLabel = (seats) => {
  const n = Number(seats);
  if (!Number.isInteger(n) || n <= 0) return null;
  if (n >= 9) return { text: '9+ seats', urgent: false };
  return { text: `${n} seat${n === 1 ? '' : 's'} left`, urgent: true };
};

const DEPARTURE_WINDOWS = {
  early_morning: [0, 6],
  morning: [6, 12],
  afternoon: [12, 18],
  evening: [18, 21],
  night: [21, 24],
};

/** The hour of "14:05" or "02:05 PM", or null when there is no time to read. */
const hourOf = (time) => {
  const match = String(time ?? '').match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10) % 24;
  const meridiem = match[2]?.toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour;
};

/**
 * Whether a flight passes the sidebar filters.
 *
 * Stops and departure time apply to every leg. They looked only at the
 * outbound, so a round trip with a connecting return passed "Non-stop", and
 * one coming back at midnight passed "Morning".
 *
 * @param {(flight: object) => number} priceOf the fare in the slider's currency
 */
export const matchesFilters = (flight, filters, priceOf) => {
  const price = priceOf(flight);
  if (price < filters.price[0] || price > filters.price[1]) return false;

  if (filters.stops !== 'any') {
    const wanted = parseInt(filters.stops, 10);
    const worst = maxStops(flight);
    if (wanted === 2 && worst < 2) return false;           // "2+ stops"
    if (wanted === 1 && worst > 1) return false;           // "up to 1 stop"
    if (wanted === 0 && worst !== 0) return false;         // "non-stop"
  }

  if (filters.airlines.length > 0 && !filters.airlines.includes(flight.airline?.name)) return false;

  const window = DEPARTURE_WINDOWS[filters.departureTime];
  if (window) {
    for (const leg of legsOf(flight)) {
      const hour = hourOf(leg.departure?.time);
      if (hour !== null && (hour < window[0] || hour >= window[1])) return false;
    }
  }

  if (filters.baggage !== 'any') {
    // An allowance is a weight OR a piece count - `{weight, weightUnit}` or
    // `{quantity}` - and which one an airline files varies by market. Reading
    // only `.weight` scored every piece-based fare as zero, so "Included"
    // removed the very fares whose card reads "1 Piece check-in" and
    // "Cabin only" kept them. utils/baggage.js exists so no surface can drift
    // from another; FlightCard already uses it.
    const included = hasCheckedBag(flight.baggage?.checked);
    if (filters.baggage === 'included' && !included) return false;
    if (filters.baggage === 'cabin_only' && included) return false;
  }

  if (filters.refundable === 'yes' && !flight.refundable) return false;
  if (filters.refundable === 'no' && flight.refundable) return false;

  if (filters.originAirports?.length > 0 && !filters.originAirports.includes(flight.departure?.airport)) return false;
  if (filters.destAirports?.length > 0 && !filters.destAirports.includes(flight.arrival?.airport)) return false;

  return true;
};
