import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { TEST_JWT_SECRET } from './setup.js';

/**
 * Who may read a payment.
 *
 * `get-payment-details` (and `payment-verify`, the same handler) returned the
 * whole payments row to anyone holding an id: the ARC success indicator and
 * session, the gateway order with the cardholder's name and billing address,
 * and the raw quote and inquiry. The receipt page opens it with only the id in
 * its URL, and a payment link's order id is partly guessable. `payment-retrieve`
 * did the same and also fetched the live gateway order.
 *
 * Tokens are signed for real, so the gates under test are the real ones.
 */

const OWNER = '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const STRANGER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const PAYMENT_ID = '3f2c8a1e-5b6d-4c7e-9f80-1a2b3c4d5e6f';

const paymentRow = (overrides = {}) => ({
  id: PAYMENT_ID,
  quote_id: 'q1',
  inquiry_id: 'inq-1',
  amount: 291,
  currency: 'USD',
  payment_status: 'completed',
  payment_method: 'card',
  arc_transaction_id: 'TXN-1',
  arc_order_id: PAYMENT_ID,
  arc_session_id: 'SESSION-SECRET',
  success_indicator: 'SECRET-SUCCESS-INDICATOR',
  customer_email: 'jane.doe@example.com',
  customer_name: 'Jane Doe',
  created_at: '2026-09-12T10:00:00Z',
  completed_at: '2026-09-12T10:05:00Z',
  metadata: {
    payment_link_token: 'LINKTOKEN123',
    transaction: {
      billing: { address: { street: '1 Card Holder Lane' } },
      sourceOfFunds: { provided: { card: { nameOnCard: 'JANE CARDHOLDER' } } },
    },
  },
  quote: { id: 'q1', quote_number: 'Q-1001', title: 'Goa holiday', internal_notes: 'margin 22%' },
  inquiry: { id: 'inq-1', user_id: OWNER, inquiry_type: 'package', customer_phone: '+1 555 0100' },
  ...overrides,
});

const linkRow = {
  id: 'link-1',
  link_token: 'LINKTOKEN123',
  agent_id: 'agent-1',
  amount: 291,
  currency: 'USD',
  description: 'Goa holiday',
  booking_type: 'package',
  customer_name: 'Jane Doe',
  customer_email: 'jane.doe@example.com',
  travel_details: { airline: 'AI', pnr: 'PNR123', passengers: 2, departure_date: '2026-10-01' },
};

const SECRETS = [
  'SECRET-SUCCESS-INDICATOR', 'SESSION-SECRET', 'Card Holder Lane', 'JANE CARDHOLDER',
  'margin 22%', '+1 555 0100', 'LINKTOKEN123', 'agent-1', 'PNR123', 'jane.doe@example.com',
];

let stored = { payments: paymentRow(), inquiries: { user_id: OWNER }, payment_links: linkRow };

const chainFor = (table) => {
  const c = {};
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'contains', 'update', 'insert', 'filter']) c[m] = vi.fn(() => c);
  c.single = vi.fn(async () => ({ data: stored[table] ?? null, error: null }));
  c.maybeSingle = c.single;
  return c;
};

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  supabase: { from: vi.fn((table) => chainFor(table)) },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
  ARC_SETTLEMENT_CURRENCY: 'USD',
  getArcPayAuthConfig: () => ({ headers: {} }),
}));

const gatewayFetch = vi.fn();
vi.mock('node-fetch', () => ({ default: (...args) => gatewayFetch(...args) }));

const bearer = (claims) => ({ authorization: `Bearer ${jwt.sign(claims, TEST_JWT_SECRET)}` });
const ADMIN = bearer({ id: STRANGER, role: 'admin', email: 'ops@jetsetterss.com' });
const AGENT = bearer({ id: STRANGER, agentId: STRANGER, role: 'agent', email: 'agent@example.com' });

const getDetails = async ({ query = { paymentId: PAYMENT_ID }, headers = {}, user = null } = {}) => {
  const { handleGetPaymentDetails } = await import('../../backend/routes/payment/checkout.handlers.js');
  const res = createResponse();
  await handleGetPaymentDetails(createRequest({ method: 'GET', query, headers, user }), res);
  return res;
};

const expectReceiptOnly = (res) => {
  expect(res.statusCode).toBe(200);
  expect(res.body.success).toBe(true);
  const body = JSON.stringify(res.body);
  for (const secret of SECRETS) expect(body, `${secret} must not reach this caller`).not.toContain(secret);
  // What the receipt renders is still there.
  const p = res.body.payment;
  expect(p).toMatchObject({ id: PAYMENT_ID, amount: 291, currency: 'USD', customer_name: 'Jane Doe', arc_transaction_id: 'TXN-1' });
  expect(p.customer_email).toBe('j***@example.com');
  expect(p.quote).toEqual({ quote_number: 'Q-1001', title: 'Goa holiday' });
  expect(p.inquiry).toEqual({ inquiry_type: 'package' });
  expect(p.payment_link).toMatchObject({ description: 'Goa holiday', booking_type: 'package', amount: 291 });
  expect(p.payment_link.travel_details).toEqual({ airline: 'AI', passengers: 2, departure_date: '2026-10-01' });
};

const expectFullRow = (res) => {
  expect(res.statusCode).toBe(200);
  expect(res.body.payment.success_indicator).toBe('SECRET-SUCCESS-INDICATOR');
  expect(res.body.payment.metadata.transaction).toBeDefined();
  expect(res.body.payment.payment_link.link_token).toBe('LINKTOKEN123');
};

beforeEach(() => {
  vi.resetModules();
  stored = { payments: paymentRow(), inquiries: { user_id: OWNER }, payment_links: linkRow };
  gatewayFetch.mockReset();
});

describe('get-payment-details', () => {
  it('gives a visitor with only the id the receipt, not the row', async () => {
    expectReceiptOnly(await getDetails());
  });

  it("gives the receipt to someone holding a payment link's order id", async () => {
    stored.payments = paymentRow({ arc_order_id: 'PL-1a2b3c4d-123456', inquiry_id: null, quote: undefined, inquiry: undefined });
    const res = await getDetails({ query: { paymentId: 'PL-1a2b3c4d-123456' } });
    expect(JSON.stringify(res.body)).not.toContain('SECRET-SUCCESS-INDICATOR');
    expect(res.body.payment.payment_link.travel_details).not.toHaveProperty('pnr');
  });

  it('gives another signed-in customer the receipt', async () => {
    expectReceiptOnly(await getDetails({ user: { id: STRANGER, role: 'user' } }));
  });

  it('gives a travel agent the receipt', async () => {
    expectReceiptOnly(await getDetails({ headers: AGENT }));
  });

  it('gives the account that raised the inquiry the full row', async () => {
    expectFullRow(await getDetails({ user: { id: OWNER, role: 'user' } }));
  });

  it("finds the owner through the inquiry when the lookup did not join it", async () => {
    stored.payments = paymentRow({ inquiry: undefined });
    expectFullRow(await getDetails({ user: { id: OWNER, role: 'user' } }));
  });

  it('never takes the owner from a matching email', async () => {
    stored.payments = paymentRow({ inquiry: { ...paymentRow().inquiry, user_id: null } });
    stored.inquiries = { user_id: null };
    expectReceiptOnly(await getDetails({ user: { id: STRANGER, role: 'user', email: 'jane.doe@example.com' } }));
  });

  it('gives staff the full row, which the admin panel refunds and voids from', async () => {
    expectFullRow(await getDetails({ headers: ADMIN }));
    expectFullRow(await getDetails({ user: { id: STRANGER, role: 'superadmin' } }));
  });

  it('says nothing internal when the lookup fails', async () => {
    const { supabase } = await import('../../backend/routes/payment/arcpay.config.js');
    supabase.from.mockImplementationOnce(() => { throw new Error('relation "payments" permission denied for role anon'); });
    const res = await getDetails();
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/permission denied/);
  });
});

describe('payment-retrieve', () => {
  const retrieve = async ({ headers = {}, user = null } = {}) => {
    const { handlePaymentRetrieve } = await import('../../backend/routes/payment/operations.handlers.js');
    const res = createResponse();
    await handlePaymentRetrieve(createRequest({ method: 'GET', query: { paymentId: PAYMENT_ID }, headers, user }), res);
    return res;
  };

  const expectRefused = (res) => {
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('SECRET-SUCCESS-INDICATOR');
    // The gateway is never asked.
    expect(gatewayFetch).not.toHaveBeenCalled();
  };

  it('is refused to a visitor', async () => {
    expectRefused(await retrieve());
  });

  it('is refused to a signed-in customer, even the owner', async () => {
    expectRefused(await retrieve({ user: { id: OWNER, role: 'user' } }));
  });

  it('is refused to a travel agent', async () => {
    expectRefused(await retrieve({ headers: AGENT }));
  });

  it("answers staff with the row and the gateway's order", async () => {
    gatewayFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'CAPTURED' }) });
    const res = await retrieve({ headers: ADMIN });
    expect(res.statusCode).toBe(200);
    expect(res.body.orderData).toEqual({ status: 'CAPTURED' });
    expect(res.body.payment.id).toBe(PAYMENT_ID);
  });
});

describe('the ?action= router', () => {
  const makeApp = async () => {
    const routes = (await import('../../backend/routes/payment.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/payments', routes);
    return app;
  };

  it('sends get-payment-details and payment-verify through the same gate', async () => {
    const app = await makeApp();
    for (const action of ['get-payment-details', 'payment-verify']) {
      const res = await request(app).get(`/api/payments?action=${action}&paymentId=${PAYMENT_ID}`);
      expect(res.status, action).toBe(200);
      expect(JSON.stringify(res.body), action).not.toContain('SECRET-SUCCESS-INDICATOR');
    }
  });

  it('refuses payment-retrieve to a visitor', async () => {
    const res = await request(await makeApp()).get(`/api/payments?action=payment-retrieve&paymentId=${PAYMENT_ID}`);
    expect(res.status).toBe(403);
    expect(gatewayFetch).not.toHaveBeenCalled();
  });
});
