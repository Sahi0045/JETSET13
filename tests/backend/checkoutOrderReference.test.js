import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Checkout saves its row under the order reference it is given, owned by the
 * caller. A 6-character one could be another customer's airline record locator,
 * and bookings are also looked up by locator - the caller became the "owner" of
 * a stranger's PNR (orderReadOwnedPnr.test.js). Only references shaped like the
 * ones this site's clients make are taken.
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

const checkout = async (body, { user = { id: 'user-1', role: 'user' } } = {}) => {
  const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
  const res = createResponse();
  await handleHostedCheckout(createRequest({ method: 'POST', user, body }), res);
  return res;
};

const openedSession = () => axios.post.mock.calls.some(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT');

beforeEach(() => {
  vi.resetModules();
  db = fakeBookingsTable([]);
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'SESSION123' }, successIndicator: 'SI' } });
});

describe('the order reference', () => {
  it('is refused when it has the shape of a record locator, and no row is saved under it', async () => {
    for (const orderId of ['ABC123', 'abc123', 'XYZ9Q2']) {
      axios.post.mockClear();
      const res = await checkout({ amount: '1.00', orderId, bookingType: 'package', customerEmail: 'x@example.com' });

      expect(res.statusCode, orderId).toBe(400);
      expect(res.body.success).toBe(false);
      expect(openedSession(), orderId).toBe(false);
      expect(db.row(orderId), orderId).toBeFalsy();
    }
  });

  it('is refused when it is not one of ours in other ways', async () => {
    for (const orderId of ['1234567890', 'FLT 1234567', 'FLT;DROP--1', 'A'.repeat(70), 12345678, '']) {
      axios.post.mockClear();
      const res = await checkout({ amount: '1.00', orderId, bookingType: 'package', customerEmail: 'x@example.com' });

      expect(res.statusCode, String(orderId)).toBe(400);
      expect(openedSession(), String(orderId)).toBe(false);
    }
  });

  // Fence: every shape a client of this site makes still opens a payment page.
  it('is accepted in every shape our clients make', async () => {
    const { isOrderReference } = await import('../../backend/routes/payment/checkout.handlers.js');
    // utils/orderRef.js: PREFIX + 14; the app: CRZ + base36 time, CRUISE-<ms>.
    for (const orderId of ['FLT0A1B2C3D4E5F6A', 'PKG0123456789ABCD', 'HTL0123456789ABCD', 'CRZ0123456789ABCD',
      'CRZMFK2Q1ZC', 'FLTMFK2Q1ZC', 'CRUISE-1790087804683', 'HTLPAID1', 'FLTX1', 'ABC-12']) {
      expect(isOrderReference(orderId), orderId).toBe(true);
    }

    const res = await checkout({ amount: '100.00', orderId: 'PKG0123456789ABCD', bookingType: 'package', customerEmail: 'x@example.com' });
    expect(res.statusCode).toBe(200);
    expect(openedSession()).toBe(true);
    expect(db.row('PKG0123456789ABCD')).toBeTruthy();
  });
});
