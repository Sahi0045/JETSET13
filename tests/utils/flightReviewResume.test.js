import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFlightReview, readFlightReview, saveFlightReview } from '../../frontend/src/utils/flightReviewResume.js';

/**
 * The flight a signed-out visitor picked survives the trip through login.
 *
 * Guest flight booking is switched off, so the review page sends a signed-out
 * visitor to log in. The flight lives only in router state, which that trip -
 * and Google's redirect - does not carry.
 */

const flightData = { id: '1', airline: { code: 'LH' }, originalOffer: { travelerPricings: [{ travelerType: 'ADULT' }] } };
const searchData = { from: 'FRA', to: 'JFK', departDate: '2026-10-04', adults: 1 };

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the flight kept while a visitor logs in', () => {
  it('comes back after the trip through login', () => {
    saveFlightReview({ flightData, searchData });
    expect(readFlightReview()).toEqual({ flightData, searchData, attemptId: null });
  });

  // Carried so the traveller draft still matches on the other side of login -
  // one of the four cases that draft exists for. A random id, not a detail.
  it('carries the booking attempt id, so the traveller draft still matches', () => {
    saveFlightReview({ flightData, searchData, attemptId: 'attempt-a' });
    expect(readFlightReview().attemptId).toBe('attempt-a');
  });

  it('keeps the flight and the search, never traveller details', () => {
    saveFlightReview({ flightData, searchData, passengerData: [{ firstName: 'Ann', passportNumber: 'X1234567' }] });
    const kept = JSON.stringify(readFlightReview());
    expect(kept).not.toContain('X1234567');
    expect(kept).not.toContain('Ann');
  });

  it('keeps nothing when there is no flight', () => {
    saveFlightReview({ searchData });
    saveFlightReview(null);
    expect(readFlightReview()).toBeNull();
  });

  it('is gone once cleared', () => {
    saveFlightReview({ flightData, searchData });
    clearFlightReview();
    expect(readFlightReview()).toBeNull();
  });

  it('reads corrupt storage as nothing kept', () => {
    sessionStorage.setItem('jt_flight_review', '{not json');
    expect(readFlightReview()).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveFlightReview({ flightData })).not.toThrow();
    expect(readFlightReview()).toBeNull();
    expect(() => clearFlightReview()).not.toThrow();
  });
});
