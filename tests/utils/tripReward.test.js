import { describe, expect, it } from 'vitest';
import { tripRewardLine, tripRewardOf } from '../../frontend/src/utils/bookingCharge.js';

describe('the trip reward on a receipt', () => {
  it('reads the reward a booking carries', () => {
    expect(tripRewardOf({ tripReward: { code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' } })).toEqual({ code: 'SHUBHAM', coins: 5000 });
  });

  it('words it as coins after the trip, not money off', () => {
    expect(tripRewardLine({ tripReward: { code: 'SHUBHAM', coins: 5000 } })).toBe('Voucher SHUBHAM: 5,000 Jet Coins after your trip');
  });

  it('has nothing to say without one', () => {
    expect(tripRewardLine({})).toBeNull();
    expect(tripRewardLine({ tripReward: null })).toBeNull();
    expect(tripRewardLine({ tripReward: { code: 'SHUBHAM', coins: 0 } })).toBeNull();
    expect(tripRewardOf(null)).toBeNull();
  });

  it('does not take a voucher on the charge for a reserved reward', () => {
    const chargedWithVoucher = {
      chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 0, total: 122.2, voucher: { code: 'SHUBHAM', coins: 5000 } },
      booking_details: { verified_charge: { voucher: { code: 'SHUBHAM', coins: 5000 } } },
    };
    expect(tripRewardOf(chargedWithVoucher)).toBeNull();
    expect(tripRewardLine(chargedWithVoucher)).toBeNull();
  });
});
