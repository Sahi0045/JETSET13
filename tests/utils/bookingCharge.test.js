import { describe, expect, it } from 'vitest';
import { bookingChargeLines, formatUsd } from '../../frontend/src/utils/bookingCharge';

/**
 * The lines of a flight booking's charge on the confirmation page.
 *
 * "Base Fare" was computed as the total less taxes, so the service fee and any
 * coupon discount were hidden inside the fare.
 */
describe('bookingChargeLines', () => {
  it('lists the fare, the service fee and the discount checkout verified', () => {
    expect(bookingChargeLines({ chargeBreakdown: { fare: 500, serviceFee: 50, discount: 9.14, total: 540.86, currency: 'USD', couponCode: 'SAVE' } })).toEqual({
      total: 540.86,
      lines: [
        { label: 'Airline fare (incl. taxes)', amount: 500 },
        { label: 'Service fee', amount: 50 },
        { label: 'Discount (SAVE)', amount: -9.14 },
      ],
    });
  });

  it('leaves out a fee or discount that was not charged', () => {
    expect(bookingChargeLines({ chargeBreakdown: { fare: 291, serviceFee: 0, discount: 0, total: 291 } }).lines)
      .toEqual([{ label: 'Airline fare (incl. taxes)', amount: 291 }]);
  });

  it("reads a booking just made from the review page's figures and what was paid", () => {
    const charge = bookingChargeLines({ amount: 540.86, fareBreakdown: { baseFare: 410, totalTax: 90, serviceFee: 50, totalAmount: 550 } });
    expect(charge.lines).toEqual([
      { label: 'Airline fare (incl. taxes)', amount: 500 },
      { label: 'Service fee', amount: 50 },
      { label: 'Discount', amount: -9.14 },
    ]);
  });

  it('shows no lines that do not add up to the total', () => {
    expect(bookingChargeLines({ chargeBreakdown: { fare: 500, serviceFee: 50, discount: 0, total: 600 } })).toBeNull();
    expect(bookingChargeLines({ amount: 700, fareBreakdown: { baseFare: 410, totalTax: 90, serviceFee: 50, totalAmount: 550 } })).toBeNull();
    expect(bookingChargeLines({})).toBeNull();
  });

  it('formats USD properly', () => {
    expect(formatUsd(512.4)).toBe('$512.40');
    expect(formatUsd(1234)).toBe('$1,234.00');
  });
});
