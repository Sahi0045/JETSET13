import { describe, expect, it } from 'vitest';
import { approximateCharge, CHARGE_CURRENCY, describeServiceFee, formatUsd } from '../../frontend/src/utils/chargeDisplay.js';
import { computeFlightCharge } from '../../shared/flightCharge.js';

/**
 * Who the service fee is charged for, read from the computation that charges
 * it. A lap infant pays no fixed fee (owner's decision, 2026-09-15); the page
 * showed one fee "for 3 travellers" and never said which.
 */
describe('describeServiceFee', () => {
  const config = { flight_taxes_fees: 5, flight_taxes_fees_percentage: 2.5 };

  it('lists the fee by traveller type, the lap infant with none', () => {
    const charge = computeFlightCharge({ fareTotal: 400, travellerTypes: ['ADULT', 'ADULT', 'HELD_INFANT'], config });

    expect(describeServiceFee(charge)).toEqual([
      '2 adults × US$5.00',
      '1 infant (on lap): no service fee',
      '2.5% of the fare: US$10.00',
    ]);
  });

  it('charges a seated child and an infant in its own seat', () => {
    const charge = computeFlightCharge({ fareTotal: 400, travellerTypes: ['ADULT', 'CHILD', 'SEATED_INFANT'], config: { flight_taxes_fees: 5 } });

    expect(describeServiceFee(charge)).toEqual(['1 adult × US$5.00', '1 child × US$5.00', '1 infant (own seat) × US$5.00']);
  });

  it('lists no fixed fee when there is none to pay', () => {
    const charge = computeFlightCharge({ fareTotal: 400, travellerTypes: ['ADULT', 'HELD_INFANT'], config: { flight_taxes_fees: 0, flight_taxes_fees_percentage: 2.5 } });

    expect(describeServiceFee(charge)).toEqual(['2.5% of the fare: US$10.00']);
  });

  it('has nothing to break down without the traveller types', () => {
    expect(describeServiceFee(computeFlightCharge({ fareTotal: 400, passengers: 2, config: { flight_taxes_fees: 5 } }))).toEqual([]);
    expect(describeServiceFee()).toEqual([]);
  });
});

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
