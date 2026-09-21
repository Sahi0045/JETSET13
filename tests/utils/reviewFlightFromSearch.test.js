import { describe, expect, it } from 'vitest';
import { reviewFlightFromSearch } from '../../frontend/src/utils/reviewFlightFromSearch';

/**
 * The review page reads a flight in the results page's shape, not the API's.
 *
 * When the airline withdraws a fare, the review page fetches replacements
 * itself and gets the API's shape back. Handed over untouched, `airline` was a
 * string where the page expected `{code, name, logo}` - so the flight the
 * customer had just picked was drawn as "Jetsetters Airlines", the page's
 * fallback. Caught in a browser, guarded here.
 */

// One entry of /api/flights/search's `data`, trimmed to the fields that matter.
const apiFlight = (over = {}) => ({
  id: '3',
  airline: 'Hankook Air US',
  airlineCode: 'H1',
  flightNumber: 'H1-860',
  departure: { time: '18:25', airport: 'DEL', terminal: '1D', date: '2026-10-20' },
  arrival: { time: '21:05', airport: 'BOM', terminal: '1', date: '2026-10-20' },
  duration: '2h 40m',
  durationMinutes: 160,
  stops: 0,
  cabin: 'ECONOMY',
  numberOfBookableSeats: 9,
  price: { amount: 225.4, total: '225.40', grandTotal: '225.40', base: '180.00', currency: 'USD', fees: [] },
  originalOffer: {
    price: { total: '225.40', grandTotal: '225.40', base: '180.00', currency: 'USD' },
    travelerPricings: [{ travelerType: 'ADULT' }],
    itineraries: [{
      segments: [{
        carrierCode: 'H1',
        number: '860',
        departure: { iataCode: 'DEL', terminal: '1D', at: '2026-10-20T18:25:00' },
        arrival: { iataCode: 'BOM', terminal: '1', at: '2026-10-20T21:05:00' },
        aircraft: { code: '738' },
        duration: 'PT2H40M',
      }],
    }],
    _ama: { segments: [{ rbd: 'K' }] },
  },
  ...over,
});

describe('a search result converted for the review page', () => {
  // The bug itself: the page reads flightData.airline.name.
  it('gives the airline as an object, not a string', () => {
    const flight = reviewFlightFromSearch(apiFlight());
    expect(flight.airline).toEqual(expect.objectContaining({ code: 'H1', name: 'Hankook Air US' }));
    expect(flight.airline.logo).toContain('H1');
  });

  it('keeps the offer that actually gets priced and booked', () => {
    const source = apiFlight();
    expect(reviewFlightFromSearch(source).originalOffer).toBe(source.originalOffer);
  });

  it('carries the fare across whole, base included', () => {
    const flight = reviewFlightFromSearch(apiFlight());
    expect(flight.price).toEqual(expect.objectContaining({
      amount: 225.4, grandTotal: '225.40', base: '180.00', currency: 'USD',
    }));
  });

  it('names the cities with the lookup it is given', () => {
    const flight = reviewFlightFromSearch(apiFlight(), (code) => ({ DEL: 'New Delhi', BOM: 'Mumbai' }[code]));
    expect(flight.departure.cityName).toBe('New Delhi');
    expect(flight.arrival.cityName).toBe('Mumbai');
    expect(flight.departure.terminal).toBe('1D');
  });

  // A non-stop draws from the whole journey; the page's own fallback covers it.
  it('leaves segments empty for a non-stop', () => {
    expect(reviewFlightFromSearch(apiFlight()).segments).toEqual([]);
  });

  // A flight with a stop must draw both legs, from the offer's own segments.
  it('rebuilds both legs of a flight with a stop', () => {
    const twoLegs = apiFlight({
      stops: 1,
      originalOffer: {
        ...apiFlight().originalOffer,
        itineraries: [{
          segments: [
            {
              carrierCode: 'SG',
              number: '2451',
              departure: { iataCode: 'DEL', terminal: '1', at: '2026-10-20T14:00:00' },
              arrival: { iataCode: 'GOP', at: '2026-10-20T15:45:00' },
              aircraft: { code: '738' },
            },
            {
              carrierCode: 'SG',
              number: '197',
              departure: { iataCode: 'GOP', at: '2026-10-20T18:40:00' },
              arrival: { iataCode: 'BOM', terminal: '1', at: '2026-10-20T20:55:00' },
              aircraft: { code: '738' },
            },
          ],
        }],
      },
    });
    const flight = reviewFlightFromSearch(twoLegs);
    expect(flight.segments).toHaveLength(2);
    expect(flight.segments[0].departure.airport).toBe('DEL');
    expect(flight.segments[0].arrival.airport).toBe('GOP');
    expect(flight.segments[1].arrival.airport).toBe('BOM');
    expect(flight.segments[0].flightNumber).toBe('SG 2451');
    expect(flight.segments[0].airline).toEqual(expect.objectContaining({ code: 'SG' }));
  });

  // Nothing bookable, nothing to hand the page.
  it('refuses a result with no offer on it', () => {
    expect(reviewFlightFromSearch({ airline: 'Spicejet' })).toBeNull();
    expect(reviewFlightFromSearch(null)).toBeNull();
  });
});
