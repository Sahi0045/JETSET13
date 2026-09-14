import { describe, expect, it, vi } from 'vitest';
import { evaluateCoupon, recordCouponUse } from '../../backend/services/coupon.service.js';

/**
 * Coupon limits have to be counted to mean anything.
 *
 * Nothing wrote coupon usage: checkout evaluated a coupon and kept it on the
 * booking, and `max_uses` and "one per customer" read counters that never
 * moved. And a guest, with no account, skipped the per-customer check.
 */

const COUPON = {
  id: 'c1', code: 'SAVE10', discount_type: 'percentage', discount_value: 10,
  min_order_value: 0, max_uses: null, current_uses: 3, applicable_to: 'all', is_active: true,
};

/**
 * A small in-memory stand-in for the two tables, enough to follow the queries
 * the service makes - including the compare-and-set on `current_uses`.
 * `interfere` makes another booking bump the counter just before the first
 * write, as a booking finishing at the same moment would.
 */
const fakeClient = ({ usage = [], coupon = COUPON, interfere = false } = {}) => {
  const state = { usage: [...usage], coupon: { ...coupon } };
  let interfered = false;
  const matches = (row, filters) => Object.entries(filters).every(([key, value]) => row[key] === value);

  const client = {
    from: vi.fn((table) => {
      const filters = {};
      let update = null;
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column, value) => { filters[column] = value; return query; }),
        is: vi.fn((column, value) => { filters[column] = value; return query; }),
        limit: vi.fn(() => query),
        insert: vi.fn(async (rows) => { state.usage.push(...rows); return { error: null }; }),
        update: vi.fn((values) => { update = values; return query; }),
        maybeSingle: vi.fn(async () => (table === 'coupon_usage'
          ? { data: state.usage.find((row) => matches(row, filters)) ?? null, error: null }
          : { data: matches(state.coupon, { id: filters.id ?? state.coupon.id }) ? state.coupon : null, error: null })),
        // Only the counter's guarded update is awaited as a query.
        then: (resolve) => {
          if (interfere && !interfered) {
            interfered = true;
            state.coupon.current_uses = Number(state.coupon.current_uses ?? 0) + 1;
          }
          const { id, current_uses: expected } = filters;
          const won = update && id === state.coupon.id && (state.coupon.current_uses ?? null) === expected;
          if (won) state.coupon.current_uses = update.current_uses;
          resolve({ data: won ? [{ id }] : [], error: null });
        },
      };
      return query;
    }),
  };
  return { client, state };
};

const used = { id: 'c1', code: 'SAVE10', discountAmount: 29.1 };

describe('recordCouponUse', () => {
  it('records one use per booking, however often it is called', async () => {
    const { client, state } = fakeClient();

    const first = await recordCouponUse(client, { coupon: used, userId: 'user-1', bookingReference: 'FLT1' });
    // A retry, or the booking queue replaying the order.
    const again = await recordCouponUse(client, { coupon: used, userId: 'user-1', bookingReference: 'FLT1' });

    expect(first).toEqual({ recorded: true, counted: true });
    expect(again).toMatchObject({ recorded: false, duplicate: true });
    expect(state.usage).toHaveLength(1);
    expect(state.usage[0]).toMatchObject({ coupon_id: 'c1', user_id: 'user-1', booking_reference: 'FLT1', discount_amount: 29.1 });
    expect(state.coupon.current_uses).toBe(4);
  });

  it('keeps a guest\'s use by email', async () => {
    const { client, state } = fakeClient();

    await recordCouponUse(client, { coupon: used, email: ' Jane@Example.com ', bookingReference: 'FLT2' });

    expect(state.usage[0]).toMatchObject({ user_id: null, user_email: 'jane@example.com' });
  });

  // Two bookings finishing together must both be counted, not overwrite each
  // other's +1.
  it('counts a use that raced another booking', async () => {
    const { client, state } = fakeClient({ interfere: true });

    const result = await recordCouponUse(client, { coupon: used, userId: 'user-1', bookingReference: 'FLT3' });

    expect(result.counted).toBe(true);
    expect(state.coupon.current_uses).toBe(5);
  });

  it('counts from nothing when the counter was never set', async () => {
    const { client, state } = fakeClient({ coupon: { ...COUPON, current_uses: null } });

    await recordCouponUse(client, { coupon: used, userId: 'user-1', bookingReference: 'FLT4' });

    expect(state.coupon.current_uses).toBe(1);
  });

  it('records nothing without a coupon or a booking', async () => {
    const { client } = fakeClient();

    expect(await recordCouponUse(client, { coupon: null, bookingReference: 'FLT5' })).toEqual({ recorded: false });
    expect(await recordCouponUse(client, { coupon: used })).toEqual({ recorded: false });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('evaluateCoupon', () => {
  it('refuses a guest who has already used the coupon, by email', async () => {
    const { client } = fakeClient({ usage: [{ coupon_id: 'c1', user_email: 'jane@example.com' }] });

    const result = await evaluateCoupon(client, { code: 'save10', orderTotal: 100, bookingType: 'flights', email: 'JANE@example.com ' });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already used/);
  });

  it('lets another guest use it', async () => {
    const { client } = fakeClient({ usage: [{ coupon_id: 'c1', user_email: 'jane@example.com' }] });

    const result = await evaluateCoupon(client, { code: 'SAVE10', orderTotal: 100, bookingType: 'flights', email: 'sam@example.com' });

    expect(result.ok).toBe(true);
    expect(result.discountAmount).toBe(10);
  });

  it('refuses a coupon whose uses have run out', async () => {
    const { client } = fakeClient({ coupon: { ...COUPON, max_uses: 3, current_uses: 3 } });

    const result = await evaluateCoupon(client, { code: 'SAVE10', orderTotal: 100, bookingType: 'flights', userId: 'user-1' });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/maximum usage/);
  });
});
