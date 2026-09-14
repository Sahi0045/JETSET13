/**
 * Pure pieces of the flight results page: the date strip, the filters and the
 * failure message. Kept out of the component so they can be tested without
 * rendering a page of 1,600 lines.
 */

import { formatDateToISO, getSafeDate, getTodayDate } from '../../../utils/dateUtils';
import { legsOf, maxStops } from './flightSort';

/** A local calendar date `days` after another, both YYYY-MM-DD. */
const addDays = (isoDate, days) => {
  const date = getSafeDate(isoDate);
  date.setDate(date.getDate() + days);
  return formatDateToISO(date);
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
    const checkedWeight = flight.baggage?.checked?.weight || 0;
    if (filters.baggage === 'included' && checkedWeight <= 0) return false;
    if (filters.baggage === 'cabin_only' && checkedWeight > 0) return false;
  }

  if (filters.refundable === 'yes' && !flight.refundable) return false;
  if (filters.refundable === 'no' && flight.refundable) return false;

  if (filters.originAirports?.length > 0 && !filters.originAirports.includes(flight.departure?.airport)) return false;
  if (filters.destAirports?.length > 0 && !filters.destAirports.includes(flight.arrival?.airport)) return false;

  return true;
};
