import { describe, expect, it } from 'vitest';
import { itinerariesFromOffer, legLabel, returnDateOf, tripTypeOf } from '../../shared/bookingItineraries.js';

const segment = (id, from, to, date, time = '09:00') => ({
  id, carrierCode: 'EK', number: `5${id}`,
  departure: { iataCode: from, at: `${date}T${time}:00` },
  arrival: { iataCode: to, at: `${date}T13:00:00` },
});

const offerOf = (...legs) => ({
  itineraries: legs.map((segments) => ({ duration: 'PT4H', segments })),
});

const labels = (legs) => legs.map((leg, index) => legLabel(leg, index, legs.length));

describe('the trip type of booked flights', () => {
  it('an open-jaw trip is never a return', () => {
    const legs = itinerariesFromOffer(offerOf(
      [segment('1', 'DEL', 'DXB', '2026-11-24')],
      [segment('2', 'LHR', 'DEL', '2026-12-05')],
    ));

    expect(tripTypeOf(legs)).toBe('multiCity');
    expect(legs.map((leg) => leg.direction)).toEqual(['onward', 'onward']);
    expect(labels(legs)).toEqual(['Flight 1', 'Flight 2']);
    expect(returnDateOf(legs)).toBe('');
  });

  it('a trip home again, with a connection out, is a round trip', () => {
    const legs = itinerariesFromOffer(offerOf(
      [segment('1', 'DEL', 'DXB', '2026-11-24'), segment('2', 'DXB', 'LHR', '2026-11-24', '15:00')],
      [segment('3', 'LHR', 'DEL', '2026-12-05')],
    ));

    expect(tripTypeOf(legs)).toBe('roundTrip');
    expect(legs.map((leg) => leg.direction)).toEqual(['outbound', 'return']);
    expect(labels(legs)).toEqual(['Outbound', 'Return']);
    expect(returnDateOf(legs)).toBe('2026-12-05');
  });

  it('three flights are numbered from the first', () => {
    const legs = itinerariesFromOffer(offerOf(
      [segment('1', 'DEL', 'DXB', '2026-11-24')],
      [segment('2', 'DXB', 'LHR', '2026-11-28')],
      [segment('3', 'LHR', 'DEL', '2026-12-05')],
    ));

    expect(tripTypeOf(legs)).toBe('multiCity');
    expect(labels(legs)).toEqual(['Flight 1', 'Flight 2', 'Flight 3']);
    expect(returnDateOf(legs)).toBe('');
  });

  it('one flight is one way', () => {
    const legs = itinerariesFromOffer(offerOf([segment('1', 'DEL', 'BOM', '2026-11-24')]));

    expect(tripTypeOf(legs)).toBe('oneWay');
    expect(labels(legs)).toEqual(['Flight']);
  });

  it('legs saved without a direction are judged by where they go', () => {
    const home = [{ origin: 'JFK', destination: 'LHR', departureDate: '2026-11-01' }, { origin: 'LHR', destination: 'JFK', departureDate: '2026-11-09' }];
    const openJaw = [{ origin: 'JFK', destination: 'LHR', departureDate: '2026-11-01' }, { origin: 'CDG', destination: 'JFK', departureDate: '2026-11-09' }];

    expect(tripTypeOf(home)).toBe('roundTrip');
    expect(returnDateOf(home)).toBe('2026-11-09');
    expect(tripTypeOf(openJaw)).toBe('multiCity');
    expect(returnDateOf(openJaw)).toBe('');
  });

  it('a saved return leg stays a return', () => {
    const saved = [{ direction: 'outbound', origin: 'JFK', destination: 'LHR' }, { direction: 'return', origin: 'LHR', destination: 'JFK', departureDate: '2026-11-09' }];

    expect(tripTypeOf(saved)).toBe('roundTrip');
    expect(labels(saved)).toEqual(['Outbound', 'Return']);
  });
});
