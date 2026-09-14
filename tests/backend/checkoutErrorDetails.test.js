import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A checkout that fails says so, and says nothing about why to the caller.
 *
 * Both checkout handlers answered a gateway failure with
 * `details: error.response.data.error.explanation || error.message` - the
 * merchant's complaint in ARC's words, or a connection error naming the
 * internal address it was trying. The reason belongs in the log.
 */

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

const EXPLANATION = 'Merchant TESTMERCHANT is not permitted to use operation INITIATE_CHECKOUT on version 77';
const CREDENTIAL_HEADER = 'Basic bWVyY2hhbnQuVEVTVE1FUkNIQU5UOnB3';

/** What axios throws for a refused request: the reply, and the request it made. */
const gatewayRefusal = () => Object.assign(new Error('Request failed with status code 400 from 10.0.4.17:443'), {
  response: { status: 400, data: { result: 'ERROR', error: { cause: 'INVALID_REQUEST', explanation: EXPLANATION } } },
  config: { url: 'https://arc.test/api/rest/version/77/merchant/TESTMERCHANT/session', headers: { Authorization: CREDENTIAL_HEADER } },
});

const expectGenericFailure = (res) => {
  expect(res.statusCode).toBe(500);
  expect(res.body.success).toBe(false);
  expect(res.body.error).toEqual(expect.any(String));
  expect(res.body).not.toHaveProperty('details');
  const body = JSON.stringify(res.body);
  for (const leak of ['TESTMERCHANT', 'INITIATE_CHECKOUT', '10.0.4.17', 'version 77']) {
    expect(body, leak).not.toContain(leak);
  }
};

/** Everything written to console.error, as text. */
const logged = () => console.error.mock.calls.flat()
  .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
  .join('\n');

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stored = {
    quotes: { id: 'q1', inquiry_id: 'inq-1', total_amount: 291, currency: 'USD', title: 'Goa' },
    inquiries: { customer_email: 'jane@example.com', customer_name: 'Jane Doe' },
    payments: { id: 'pay-1' },
  };
  axios.post.mockReset();
  axios.post.mockRejectedValue(gatewayRefusal());
});

describe('hosted checkout', () => {
  const run = async () => {
    const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
    const res = createResponse();
    await handleHostedCheckout(createRequest({
      method: 'POST',
      body: { amount: '291.00', orderId: 'HTLTEST1', bookingType: 'hotel', customerEmail: 'jane@example.com' },
    }), res);
    return res;
  };

  it("answers a gateway failure without the gateway's explanation", async () => {
    expectGenericFailure(await run());
  });

  it('logs the reason, and not the merchant credentials the request carried', async () => {
    await run();
    expect(logged()).toContain(EXPLANATION);
    expect(logged()).not.toContain(CREDENTIAL_HEADER);
  });
});

describe('quote payment (initiate-payment)', () => {
  const run = async () => {
    const { handleInitiatePayment } = await import('../../backend/routes/payment/checkout.handlers.js');
    const res = createResponse();
    await handleInitiatePayment(createRequest({ method: 'POST', body: { quote_id: 'q1' } }), res);
    return res;
  };

  it("answers a gateway failure without the gateway's explanation", async () => {
    expectGenericFailure(await run());
  });

  it('logs the reason, and not the merchant credentials the request carried', async () => {
    await run();
    expect(logged()).toContain(EXPLANATION);
    expect(logged()).not.toContain(CREDENTIAL_HEADER);
  });
});
