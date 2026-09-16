import { beforeEach, describe, expect, it } from 'vitest';
import { matchesFilters } from '../../frontend/src/Pages/Common/flights/searchResults.js';
import { formatCheckedBag } from '../../frontend/src/utils/baggage';
import {
  BOOKING_DRAFT_MAX_AGE_MS,
  clearStaleStoredBookings,
} from '../../frontend/src/utils/bookingStorage';

/**
 * Two customer-facing defects from the 16 Sep audit.
 */

const anyFilters = {
  price: [0, 50000],
  stops: 'any',
  airlines: [],
  departureTime: 'any',
  baggage: 'any',
  refundable: 'any',
  originAirports: [],
  destAirports: [],
};
const priceOf = (f) => f.price.amount;

const flightWith = (checked) => ({
  price: { amount: 100 },
  airline: { name: 'IndiGo' },
  stops: 0,
  departure: { time: '08:00' },
  arrival: {},
  baggage: { checked, cabin: null },
});

/**
 * An allowance is a weight OR a piece count - `{weight, weightUnit}` or
 * `{quantity}` - and which one an airline files varies by market. The filter
 * read only `.weight`, so every piece-based fare scored zero: "Included"
 * removed the very fares whose card reads "1 Piece check-in", and "Cabin only"
 * kept them. `utils/baggage.js` exists precisely so no surface can drift from
 * another, and FlightCard already used it.
 */
describe('the "Baggage: Included" filter', () => {
  it('keeps a piece-based fare, which the card advertises as included', () => {
    const pieceBased = flightWith({ quantity: 1 });

    expect(formatCheckedBag(pieceBased.baggage.checked), 'the card says this').toBe('1 Piece');
    expect(matchesFilters(pieceBased, { ...anyFilters, baggage: 'included' }, priceOf)).toBe(true);
  });

  it('does not call a piece-based fare "cabin only"', () => {
    const pieceBased = flightWith({ quantity: 2 });

    expect(matchesFilters(pieceBased, { ...anyFilters, baggage: 'cabin_only' }, priceOf)).toBe(false);
  });

  it('still keeps a weight-based fare under "included"', () => {
    const weightBased = flightWith({ weight: 15, weightUnit: 'KG' });

    expect(matchesFilters(weightBased, { ...anyFilters, baggage: 'included' }, priceOf)).toBe(true);
    expect(matchesFilters(weightBased, { ...anyFilters, baggage: 'cabin_only' }, priceOf)).toBe(false);
  });

  it('still excludes a fare with no checked allowance at all', () => {
    const none = flightWith(null);
    const zeroPieces = flightWith({ quantity: 0 });

    expect(matchesFilters(none, { ...anyFilters, baggage: 'included' }, priceOf)).toBe(false);
    expect(matchesFilters(none, { ...anyFilters, baggage: 'cabin_only' }, priceOf)).toBe(true);
    expect(matchesFilters(zeroPieces, { ...anyFilters, baggage: 'included' }, priceOf)).toBe(false);
  });
});

/**
 * `pendingFlightBooking` holds every traveller's name, date of birth and
 * passport number. `clearStoredBookings` runs on logout and once an order has
 * answered - neither of which happens to a customer who reaches ARC Pay and
 * closes the tab, so it stayed in that browser indefinitely. On a shared
 * computer the next person could read it.
 */
describe('clearStaleStoredBookings', () => {
  const draft = (savedAt) => JSON.stringify({
    passengerData: [{ passportNumber: 'X1234567', dateOfBirth: '1990-01-01' }],
    ...(savedAt === undefined ? {} : { savedAt }),
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('removes a draft left behind by an abandoned checkout', () => {
    localStorage.setItem('pendingFlightBooking', draft(Date.now() - BOOKING_DRAFT_MAX_AGE_MS - 1000));

    expect(clearStaleStoredBookings()).toBe(true);
    expect(localStorage.getItem('pendingFlightBooking')).toBeNull();
  });

  // The cancelled-payment return reads this draft back to restore the flight
  // and the travellers, so a fresh one must survive.
  it('keeps a draft that is still within the payment round trip', () => {
    localStorage.setItem('pendingFlightBooking', draft(Date.now() - 60_000));

    expect(clearStaleStoredBookings()).toBe(false);
    expect(localStorage.getItem('pendingFlightBooking')).not.toBeNull();
  });

  it('removes a draft written before it carried a timestamp', () => {
    localStorage.setItem('pendingFlightBooking', draft(undefined));

    expect(clearStaleStoredBookings()).toBe(true);
    expect(localStorage.getItem('pendingFlightBooking')).toBeNull();
  });

  it('removes an unreadable draft rather than leaving it', () => {
    localStorage.setItem('pendingFlightBooking', 'not json');

    expect(clearStaleStoredBookings()).toBe(true);
    expect(localStorage.getItem('pendingFlightBooking')).toBeNull();
  });

  it('leaves everything that is not a booking draft', () => {
    localStorage.setItem('preferredCurrency', 'EUR');
    localStorage.setItem('pendingFlightBooking', draft(undefined));

    clearStaleStoredBookings();

    expect(localStorage.getItem('preferredCurrency')).toBe('EUR');
  });

  it('never throws when storage is blocked', () => {
    expect(() => clearStaleStoredBookings({
      getItem: () => { throw new Error('SecurityError'); },
      removeItem: () => {},
    })).not.toThrow();
  });
});
