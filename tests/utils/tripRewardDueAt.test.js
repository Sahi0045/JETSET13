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

  it('gives no date for an itinerary it cannot read', () => {
    expect(tripRewardDueAt([])).toBeNull();
    expect(tripRewardDueAt(null)).toBeNull();
    expect(tripRewardDueAt([{ segments: [] }])).toBeNull();
    expect(tripRewardDueAt([leg('')])).toBeNull();
    expect(tripRewardDueAt([leg('2026-02-30')])).toBeNull();
  });
});
