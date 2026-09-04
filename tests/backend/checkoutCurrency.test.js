import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * The charge currency is not the customer's.
 *
 * The site converts USD to a local currency for display, and several clients
 * pass that display currency straight through to checkout - the web flight
 * payment fell back to currencyService.getCurrency(), which is whatever the
 * visitor happens to be browsing in.
 *
 * This merchant settles only in USD and answers anything else with
 *
 *   HTTP 501 - "Currency (INR) is not supported by merchant.
 *               Only the following currencies are supported: [USD]"
 *
 * so the failure is not a wrong charge, it is no session at all: the customer
 * reaches the payment step and simply cannot pay. The server pins it for every
 * client, including mobile builds already in the wild.
 */

const supabaseChain = () => {
  const c = {
    select: vi.fn(() => c),
    insert: vi.fn(() => c),
    update: vi.fn(() => c),
    upsert: vi.fn(() => c),
    eq: vi.fn(() => c),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return c;
};

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    supabase: { from: vi.fn(() => supabaseChain()) },
    ARC_PAY_CONFIG: {
      MERCHANT_ID: 'TESTMERCHANT',
      API_PASSWORD: 'pw',
      BASE_URL: 'https://arc.test/api/rest/version/77',
    },
  };
});

/** The order object actually sent to ARC in the last INITIATE_CHECKOUT. */
const lastOrderSent = () => {
  const call = axios.post.mock.calls.find(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT');
  return call?.[1]?.order ?? null;
};

const runCheckout = async (body) => {
  const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
  const req = createRequest({ method: 'POST', body });
  const res = createResponse();
  await handleHostedCheckout(req, res);
  return res;
};

const baseBody = {
  amount: '291.00',
  orderId: 'FLTTEST123456',
  bookingType: 'flight',
  customerEmail: 'jane@example.com',
  customerName: 'Jane Doe',
};

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
  axios.post.mockResolvedValue({
    status: 201,
    data: { result: 'SUCCESS', session: { id: 'SESSION123' }, successIndicator: 'abc' },
  });
});

describe('charge currency', () => {
  it('sends USD when the caller asks for their local currency', async () => {
    await runCheckout({ ...baseBody, currency: 'INR' });
    expect(lastOrderSent()?.currency).toBe('USD');
  });

  it('sends USD for every other display currency a visitor might be browsing in', async () => {
    for (const requested of ['EUR', 'GBP', 'AED', 'CAD']) {
      axios.post.mockClear();
      await runCheckout({ ...baseBody, currency: requested });
      expect(lastOrderSent()?.currency, `${requested} must not reach the gateway`).toBe('USD');
    }
  });

  it('sends USD when the caller omits a currency entirely', async () => {
    await runCheckout({ ...baseBody });
    expect(lastOrderSent()?.currency).toBe('USD');
  });

  // The amount is computed in USD throughout, so relabelling it would charge a
  // different sum, not just a different symbol.
  it('leaves the amount untouched', async () => {
    await runCheckout({ ...baseBody, currency: 'INR' });
    expect(lastOrderSent()?.amount).toBe('291.00');
  });
});

describe('what reaches the logs', () => {
  it('does not dump the request body, which carries customer contact details', async () => {
    const logged = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logged.push(args.join(' ')));

    await runCheckout({ ...baseBody, customerPhone: '5551234567', bookingData: { passportNumber: 'X1234567' } });

    spy.mockRestore();
    const all = logged.join('\n');
    expect(all).not.toContain('jane@example.com');
    expect(all).not.toContain('5551234567');
    expect(all).not.toContain('X1234567');
  });
});
