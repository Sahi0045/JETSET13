import { describe, expect, it } from 'vitest';
import { toDisplayFlights } from '../../frontend/src/Pages/Common/flights/flightOffers.js';
import { bookingHandoffState } from '../../frontend/src/Pages/Common/flights/bookingHandoff.js';
import offers from '../fixtures/flights/searchOffers.json';

describe('toDisplayFlights', () => {
  it('keeps the original offer and names cities from the map', () => {
    const [flight] = toDisplayFlights(offers, { cityMap: { DEL: 'Delhi', BOM: 'Mumbai' } });

    expect(flight.originalOffer).toEqual(offers[0].originalOffer);
    expect(flight.departure.cityName).toBe('Delhi');
    expect(flight.arrival.cityName).toBe('Mumbai');
  });

  it('falls back to codes without maps', () => {
    const [flight] = toDisplayFlights(offers);

    expect(flight.departure.cityName).toBe('DEL');
  });

  it('answers an empty list for no data', () => {
    expect(toDisplayFlights(undefined)).toEqual([]);
  });
});

describe('bookingHandoffState', () => {
  const searchData = { from: 'DEL', to: 'BOM', departDate: '2026-11-23', adults: 2 };

  it('bookingHandoffState matches the search page', () => {
    const [flight] = toDisplayFlights(offers);
    const state = bookingHandoffState(flight, searchData, null);

    expect(Object.keys(state).sort()).toEqual(['attemptId', 'flightData', 'searchData']);
    expect(state.flightData).toBe(flight);
    expect(state.searchData).toBe(searchData);
    expect(state.attemptId).toMatch(/\S/);
  });

  it('carries the fare check when there is one', () => {
    const state = bookingHandoffState({ id: 'a' }, searchData, { a: 1 });

    expect(state.fareCheck).toEqual({ a: 1 });
  });

  it('makes a new attempt id each time', () => {
    expect(bookingHandoffState({}, searchData, null).attemptId)
      .not.toBe(bookingHandoffState({}, searchData, null).attemptId);
  });
});
