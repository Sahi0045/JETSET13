import { describe, it, expect } from 'vitest';
import {
  MEMBERSHIP_TIERS,
  getDiscountRate,
  isPremiumTier,
  isMembershipActive,
  memberDiscountAmount,
} from '@/config/membership';

const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('membership config — discount rates', () => {
  it('monthly premium = 5%', () => {
    expect(getDiscountRate('premium_monthly')).toBe(0.05);
  });
  it('annual premium = 10%', () => {
    expect(getDiscountRate('premium_annual')).toBe(0.10);
  });
  it('unknown / free tier = 0%', () => {
    expect(getDiscountRate('free')).toBe(0);
    expect(getDiscountRate(null)).toBe(0);
    expect(getDiscountRate(undefined)).toBe(0);
  });
});

describe('membership config — tier detection', () => {
  it('recognises premium tiers', () => {
    expect(isPremiumTier('premium_monthly')).toBe(true);
    expect(isPremiumTier('premium_annual')).toBe(true);
  });
  it('rejects non-premium tiers', () => {
    expect(isPremiumTier('free')).toBe(false);
    expect(isPremiumTier(null)).toBe(false);
  });
});

describe('membership active state', () => {
  it('active when premium tier and end date in the future', () => {
    expect(isMembershipActive('premium_annual', future())).toBe(true);
  });
  it('inactive when premium tier but expired', () => {
    expect(isMembershipActive('premium_monthly', past())).toBe(false);
  });
  it('inactive for non-premium tier even with future date', () => {
    expect(isMembershipActive('free', future())).toBe(false);
  });
  it('treats a premium tier with no end date as active', () => {
    expect(isMembershipActive('premium_annual', null)).toBe(true);
  });
});

describe('memberDiscountAmount', () => {
  it('annual member saves 10% of base fare', () => {
    expect(memberDiscountAmount(200, 'premium_annual', future())).toBe(20);
  });
  it('monthly member saves 5% of base fare', () => {
    expect(memberDiscountAmount(200, 'premium_monthly', future())).toBe(10);
  });
  it('non-member saves nothing', () => {
    expect(memberDiscountAmount(200, 'free', future())).toBe(0);
  });
  it('expired member saves nothing', () => {
    expect(memberDiscountAmount(200, 'premium_annual', past())).toBe(0);
  });
  it('rounds to 2 decimals', () => {
    // 99.99 * 0.10 = 9.999 -> 10.00
    expect(memberDiscountAmount(99.99, 'premium_annual', future())).toBe(10);
  });
});

describe('free seat selection benefit (mirrors FlightBookingConfirmation logic)', () => {
  // Replicates the waiver rule used when computing the fare:
  //   effectiveSeatFee = (active member && seatFee > 0) ? 0 : seatFee
  const effectiveSeatFee = (seatFee, tier, endDate) =>
    isMembershipActive(tier, endDate) && seatFee > 0 ? 0 : seatFee;

  it('waives the seat fee for an active premium member', () => {
    expect(effectiveSeatFee(25, 'premium_annual', future())).toBe(0);
  });
  it('charges the seat fee for a non-member', () => {
    expect(effectiveSeatFee(25, 'free', future())).toBe(25);
  });
  it('charges the seat fee for an expired member', () => {
    expect(effectiveSeatFee(25, 'premium_monthly', past())).toBe(25);
  });
  it('no-op when there is no seat fee', () => {
    expect(effectiveSeatFee(0, 'premium_annual', future())).toBe(0);
  });
});

describe('tier metadata integrity', () => {
  it('every tier advertises its discount in its perks copy', () => {
    Object.values(MEMBERSHIP_TIERS).forEach((t) => {
      const pct = `${Math.round(t.discountRate * 100)}%`;
      expect(t.perks.join(' ')).toContain(pct);
    });
  });
});
