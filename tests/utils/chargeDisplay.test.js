import { describe, expect, it } from 'vitest';
import { approximateCharge, CHARGE_CURRENCY, formatUsd } from '../../frontend/src/utils/chargeDisplay.js';

/**
 * The review page quoted ₹41,820 for a charge of USD 501.75, from browser rates
 * that were the hardcoded table whenever the live fetch failed, and never said
 * the card is charged in dollars.
 */
describe('formatUsd', () => {
  it('says which dollar', () => {
    expect(formatUsd(501.75)).toBe('US$501.75');
    expect(formatUsd(1234.5)).toBe('US$1,234.50');
  });

  it('never prints NaN', () => {
    expect(formatUsd(undefined)).toBe('US$0.00');
    expect(formatUsd('abc')).toBe('US$0.00');
  });
});

describe('approximateCharge', () => {
  it('is the charge settled in', () => {
    expect(CHARGE_CURRENCY).toBe('USD');
  });

  it('converts with a live rate', () => {
    expect(approximateCharge(501.75, { currency: 'INR', rate: 83.5, ratesLive: true }))
      .toEqual({ currency: 'INR', amount: 501.75 * 83.5 });
  });

  // The page used to present the hardcoded 83.35 as if it were today's rate.
  it('shows nothing converted from a rate that is not live', () => {
    expect(approximateCharge(501.75, { currency: 'INR', rate: 83.35, ratesLive: false })).toBeNull();
    expect(approximateCharge(501.75, { currency: 'INR', rate: 83.35 })).toBeNull();
  });

  it('adds nothing for a visitor already browsing in dollars', () => {
    expect(approximateCharge(501.75, { currency: 'USD', rate: 1, ratesLive: true })).toBeNull();
  });

  it('shows nothing for a currency it has no rate for', () => {
    expect(approximateCharge(501.75, { currency: 'XYZ', rate: 1, ratesLive: true })).toBeNull();
    expect(approximateCharge(501.75, { currency: 'INR', rate: 0, ratesLive: true })).toBeNull();
    expect(approximateCharge(0, { currency: 'INR', rate: 83.5, ratesLive: true })).toBeNull();
  });
});
