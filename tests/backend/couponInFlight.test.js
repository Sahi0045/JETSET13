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
