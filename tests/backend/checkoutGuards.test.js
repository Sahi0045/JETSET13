import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The two checks hosted checkout makes before it opens a live ARC payment page.
 */

let db = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
    get supabase() { return { from: (...args) => db.from(...args) }; },
  };
});

const checkout = async (body, { user = null } = {}) => {
  const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
  const res = createResponse();
  await handleHostedCheckout(createRequest({ method: 'POST', user, body }), res);
  return res;
};

const openedSession = () => axios.post.mock.calls.some(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT');

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'SESSION123' }, successIndicator: 'SI' } });
});

// The guard that keeps an order reference from being reused read the row
// without its error. A read that failed looked like no row at all, and the
// upsert behind it then reset a paid booking to pending/unpaid.
describe('an order reference that cannot be looked up', () => {
  const paid = {
    id: 'bk-1',
    booking_reference: 'HTLPAID1',
    travel_type: 'hotel',
    status: 'confirmed',
    payment_status: 'paid',
    total_amount: 291,
    booking_details: { order_id: 'HTLPAID1', success_indicator: 'SI-OLD', arc_captured_amount: 291, arc_receipt: '625923098465' },
  };

  it('opens no payment page and leaves the booking it might be alone', async () => {
    db = fakeBookingsTable([paid], {
      // Every read of bookings fails; writes do not.
      fail: ({ table, patch, write }) => table === 'bookings' && !patch && !write,
    });

    const res = await checkout({ amount: '1.00', orderId: 'HTLPAID1', bookingType: 'hotel', customerEmail: 'jane@example.com' });

    expect(res.statusCode).toBe(503);
    expect(res.body.success).toBe(false);
    expect(openedSession()).toBe(false);
    const row = db.row('HTLPAID1');
    expect(row.payment_status).toBe('paid');
    expect(row.booking_details.arc_captured_amount).toBe(291);
    expect(row.booking_details.success_indicator).toBe('SI-OLD');
  });
});

// Only `bookingType === 'flight'` priced the fare. Any other string - "flights",
// "Flight", "anything" - skipped the airline's price and the login check and
// sent the body's amount to ARC.
describe('the booking type', () => {
  it('is refused when it is not one this site sells, before any payment page', async () => {
    for (const bookingType of ['flights', 'Flight', 'visa', 'anything']) {
      db = fakeBookingsTable([]);
      axios.post.mockClear();
      const res = await checkout({ amount: '1.00', orderId: `FLT${bookingType.length}ABC`, bookingType, customerEmail: 'x@example.com' });

      expect(res.statusCode, bookingType).toBe(400);
      expect(res.body.success).toBe(false);
      expect(openedSession(), bookingType).toBe(false);
      expect(db.table).toEqual([]);
    }
  });

  it('still opens a page for the products the site sells', async () => {
    for (const bookingType of ['hotel', 'cruise', 'package']) {
      db = fakeBookingsTable([]);
      axios.post.mockClear();
      const res = await checkout({ amount: '291.00', orderId: `ORD${bookingType}1`, bookingType, customerEmail: 'x@example.com' });

      expect(res.statusCode, bookingType).toBe(200);
      expect(openedSession(), bookingType).toBe(true);
    }
  });
});
