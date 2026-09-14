import { describe, expect, it } from 'vitest';
import {
  ageInYears,
  computeCouponDiscount,
  computeFlightCharge,
  passengerAgeProblem,
  roundMoney,
  travellerTypesOf,
} from '../../shared/flightCharge.js';

/**
 * A lap infant pays no fixed service fee - the owner's decision of 2026-09-15.
 *
 * The fee was taken for every traveller the fare was priced for, so two adults
 * and a baby on a lap paid three fees, and the review page showed one fee line
 * with no reason for the third.
 */
describe('the fixed service fee and lap infants', () => {
  const config = { flight_taxes_fees: 5, flight_taxes_fees_percentage: 0 };

  it('charges two adults and a lap infant two fixed fees', () => {
    const charge = computeFlightCharge({ fareTotal: 400, travellerTypes: ['ADULT', 'ADULT', 'HELD_INFANT'], config });

    expect(charge.passengers).toBe(3);
    expect(charge.seatedPassengers).toBe(2);
    expect(charge.fixedFee).toBe(10);
    expect(charge.total).toBe(410);
  });

  it('still charges a seated child, and an infant in its own seat', () => {
    expect(computeFlightCharge({ fareTotal: 400, travellerTypes: ['ADULT', 'CHILD'], config }).fixedFee).toBe(10);
    expect(computeFlightCharge({ fareTotal: 400, travellerTypes: ['ADULT', 'SEATED_INFANT'], config }).fixedFee).toBe(10);
  });

  it('leaves the percentage of the whole fare exactly as it was', () => {
    const withPercentage = { flight_taxes_fees: 5, flight_taxes_fees_percentage: 2.5 };
    const withInfant = computeFlightCharge({ fareTotal: 400, travellerTypes: ['ADULT', 'HELD_INFANT'], config: withPercentage });

    expect(withInfant.percentageFee).toBe(10);
    expect(withInfant.serviceFee).toBe(15);
  });

  it('counts every traveller as seated when given only a count, as before', () => {
    expect(computeFlightCharge({ fareTotal: 400, passengers: 3, config }).fixedFee).toBe(15);
    expect(computeFlightCharge({ fareTotal: 400, passengers: 3, config }).fixedFeeByType).toBeNull();
  });

  it('breaks the fee down by traveller type, the infant with nothing to pay', () => {
    const charge = computeFlightCharge({ fareTotal: 400, travellerTypes: ['HELD_INFANT', 'ADULT', 'CHILD', 'ADULT'], config });

    expect(charge.fixedFeeByType).toEqual([
      { type: 'ADULT', count: 2, each: 5, amount: 10 },
      { type: 'CHILD', count: 1, each: 5, amount: 5 },
      { type: 'HELD_INFANT', count: 1, each: 0, amount: 0 },
    ]);
  });

  it('adds the breakdown up to the fee charged, to the cent', () => {
    for (const fee of [0.004, 0.335, 1.005, 2.675, 7]) {
      const charge = computeFlightCharge({
        fareTotal: 250, travellerTypes: ['ADULT', 'CHILD', 'SEATED_INFANT', 'HELD_INFANT'], config: { flight_taxes_fees: fee },
      });
      const sum = roundMoney(charge.fixedFeeByType.reduce((total, line) => total + line.amount, 0));
      expect(sum, `fee ${fee}`).toBe(charge.fixedFee);
    }
  });

  it("reads the types from the offer's own pricings, an untyped one as an adult", () => {
    expect(travellerTypesOf({ travelerPricings: [{ travelerType: 'ADULT' }, { travelerType: 'held_infant' }, {}] }))
      .toEqual(['ADULT', 'HELD_INFANT', 'ADULT']);
    expect(travellerTypesOf(null)).toEqual([]);
  });
});

/**
 * The one formula the review page shows and checkout charges.
 *
 * The page used to multiply the airline's all-passenger total by the passenger
 * count again - two adults paid four fares - and took the percentage fee per
 * passenger on that same all-passenger total.
 */
describe('computeFlightCharge', () => {
  const config = { flight_taxes_fees: 1, flight_taxes_fees_percentage: 0 };

  it('charges the airline total once, however many travellers it covers', () => {
    const charge = computeFlightCharge({ fareTotal: 400, passengers: 2, config });

    expect(charge.fare).toBe(400);
    expect(charge.total).toBe(402);
    expect(charge.total).not.toBe(802);
  });

  it('takes the fixed fee per traveller and the percentage once, on the whole fare', () => {
    const charge = computeFlightCharge({
      fareTotal: 400, passengers: 2, config: { flight_taxes_fees: 5, flight_taxes_fees_percentage: 2.5 },
    });

    expect(charge.fixedFee).toBe(10);
    expect(charge.percentageFee).toBe(10);
    expect(charge.total).toBe(420);
  });

  it('never discounts below zero or beyond the subtotal', () => {
    expect(computeFlightCharge({ fareTotal: 100, passengers: 1, config, discount: 500 }).total).toBe(0);
    expect(computeFlightCharge({ fareTotal: 100, passengers: 1, config, discount: -20 }).total).toBe(101);
  });

  it('rounds to cents the same way every time', () => {
    const charge = computeFlightCharge({
      fareTotal: 133.05, passengers: 1, config: { flight_taxes_fees: 0, flight_taxes_fees_percentage: 2.5 },
    });
    expect(charge.percentageFee).toBe(3.33);
    expect(charge.total).toBe(136.38);
    expect(roundMoney('1.005')).toBe(1.01);
  });
});

describe('computeCouponDiscount', () => {
  it('applies a percentage, capped, and never more than the total', () => {
    expect(computeCouponDiscount({ discount_type: 'percentage', discount_value: 20 }, 1200)).toBe(240);
    expect(computeCouponDiscount({ discount_type: 'percentage', discount_value: 20, max_discount_amount: 25 }, 1200)).toBe(25);
    expect(computeCouponDiscount({ discount_type: 'fixed', discount_value: 50 }, 30)).toBe(30);
    expect(computeCouponDiscount(null, 100)).toBe(0);
  });
});

describe('passenger ages against the fare type', () => {
  it('counts whole years on the travel date', () => {
    expect(ageInYears('2014-09-20', '2026-09-19')).toBe(11);
    expect(ageInYears('2014-09-19', '2026-09-19')).toBe(12);
    expect(ageInYears('nonsense', '2026-09-19')).toBeNull();
  });

  it('accepts a traveller who fits the fare', () => {
    expect(passengerAgeProblem('ADULT', '1990-01-01', '2026-09-19')).toBeNull();
    expect(passengerAgeProblem('CHILD', '2018-05-01', '2026-09-19')).toBeNull();
    expect(passengerAgeProblem('HELD_INFANT', '2025-12-01', '2026-09-19')).toBeNull();
  });

  it('refuses a child on an adult fare and an adult on a child fare', () => {
    expect(passengerAgeProblem('ADULT', '2018-05-01', '2026-09-19')).toMatch(/aged 12 or over/);
    expect(passengerAgeProblem('CHILD', '1990-01-01', '2026-09-19')).toMatch(/aged 2 to 11/);
    expect(passengerAgeProblem('HELD_INFANT', '2022-01-01', '2026-09-19')).toMatch(/under 2/);
  });

  it('refuses a birth date after the flight', () => {
    expect(passengerAgeProblem('HELD_INFANT', '2026-10-01', '2026-09-19')).toMatch(/after the travel date/);
  });
});
