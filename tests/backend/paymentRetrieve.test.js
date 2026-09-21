import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The admin panel's "Check status" (payment-retrieve).
 *
 * It asked ARC for the payments row's own id, which is the ARC order only for a
 * quote; a payment link's order is `PL-...`, so for those it 404'd and did
 * nothing. When it did hear back, it wrote `last_status_check` - a column the
 * payments table does not have - and 'partially_refunded' / 'voided', which
 * its CHECK forbids. The write failed every time, unread, and the handler
 * answered success with the row as it was before, so the desk believed the
 * gateway and the database agreed.
 */

// scripts/db/inquiry-system-schema.sql
const PAYMENT_COLUMNS = [
  'id', 'quote_id', 'inquiry_id', 'arc_transaction_id', 'arc_order_id', 'arc_session_id', 'success_indicator',
  'amount', 'currency', 'payment_status', 'payment_method', 'customer_email', 'customer_name', 'return_url',
  'cancel_url', 'metadata', 'created_at', 'updated_at', 'completed_at',
];
const PAYMENT_STATUSES = ['pending', 'processing', 'completed', 'failed', 'refunded'];

/** Rejects what Postgres would: an unknown column (42703) or a status outside the CHECK (23514). */
const payments = (rows, { down = false } = {}) => fakeBookingsTable([], {
  tables: { payments: rows },
  fail: ({ table, patch }) => table === 'payments' && Boolean(patch) && (
    down
    || Object.keys(patch).some((column) => !PAYMENT_COLUMNS.includes(column))
    || (patch.payment_status !== undefined && !PAYMENT_STATUSES.includes(patch.payment_status))
  ),
});

let db = payments([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => db.from(...args) }; },
  };
});

vi.mock('../../backend/routes/payment/agents.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCaller: async () => ({ id: 'admin-1', role: 'admin' }),
}));

const gatewayFetch = vi.fn();
vi.mock('node-fetch', () => ({ default: (...args) => gatewayFetch(...args) }));

const LINK_PAYMENT = '7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f';
const LINK_ORDER = 'PL-7f1c2d3e-A1B2C3D4E5';

const linkPayment = (over = {}) => ({
  id: LINK_PAYMENT,
  arc_order_id: LINK_ORDER,
  amount: 150,
  currency: 'USD',
  payment_status: 'completed',
  metadata: { payment_link_token: 'tok-1', order_id: LINK_ORDER },
  ...over,
});

/** ARC's answer for the order it was asked about; anything else is a 404. */
const arcSays = (status, orderId = LINK_ORDER) => gatewayFetch.mockImplementation(async (url) => (
  String(url).endsWith(`/order/${orderId}`)
    ? { ok: true, status: 200, json: async () => ({ id: orderId, status }) }
    : { ok: false, status: 404, json: async () => ({ result: 'ERROR' }) }
));

const retrieve = async () => {
  const { handlePaymentRetrieve } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handlePaymentRetrieve(createRequest({ method: 'GET', query: { paymentId: LINK_PAYMENT } }), res);
  return res;
};

const stored = () => db.from('payments').eq('id', LINK_PAYMENT).maybeSingle().then(({ data }) => data);

beforeEach(() => {
  vi.resetModules();
  gatewayFetch.mockReset();
});

describe('Check status', () => {
  it("asks ARC about the order the payment opened, not the row's own id", async () => {
    db = payments([linkPayment()]);
    arcSays('CAPTURED');

    const res = await retrieve();

    expect(gatewayFetch.mock.calls[0][0]).toBe(`https://arc.test/api/merchant/TESTMERCHANT/order/${LINK_ORDER}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.orderData).toMatchObject({ status: 'CAPTURED' });
  });

  it('records a refund ARC reports, in a status the table accepts, and answers with the row as it now is', async () => {
    db = payments([linkPayment()]);
    arcSays('REFUNDED');

    const res = await retrieve();

    expect(res.statusCode).toBe(200);
    expect((await stored()).payment_status).toBe('refunded');
    expect(res.body.payment.payment_status).toBe('refunded');
  });

  // A quote's order id IS the row's id, so the old URL reached ARC - and the
  // write still failed, on `last_status_check`.
  it('records it for a quote payment too, whose order ARC was always asked about', async () => {
    db = payments([linkPayment({ arc_order_id: LINK_PAYMENT, metadata: {} })]);
    arcSays('REFUNDED', LINK_PAYMENT);

    const res = await retrieve();

    expect(res.statusCode).toBe(200);
    expect((await stored()).payment_status).toBe('refunded');
  });

  it('records a voided payment that had been taken as refunded, the way the void itself does', async () => {
    db = payments([linkPayment()]);
    arcSays('CANCELLED');

    const res = await retrieve();

    expect(res.statusCode).toBe(200);
    expect((await stored()).payment_status).toBe('refunded');
  });

  it('never calls a payment that was not taken refunded', async () => {
    db = payments([linkPayment({ payment_status: 'pending' })]);
    arcSays('CANCELLED');

    await retrieve();

    expect((await stored()).payment_status).toBe('pending');
  });

  it('leaves a partly refunded payment completed: the table has no value for it', async () => {
    db = payments([linkPayment()]);
    arcSays('PARTIALLY_REFUNDED');

    const res = await retrieve();

    expect(res.statusCode).toBe(200);
    expect((await stored()).payment_status).toBe('completed');
  });

  it('says so when the record could not be updated', async () => {
    db = payments([linkPayment()], { down: true });
    arcSays('REFUNDED');

    const res = await retrieve();

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.orderData).toMatchObject({ status: 'REFUNDED' });
  });

  it('says so when ARC could not be read, rather than answering as if it had been', async () => {
    db = payments([linkPayment()]);
    gatewayFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const res = await retrieve();

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });
});
