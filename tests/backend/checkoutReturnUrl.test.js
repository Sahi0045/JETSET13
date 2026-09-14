import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { safeReturnUrl } from '../../backend/utils/returnUrl.js';

/**
 * Where ARC sends the payer afterwards is ours to choose, not the caller's.
 *
 * Hosted checkout and the quote flow passed the request's return and cancel
 * URLs straight to ARC, so anyone could open a genuine ARC Pay session on this
 * merchant that finishes on a site of their choosing.
 *
 * FRONTEND_URL is http://localhost:5173 here (tests/backend/setup.js).
 */

const DEFAULT = 'https://www.jetsetterss.com/fallback';
const prod = { NODE_ENV: 'production', FRONTEND_URL: 'https://www.jetsetterss.com' };
const dev = { NODE_ENV: 'development', FRONTEND_URL: 'https://www.jetsetterss.com' };

describe('safeReturnUrl', () => {
  it("accepts the site's own origins", () => {
    for (const url of [
      'https://www.jetsetterss.com/payment/callback?orderId=FLT1&bookingType=flight',
      'https://jetsetterss.com/flights?cancelled=true',
    ]) {
      expect(safeReturnUrl(url, DEFAULT, prod)).toBe(url);
    }
  });

  it("accepts FRONTEND_URL's origin", () => {
    const env = { NODE_ENV: 'production', FRONTEND_URL: 'https://staging.jetsetterss.com/' };
    expect(safeReturnUrl('https://staging.jetsetterss.com/payment/callback', DEFAULT, env))
      .toBe('https://staging.jetsetterss.com/payment/callback');
  });

  it("accepts the mobile app's own schemes", () => {
    for (const url of [
      'jetsettermobile://payment/callback?orderId=FLT1&bookingType=flight',
      'jetsetterss://payment-callback?orderId=CRZ1&type=cruise',
    ]) {
      expect(safeReturnUrl(url, DEFAULT, prod)).toBe(url);
    }
  });

  it('refuses everything else', () => {
    for (const url of [
      'https://evil.example/payment/callback',
      'https://www.jetsetterss.com.evil.example/payment/callback',
      'https://www.jetsetterss.com@evil.example/payment/callback',
      'https://user:pass@www.jetsetterss.com/payment/callback',
      'http://www.jetsetterss.com/payment/callback',
      '//evil.example/payment/callback',
      '/payment/callback',
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'otherapp://payment/callback',
      '',
      '   ',
      null,
      undefined,
      { href: 'https://www.jetsetterss.com' },
    ]) {
      expect(safeReturnUrl(url, DEFAULT, prod), String(url)).toBe(DEFAULT);
    }
  });

  it('accepts localhost only outside production', () => {
    const local = 'http://localhost:5173/payment/callback?orderId=FLT1';
    expect(safeReturnUrl(local, DEFAULT, dev)).toBe(local);
    expect(safeReturnUrl(local, DEFAULT, prod)).toBe(DEFAULT);
    expect(safeReturnUrl(local, DEFAULT, { NODE_ENV: 'development', VERCEL_ENV: 'production' })).toBe(DEFAULT);
  });
});

// ─── The handlers ─────────────────────────────────────────────

let stored = {};
const chainFor = (table) => {
  const c = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'eq', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.single = vi.fn(async () => ({ data: stored[table] ?? null, error: null }));
  c.maybeSingle = c.single;
  return c;
};

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    supabase: { from: vi.fn((table) => chainFor(table)) },
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
  };
});

/** The interaction block sent to ARC in the last INITIATE_CHECKOUT. */
const sentInteraction = () =>
  axios.post.mock.calls.find(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT')?.[1]?.interaction ?? null;

const hostedCheckout = async (body) => {
  const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
  const res = createResponse();
  // A hotel: flight charges are verified against the airline first, which is
  // not what these tests are about (see checkoutCurrency.test.js).
  await handleHostedCheckout(createRequest({
    method: 'POST',
    body: { amount: '291.00', orderId: 'HTLTEST1', bookingType: 'hotel', customerEmail: 'jane@example.com', ...body },
  }), res);
  return res;
};

const initiatePayment = async (body) => {
  const { handleInitiatePayment } = await import('../../backend/routes/payment/checkout.handlers.js');
  const res = createResponse();
  await handleInitiatePayment(createRequest({ method: 'POST', body: { quote_id: 'q1', ...body } }), res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  stored = {
    quotes: { id: 'q1', inquiry_id: 'inq-1', total_amount: 291, currency: 'USD', title: 'Goa' },
    inquiries: { customer_email: 'jane@example.com', customer_name: 'Jane Doe' },
    payments: { id: 'pay-1' },
  };
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'SESSION123' }, successIndicator: 'abc' } });
});

describe('hosted checkout', () => {
  it("sends the site's own return and cancel URLs through as given", async () => {
    await hostedCheckout({
      returnUrl: 'https://www.jetsetterss.com/payment/callback?orderId=HTLTEST1&bookingType=hotel',
      cancelUrl: 'https://www.jetsetterss.com/hotels/booking-summary?x=1',
    });
    expect(sentInteraction()).toMatchObject({
      returnUrl: 'https://www.jetsetterss.com/payment/callback?orderId=HTLTEST1&bookingType=hotel',
      cancelUrl: 'https://www.jetsetterss.com/hotels/booking-summary?x=1',
    });
  });

  it("replaces another site's URLs with the site's defaults", async () => {
    await hostedCheckout({
      returnUrl: 'https://evil.example/payment/callback',
      cancelUrl: 'https://www.jetsetterss.com.evil.example/cancel',
    });
    expect(sentInteraction()).toMatchObject({
      returnUrl: 'http://localhost:5173/payment/callback?orderId=HTLTEST1&bookingType=hotel',
      cancelUrl: 'http://localhost:5173/hotel-payment?cancelled=true',
    });
  });

  it("keeps the mobile app's deep links", async () => {
    await hostedCheckout({
      returnUrl: 'jetsettermobile://payment/callback?orderId=HTLTEST1&bookingType=hotel',
      cancelUrl: 'jetsettermobile://payment/cancel?orderId=HTLTEST1',
    });
    expect(sentInteraction()).toMatchObject({
      returnUrl: 'jetsettermobile://payment/callback?orderId=HTLTEST1&bookingType=hotel',
      cancelUrl: 'jetsettermobile://payment/cancel?orderId=HTLTEST1',
    });
  });
});

describe('quote payment (initiate-payment)', () => {
  it("replaces another site's URLs with the site's defaults", async () => {
    await initiatePayment({ return_url: 'https://evil.example/cb', cancel_url: 'javascript:alert(1)' });
    expect(sentInteraction()).toMatchObject({
      returnUrl: 'http://localhost:5173/payment/callback?quote_id=q1&inquiry_id=inq-1',
      cancelUrl: 'http://localhost:5173/inquiry/inq-1?payment=cancelled',
    });
  });

  it("sends the site's own URLs through", async () => {
    await initiatePayment({
      return_url: 'https://www.jetsetterss.com/payment/callback?quote_id=q1&inquiry_id=inq-1',
      cancel_url: 'https://www.jetsetterss.com/inquiry/inq-1?payment=cancelled',
    });
    expect(sentInteraction()).toMatchObject({
      returnUrl: 'https://www.jetsetterss.com/payment/callback?quote_id=q1&inquiry_id=inq-1',
      cancelUrl: 'https://www.jetsetterss.com/inquiry/inq-1?payment=cancelled',
    });
  });
});
