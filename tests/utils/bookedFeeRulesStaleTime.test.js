import { describe, expect, it } from 'vitest';
import { bookedFeeRulesStaleTime } from '../../frontend/src/utils/bookedFeeRules.js';

// One Amadeus timeout must not leave "not available" on the page for half an hour.
describe("a booked trip's fee table answer", () => {
  it('is kept for half an hour when the airline gave a table', () => {
    expect(bookedFeeRulesStaleTime({ state: { data: { currency: 'USD' } } })).toBe(30 * 60 * 1000);
  });

  it('is asked again next time when there was none', () => {
    expect(bookedFeeRulesStaleTime({ state: { data: null } })).toBe(0);
  });
});
