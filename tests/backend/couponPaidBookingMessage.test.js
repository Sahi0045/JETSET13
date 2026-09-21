import { describe, expect, it, vi } from 'vitest';
import { evaluateCoupon } from '../../backend/services/coupon.service.js';

/**
 * The refusal a customer sees when the coupon sits on their own PAID booking.
 *
 * The coupon box (a preview) sets aside every one of the caller's unpaid
 * payment pages, so its "already on another booking" refusal can fire there
 * only because of the caller's paid booking that has no PNR yet - up to six
 * hours old. The message said "you started in the last 15 minutes. Finish that
 * payment, or try again once its payment page has closed": the payment is
 * finished, it may be hours old, and there is no page to wait for. The rule
 * stands; only its words change for that case.
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
        const who = filters.filter(([op, column]) => op === 'eq' && ['user_id', 'user_email'].includes(column));
        return { data: usage.find((row) => who.every(([, column, value]) => row[column] === value)) ?? null, error: null };
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

const paidUnbooked = checkoutRow({ booking_reference: 'FLTPAID1', payment_status: 'paid', created_at: minutesAgo(180) });
const OPEN_PAGE = /started in the last 15 minutes|Finish that payment|payment page has closed/;
const PAID = /already on a paid booking of yours that has not been completed yet/;

describe('a coupon on the customer\'s own paid booking that is not booked yet', () => {
  it('is still refused in the coupon box, and says why truthfully', async () => {
    const result = await evaluate(client({ bookings: [paidUnbooked] }), { preview: true });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(PAID);
    expect(result.message).toMatch(/\(877\) 538-7380/);
    expect(result.message).not.toMatch(OPEN_PAGE);
  });

  it('is still refused at checkout, with the same words', async () => {
    const result = await evaluate(client({ bookings: [paidUnbooked] }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(PAID);
    expect(result.message).not.toMatch(OPEN_PAGE);
  });

  it('keeps the open-page words for another trip\'s payment page still open', async () => {
    const result = await evaluate(client({ bookings: [checkoutRow()] }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/started in the last 15 minutes/);
  });
});
