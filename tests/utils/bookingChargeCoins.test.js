import { describe, expect, it } from 'vitest';
import { bookingChargeLines } from '../../frontend/src/utils/bookingCharge.js';

describe('a receipt with Jet Coins', () => {
  it('shows the coins line and still adds up', () => {
    const result = bookingChargeLines({ chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 0, walletAmount: 50, walletCoins: 5000, total: 72.2 } });
    expect(result.total).toBe(72.2);
    expect(result.lines.map((line) => line.label)).toEqual(['Airline fare (incl. taxes)', 'Platform fee', 'Jet Coins (5,000)']);
    expect(result.lines[2].amount).toBe(-50);
  });

  it('keeps the coupon as a Discount beside the coins line', () => {
    const result = bookingChargeLines({ chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 10, walletAmount: 40, walletCoins: 4000, total: 72.2, couponCode: 'SAVE' } });
    expect(result.lines).toEqual([
      { label: 'Airline fare (incl. taxes)', amount: 120 },
      { label: 'Platform fee', amount: 2.2 },
      { label: 'Discount (SAVE)', amount: -10 },
      { label: 'Jet Coins (4,000)', amount: -40 },
    ]);
  });

  it('shows no lines when the coins do not make them add up', () => {
    expect(bookingChargeLines({ chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 0, walletAmount: 10, walletCoins: 1000, total: 72.2 } })).toBeNull();
  });

  it('reads a booking just made from the review figures: coins are not a discount', () => {
    const result = bookingChargeLines({
      amount: 72.2,
      fareBreakdown: { baseFare: 100, totalTax: 20, serviceFee: 2.2, discount: 0, walletAmount: 50, totalAmount: 122.2 },
    });
    expect(result.total).toBe(72.2);
    expect(result.lines).toEqual([
      { label: 'Airline fare (incl. taxes)', amount: 120 },
      { label: 'Platform fee', amount: 2.2 },
      { label: 'Jet Coins (5,000)', amount: -50 },
    ]);
  });

  it('keeps a coupon as a Discount and coins as Jet Coins when a booking just made has both', () => {
    const result = bookingChargeLines({
      amount: 62.2,
      couponCode: 'SAVE',
      fareBreakdown: { baseFare: 100, totalTax: 20, serviceFee: 2.2, walletAmount: 50, walletCoins: 5000, totalAmount: 122.2 },
    });
    expect(result.lines.map((line) => [line.label, line.amount])).toEqual([
      ['Airline fare (incl. taxes)', 120],
      ['Platform fee', 2.2],
      ['Discount (SAVE)', -10],
      ['Jet Coins (5,000)', -50],
    ]);
  });
});
