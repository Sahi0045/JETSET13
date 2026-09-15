import { describe, expect, it } from 'vitest';
import {
  bookingItineraries,
  clockTime,
  itinerariesFromOffer,
  layoverBetween,
  legLabel,
  returnDateOf,
  splitLocalDateTime,
} from '../../shared/bookingItineraries.js';

/**
 * A booked trip's legs and flights.
 *
 * Every page after payment read `itineraries[0]` of the offer and nothing more:
 * a round trip's return flight appeared nowhere, and a connection showed as its
 * first flight number beside its last arrival.
 */

const roundTrip = {
  itineraries: [
    {
      duration: 'PT10H40M',
      segments: [
        { id: '1', departure: { iataCode: 'JFK', terminal: '1', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'KEF', at: '2026-11-16T05:05:00' }, carrierCode: 'FI', number: '614', aircraft: { code: '7M9' }, operating: { carrierCode: 'FI' } },
        { id: '2', departure: { iataCode: 'KEF', at: '2026-11-16T07:40:00' }, arrival: { iataCode: 'LHR', terminal: '2', at: '2026-11-16T11:05:00' }, carrierCode: 'FI', number: '450', aircraft: { code: '76W' }, operating: { carrierCode: 'BA' } },
      ],
    },
    {
      duration: 'PT8H10M',
      segments: [
        { id: '3', departure: { iataCode: 'LHR', terminal: '2', at: '2026-11-22T13:00:00' }, arrival: { iataCode: 'JFK', terminal: '7', at: '2026-11-22T16:10:00' }, carrierCode: 'BA', number: '117', aircraft: { code: '744' }, operating: { carrierCode: 'BA' } },
      ],
    },
  ],
  travelerPricings: [{ fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY' }, { segmentId: '2', cabin: 'ECONOMY' }, { segmentId: '3', cabin: 'PREMIUM_ECONOMY' }] }],
};

describe('legs from an offer', () => {
  const legs = itinerariesFromOffer(roundTrip);

  it('keeps the return leg', () => {
    expect(legs.map((leg) => [leg.direction, leg.origin, leg.destination, leg.stops, leg.departureDate])).toEqual([
      ['outbound', 'JFK', 'LHR', 1, '2026-11-15'],
      ['return', 'LHR', 'JFK', 0, '2026-11-22'],
    ]);
    expect(returnDateOf(legs)).toBe('2026-11-22');
  });

  it('keeps every flight of a connection with its own number, times and terminals', () => {
    expect(legs[0].segments).toEqual([
      {
        flightNumber: 'FI614', carrierCode: 'FI', operatingCarrier: '', aircraft: '7M9', cabin: 'ECONOMY',
        origin: 'JFK', destination: 'KEF',
        departureDate: '2026-11-15', departureTime: '19:25', departureTerminal: '1',
        arrivalDate: '2026-11-16', arrivalTime: '05:05', arrivalTerminal: '',
      },
      {
        flightNumber: 'FI450', carrierCode: 'FI', operatingCarrier: 'BA', aircraft: '76W', cabin: 'ECONOMY',
        origin: 'KEF', destination: 'LHR',
        departureDate: '2026-11-16', departureTime: '07:40', departureTerminal: '',
        arrivalDate: '2026-11-16', arrivalTime: '11:05', arrivalTerminal: '2',
      },
    ]);
    expect(legs[1].segments[0]).toMatchObject({ flightNumber: 'BA117', cabin: 'PREMIUM_ECONOMY', arrivalTerminal: '7' });
  });

  it('invents nothing when there is no offer, or a segment has no airports', () => {
    expect(itinerariesFromOffer(null)).toEqual([]);
    expect(itinerariesFromOffer({ itineraries: [{ segments: [{ carrierCode: 'AI' }] }] })).toEqual([]);
    expect(returnDateOf(itinerariesFromOffer({ itineraries: [roundTrip.itineraries[0]] }))).toBe('');
  });

  it('reads airport-local times as written, with no zone applied', () => {
    expect(splitLocalDateTime('2026-11-15T23:55:00')).toEqual({ date: '2026-11-15', time: '23:55' });
    expect(splitLocalDateTime(undefined)).toEqual({ date: '', time: '' });
  });
});

describe('legs from a booking, in any shape', () => {
  const legs = itinerariesFromOffer(roundTrip);

  it('takes the saved legs first, from the API shape or the raw row', () => {
    expect(bookingItineraries({ itineraries: legs, origin: 'X', destination: 'Y' })).toBe(legs);
    expect(bookingItineraries({ booking_details: { itineraries: legs } })).toBe(legs);
  });

  it('rebuilds them from the offer stored on an older booking', () => {
    expect(bookingItineraries({ booking_details: { flight_offer: roundTrip } })).toHaveLength(2);
  });

  it('falls back to the flat fields, and says so when a connection was never saved', () => {
    const flat = bookingItineraries({ origin: 'DEL', destination: 'BOM', departureDate: '2026-11-15', flightNumber: 'AI101', departureTime: '07:25 PM', stops: 1 });
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ origin: 'DEL', destination: 'BOM', partial: true });
    expect(flat[0].segments[0]).toMatchObject({ flightNumber: 'AI101', departureTime: '07:25 PM' });
    expect(bookingItineraries({ origin: 'DEL', destination: 'BOM' })[0].partial).toBeUndefined();
    expect(bookingItineraries({})).toEqual([]);
  });
});

describe('how a leg is printed', () => {
  it('names legs for what they are', () => {
    expect(legLabel({ direction: 'outbound' }, 0, 1)).toBe('Flight');
    expect(legLabel({ direction: 'outbound' }, 0, 2)).toBe('Outbound');
    expect(legLabel({ direction: 'return' }, 1, 2)).toBe('Return');
    expect(legLabel({ direction: 'onward' }, 2, 3)).toBe('Flight 3');
  });

  it('prints a twelve-hour clock, and passes a formatted time through', () => {
    expect(clockTime('19:25')).toBe('7:25 PM');
    expect(clockTime('00:05')).toBe('12:05 AM');
    expect(clockTime('12:00')).toBe('12:00 PM');
    expect(clockTime('07:25 PM')).toBe('07:25 PM');
    expect(clockTime('')).toBe('');
  });

  it('works out the wait at a connection, across midnight too', () => {
    const [first, second] = itinerariesFromOffer(roundTrip)[0].segments;
    expect(layoverBetween(first, second)).toBe('2h 35m');
    expect(layoverBetween(
      { arrivalDate: '2026-11-16', arrivalTime: '23:30' },
      { departureDate: '2026-11-17', departureTime: '01:00' },
    )).toBe('1h 30m');
    expect(layoverBetween({ arrivalDate: '2026-11-16' }, { departureDate: '2026-11-16', departureTime: '01:00' })).toBe('');
  });
});
