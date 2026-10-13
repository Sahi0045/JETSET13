import { describe, expect, it } from 'vitest';
import { itinerariesFromOffer, tripRewardDueAt } from '../../shared/bookingItineraries.js';

const leg = (...arrivals) => ({ segments: arrivals.map((arrivalDate) => ({ arrivalDate })) });

describe('when a trip reward pays out', () => {
  it('is 00:00 UTC two days after the last flight lands', () => {
    expect(tripRewardDueAt([leg('2026-11-16')])).toBe('2026-11-18T00:00:00.000Z');
  });

  it('reads the last flight of the last leg on a round trip', () => {
    expect(tripRewardDueAt([leg('2026-11-15', '2026-11-16'), leg('2026-11-24', '2026-11-25')])).toBe('2026-11-27T00:00:00.000Z');
  });

  it('rolls over the end of a month and of a year', () => {
    expect(tripRewardDueAt([leg('2026-11-30')])).toBe('2026-12-02T00:00:00.000Z');
    expect(tripRewardDueAt([leg('2026-12-31')])).toBe('2027-01-02T00:00:00.000Z');
  });

  it('reads an offer as the order route does', () => {
    const offer = { itineraries: [{ segments: [{ departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614' }] }] };
    expect(tripRewardDueAt(itinerariesFromOffer(offer))).toBe('2026-11-18T00:00:00.000Z');
  });

  // The arrival date is the page's own copy and is never checked against the
  // airline; the departure date is (checkout compares it with the flights sold).
  it('never pays before two days after the last flight leaves, whatever arrival the page sent', () => {
    const flight = (departureDate, arrivalDate) => ({ segments: [{ departureDate, arrivalDate }] });
    expect(tripRewardDueAt([flight('2026-11-15', '2020-01-01')])).toBe('2026-11-17T00:00:00.000Z');
    expect(tripRewardDueAt([flight('2026-11-15', '2026-11-16')])).toBe('2026-11-18T00:00:00.000Z');
  });

  it('reads an offer whose arrival was edited into the past as due two days after the departure', () => {
    const offer = { itineraries: [{ segments: [{ departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2020-01-01T06:10:00' }, carrierCode: 'FI', number: '614' }] }] };
    expect(tripRewardDueAt(itinerariesFromOffer(offer))).toBe('2026-11-17T00:00:00.000Z');
  });

  it('counts from the departure of a flight that lands the calendar day before it leaves', () => {
    const offer = { itineraries: [{ segments: [{ departure: { iataCode: 'GUM', at: '2026-11-17T07:50:00' }, arrival: { iataCode: 'HNL', at: '2026-11-16T19:10:00' }, carrierCode: 'UA', number: '200' }] }] };
    expect(tripRewardDueAt(itinerariesFromOffer(offer))).toBe('2026-11-19T00:00:00.000Z');
  });

  it('gives no date when the last arrival cannot be read, even with a departure date', () => {
    expect(tripRewardDueAt([{ segments: [{ departureDate: '2026-11-15', arrivalDate: '' }] }])).toBeNull();
  });

  it('gives no date for an itinerary it cannot read', () => {
    expect(tripRewardDueAt([])).toBeNull();
    expect(tripRewardDueAt(null)).toBeNull();
    expect(tripRewardDueAt([{ segments: [] }])).toBeNull();
    expect(tripRewardDueAt([leg('')])).toBeNull();
    expect(tripRewardDueAt([leg('2026-02-30')])).toBeNull();
  });
});
