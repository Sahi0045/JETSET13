import { describe, expect, it, vi } from 'vitest';
import { evaluateCoupon } from '../../backend/services/coupon.service.js';

/**
 * A coupon counts against its limits while it sits on an unfinished checkout.
 *
 * Uses were recorded only once the airline held a booking, so every checkout
 * still on its payment page - or paid and not yet booked - had not used its
 * coupon yet. A customer could apply a one-per-customer coupon to two trips
 * open at once, pay both, and get both discounts.
 */

const COUPON = {
  id: 'c1', code: 'ONCE20', discount_type: 'percentage', discount_value: 20,
  min_order_value: 0, max_uses: null, current_uses: 0, applicable_to: 'all', is_active: true,
};
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const checkoutRow = (over = {}) => ({
  booking_reference: 'FLTOPEN1',
  user_id: 'user-1',
  status: 'pending',
  payment_status: 'unpaid',
  created_at: minutesAgo(2),
  booking_details: { customer_email: 'jane@example.com', verified_charge: { coupon: { code: 'ONCE20' } } },
  ...over,
});

/** Just enough of the three tables for evaluateCoupon's queries. */
const client = ({ coupon = COUPON, bookings = [], usage = [] } = {}) => ({
  from: vi.fn((table) => {
    const filters = [];
    const query = {
      select: () => query,
      eq: (column, value) => { filters.push(['eq', column, value]); return query; },
      gte: (column, value) => { filters.push(['gte', column, value]); return query; },
      in: (column, values) => { filters.push(['in', column, values]); return query; },
      limit: () => query,
      maybeSingle: async () => {
        if (table === 'coupons') return { data: coupon, error: null };
        const byUser = filters.find(([, column]) => column === 'user_id');
        return { data: usage.find((row) => !byUser || row.user_id === byUser[2]) ?? null, error: null };
      },
      then: (resolve) => {
        if (table === 'bookings') {
          const since = filters.find(([op]) => op === 'gte')?.[2];
          resolve({ data: bookings.filter((row) => !since || row.created_at >= since), error: null });
        } else if (table === 'coupon_usage') {
          const refs = filters.find(([op]) => op === 'in')?.[2] ?? [];
          resolve({ data: usage.filter((row) => refs.includes(row.booking_reference)), error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
    };
    return query;
  }),
});

const evaluate = (c, over = {}) => evaluateCoupon(c, { code: 'ONCE20', orderTotal: 500, bookingType: 'flight', userId: 'user-1', email: 'jane@example.com', ...over });

describe('a coupon on a checkout that has not finished', () => {
  it('stops the same customer using it on a second trip opened at the same time', async () => {
    const result = await evaluate(client({ bookings: [checkoutRow()] }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already on another booking/);
  });

  it('still lets another customer use it', async () => {
    const result = await evaluate(client({ bookings: [checkoutRow()] }), { userId: 'user-2', email: 'sam@example.com' });

    expect(result.ok).toBe(true);
  });

  it('counts a paid checkout not yet booked against the coupon limit', async () => {
    const limited = { ...COUPON, max_uses: 1, current_uses: 0 };
    const paid = checkoutRow({ user_id: 'user-9', payment_status: 'paid', created_at: minutesAgo(90), booking_details: { customer_email: 'x@example.com', verified_charge: { coupon: { code: 'ONCE20' } } } });

    const result = await evaluate(client({ coupon: limited, bookings: [paid] }), { userId: 'user-2', email: 'sam@example.com' });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/maximum usage/);
  });

  it('ignores a payment page that closed, a cancelled checkout and one whose use is already counted', async () => {
    const result = await evaluate(client({
      bookings: [
        checkoutRow({ booking_reference: 'FLTOLD', created_at: minutesAgo(40) }),
        checkoutRow({ booking_reference: 'FLTCANX', status: 'cancelled' }),
        checkoutRow({ booking_reference: 'FLTDONE', payment_status: 'paid' }),
      ],
      usage: [{ booking_reference: 'FLTDONE', user_id: 'someone-else' }],
    }));

    expect(result.ok).toBe(true);
  });
});
