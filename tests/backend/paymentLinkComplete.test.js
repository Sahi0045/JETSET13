import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Completing a payment link.
 *
 * The handler used to mark the link paid, the booking confirmed and paid, and
 * the payment completed for any unauthenticated POST carrying a link token and
 * an order id. It never compared `resultIndicator` with the one ARC issued and
 * never asked the gateway. Because the order route trusted a row already marked
 * paid, that single request was enough to sell a seat with no payment.
 */

const tables = {};
const writes = [];

const chainFor = (table) => {
  const c = {};
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'contains']) c[m] = vi.fn(() => c);
  c.update = vi.fn((payload) => { writes.push({ table, payload }); return c; });
  c.insert = vi.fn((payload) => { writes.push({ table, payload, insert: true }); return c; });
  c.single = vi.fn(async () => ({ data: tables[table] ?? null, error: null }));
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

const complete = async (body) => {
  const { handleCompletePaymentLink } = await import('../../backend/routes/payment/links.handlers.js');
  let statusCode = 200;
  let payload = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
  };
  await handleCompletePaymentLink({ body }, res);
  return { status: statusCode, body: payload };
};

const captured = (amount) => ({
  status: 200,
  data: {
    status: 'CAPTURED',
    amount,
    currency: 'USD',
    transaction: [{ result: 'SUCCESS', transaction: { id: 'arc-txn-9', type: 'PAYMENT', amount, currency: 'USD' } }],
  },
});

const wroteTo = (table) => writes.filter((w) => w.table === table);

beforeEach(() => {
  vi.resetModules();
  writes.length = 0;
  tables.payment_links = { id: 'link-1', link_token: 'tok-1', amount: 100, currency: 'USD' };
  tables.payments = {
    id: 'pay-1',
    arc_order_id: 'ORD-1',
    success_indicator: 'SI-REAL',
    metadata: { payment_link_token: 'tok-1' },
  };
  tables.bookings = {
    id: 'bk-1',
    booking_reference: 'ORD-1',
    status: 'pending',
    payment_status: 'unpaid',
    total_amount: 100,
    booking_details: { order_id: 'ORD-1' },
  };
});

describe('refusing what cannot be verified', () => {
  it('refuses a request with no result indicator, and writes nothing', async () => {
    const res = await complete({ paymentLinkToken: 'tok-1', orderId: 'ORD-1' });
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('refuses an unknown link', async () => {
    tables.payment_links = null;
    const res = await complete({ paymentLinkToken: 'nope', orderId: 'ORD-1', resultIndicator: 'SI-REAL' });
    expect(res.status).toBe(404);
    expect(writes).toHaveLength(0);
  });

  // The exploit: any string used to be accepted.
  it('refuses an indicator that is not the one ARC issued, without asking the gateway', async () => {
    const res = await complete({ paymentLinkToken: 'tok-1', orderId: 'ORD-1', resultIndicator: 'guessed' });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('refuses a payment record that belongs to a different link', async () => {
    tables.payments = { ...tables.payments, metadata: { payment_link_token: 'someone-else' } };
    const res = await complete({ paymentLinkToken: 'tok-1', orderId: 'ORD-1', resultIndicator: 'SI-REAL' });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('does not mark anything paid when the gateway shows no capture', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'PENDING', transaction: [] } });
    const res = await complete({ paymentLinkToken: 'tok-1', orderId: 'ORD-1', resultIndicator: 'SI-REAL' });

    expect(res.status).toBe(402);
    expect(wroteTo('payment_links')).toHaveLength(0);
    expect(wroteTo('payments')).toHaveLength(0);
    expect(wroteTo('bookings')).toHaveLength(0);
  });
});

describe('completing a verified payment', () => {
  it('records the gateway transaction id, not the indicator', async () => {
    axios.get.mockResolvedValue(captured(100));
    const res = await complete({ paymentLinkToken: 'tok-1', orderId: 'ORD-1', resultIndicator: 'SI-REAL' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(wroteTo('payment_links')[0].payload.status).toBe('paid');

    const paymentWrite = wroteTo('payments')[0].payload;
    expect(paymentWrite.payment_status).toBe('completed');
    expect(paymentWrite.arc_transaction_id).toBe('arc-txn-9');
    expect(JSON.stringify(writes)).not.toContain('SI-REAL');
  });
});
