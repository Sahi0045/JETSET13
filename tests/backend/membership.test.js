import { describe, it, expect } from 'vitest';
import {
  getDiscountRate,
  isMembershipActive,
  getUserMembership,
} from '../../backend/config/membershipTiers.js';

const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// Minimal chainable Supabase mock: from().select().eq().single()
function mockSupabase(row, error = null) {
  return {
    _row: row,
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    single() { return Promise.resolve({ data: row, error }); },
  };
}

describe('backend membership tiers config', () => {
  it('mirrors the frontend discount rates', () => {
    expect(getDiscountRate('premium_monthly')).toBe(0.05);
    expect(getDiscountRate('premium_annual')).toBe(0.10);
    expect(getDiscountRate('free')).toBe(0);
  });

  it('computes active state correctly', () => {
    expect(isMembershipActive('premium_annual', future())).toBe(true);
    expect(isMembershipActive('premium_annual', past())).toBe(false);
    expect(isMembershipActive('free', future())).toBe(false);
  });
});

describe('getUserMembership — reads persisted membership from users table', () => {
  it('returns an active 10% membership for an annual subscriber', async () => {
    const supabase = mockSupabase({ subscription_tier: 'premium_annual', subscription_end_date: future() });
    const m = await getUserMembership(supabase, 'user-123');
    expect(m).toEqual({ tier: 'premium_annual', active: true, discountRate: 0.10 });
  });

  it('returns inactive (0%) for an expired subscription', async () => {
    const supabase = mockSupabase({ subscription_tier: 'premium_monthly', subscription_end_date: past() });
    const m = await getUserMembership(supabase, 'user-123');
    expect(m.active).toBe(false);
    expect(m.discountRate).toBe(0);
  });

  it('returns no membership when the user has no tier saved', async () => {
    const supabase = mockSupabase({ subscription_tier: null, subscription_end_date: null });
    const m = await getUserMembership(supabase, 'user-123');
    expect(m).toEqual({ tier: null, active: false, discountRate: 0 });
  });

  it('fails safe (no discount) when the row cannot be read', async () => {
    const supabase = mockSupabase(null, { message: 'not found' });
    const m = await getUserMembership(supabase, 'user-123');
    expect(m).toEqual({ tier: null, active: false, discountRate: 0 });
  });

  it('fails safe when no supabase client or userId is provided', async () => {
    expect(await getUserMembership(null, 'u1')).toEqual({ tier: null, active: false, discountRate: 0 });
    expect(await getUserMembership(mockSupabase({}), null)).toEqual({ tier: null, active: false, discountRate: 0 });
  });
});
