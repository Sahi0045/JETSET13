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
        // The per-customer lookups: by account, and by email.
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

  /**
   * The customer's own payment page for this same trip is not "another booking".
   *
   * A customer applies a coupon, reaches the payment page, cancels, corrects a
   * passport number and presses Pay again. After the five minutes a payment
   * page is handed back for, that is a new checkout - and it found their own
   * open page, still inside its 15 minutes, and refused the coupon as "already
   * on another booking". The review page then stripped it and charged the full
   * total. The same flights for the same people is one trip: two payments for
   * it are held for a human by the order route, so letting the coupon through
   * cannot give it twice.
   */
  describe("the customer's own open page for the same trip", () => {
    const offer = {
      itineraries: [{ segments: [{ carrierCode: 'BA', number: '178', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR' } }] }],
    };
    const otherOffer = {
      itineraries: [{ segments: [{ carrierCode: 'BA', number: '112', departure: { iataCode: 'JFK', at: '2026-11-16T19:25:00' }, arrival: { iataCode: 'LHR' } }] }],
    };
    const jane = [{ firstName: 'Jane', lastName: 'Doe', passportNumber: 'OLD123' }];
    const openPageFor = (tripOffer, travellers, over = {}) => checkoutRow({
      created_at: minutesAgo(8),
      booking_details: {
        customer_email: 'jane@example.com',
        verified_charge: { coupon: { code: 'ONCE20' } },
        pending_booking_data: { bookingData: { originalOffer: tripOffer, passengerData: travellers } },
      },
      ...over,
    });
    const tripOf = async (tripOffer, travellers) => (await import('../../backend/services/coupon.service.js')).couponTripKey(tripOffer, travellers);

    it('does not refuse the coupon when the customer pays again for the same trip', async () => {
      const corrected = [{ firstName: 'Jane', lastName: 'Doe', passportNumber: 'NEW456' }];

      const result = await evaluate(client({ bookings: [openPageFor(offer, jane)] }), { trip: await tripOf(offer, corrected) });

      expect(result.ok).toBe(true);
    });

    it('still refuses it on a different flight', async () => {
      const result = await evaluate(client({ bookings: [openPageFor(otherOffer, jane)] }), { trip: await tripOf(offer, jane) });

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/already on another booking/);
    });

    it('still refuses it for different travellers on the same flight', async () => {
      const sam = [{ firstName: 'Sam', lastName: 'Doe' }];

      const result = await evaluate(client({ bookings: [openPageFor(offer, sam)] }), { trip: await tripOf(offer, jane) });

      expect(result.ok).toBe(false);
    });

    // A payment already taken for the trip is not an abandoned page.
    it('still refuses it while a payment for the same trip is waiting to be booked', async () => {
      const result = await evaluate(client({ bookings: [openPageFor(offer, jane, { payment_status: 'paid' })] }), { trip: await tripOf(offer, jane) });

      expect(result.ok).toBe(false);
    });

    /**
     * Nor does it count toward the coupon's limit. With max_uses 5 and 4 used,
     * the customer's own abandoned page for this trip made it 4 + 1 - "This
     * coupon has reached its maximum usage limit" - to the one customer the
     * fifth use was going to.
     */
    const lastUse = { ...COUPON, max_uses: 5, current_uses: 4 };

    it('does not count toward the coupon\'s limit', async () => {
      const result = await evaluate(client({ coupon: lastUse, bookings: [openPageFor(offer, jane)] }), { trip: await tripOf(offer, jane) });

      expect(result.ok).toBe(true);
    });

    it('still counts toward it when it is another customer\'s page, or a payment already taken', async () => {
      const others = await evaluate(
        client({ coupon: lastUse, bookings: [openPageFor(offer, jane, { user_id: 'user-9', booking_details: { customer_email: 'x@example.com', verified_charge: { coupon: { code: 'ONCE20' } } } })] }),
        { trip: await tripOf(offer, jane) },
      );
      expect(others.ok).toBe(false);
      expect(others.message).toMatch(/maximum usage/);

      const paid = await evaluate(client({ coupon: lastUse, bookings: [openPageFor(offer, jane, { payment_status: 'paid' })] }), { trip: await tripOf(offer, jane) });
      expect(paid.ok).toBe(false);
      expect(paid.message).toMatch(/maximum usage/);
    });
  });

  /**
   * The coupon box (CouponInput.jsx -> POST /coupons/validate) asks with no
   * trip. After a customer cancelled at ARC, it refused their own coupon for
   * 15 minutes - "already on another booking you started" - because of the
   * page they had just left. It is a preview: checkout asks again with the
   * trip and enforces the rule there.
   */
  describe('a preview from the coupon box', () => {
    const preview = (c, over = {}) => evaluate(c, { preview: true, email: undefined, ...over });

    it('is not refused because of the customer\'s own open payment page', async () => {
      const result = await preview(client({ bookings: [checkoutRow()] }));

      expect(result.ok).toBe(true);
    });

    it('does not count the customer\'s own open page toward the limit', async () => {
      const result = await preview(client({ coupon: { ...COUPON, max_uses: 5, current_uses: 4 }, bookings: [checkoutRow()] }));

      expect(result.ok).toBe(true);
    });

    it('still refuses a coupon the customer has used, one at its limit, and one on their payment waiting to be booked', async () => {
      const used = await preview(client({ usage: [{ booking_reference: 'FLTBOOKED', user_id: 'user-1' }] }));
      expect(used.ok).toBe(false);
      expect(used.message).toMatch(/already used/);

      const full = await preview(client({ coupon: { ...COUPON, max_uses: 5, current_uses: 5 } }));
      expect(full.ok).toBe(false);

      const paidWaiting = await preview(client({ bookings: [checkoutRow({ payment_status: 'paid', created_at: minutesAgo(30) })] }));
      expect(paidWaiting.ok).toBe(false);
    });
  });

  describe('POST /coupons/validate', () => {
    it('does not refuse the caller their coupon because of their own open payment page', async () => {
      const { default: express } = await import('express');
      const { default: request } = await import('supertest');
      const supabase = (await import('../../backend/config/supabase.js')).default;
      supabase.from.mockImplementation(client({ coupon: { ...COUPON, max_uses: 5, current_uses: 4 }, bookings: [checkoutRow()] }).from);
      const { default: routes } = await import('../../backend/routes/coupon.routes.js');
      const app = express();
      app.use(express.json());
      app.use('/api/coupons', routes);

      const res = await request(app).post('/api/coupons/validate').send({ code: 'ONCE20', orderTotal: 500, bookingType: 'flight', userId: 'user-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
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
