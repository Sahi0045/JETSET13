import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A quote payment page is handed out only once its success indicator is stored.
 *
 * handleInitiatePayment creates the ARC session, then writes arc_session_id,
 * success_indicator and arc_order_id onto the payments row - and ignored that
 * write's error. The callback now refuses any payment whose stored indicator
 * is missing (handlePaymentCallback's invalid_indicator check). So one failed
 * write handed the customer a live ARC page; they paid, the callback sent them
 * to "payment failed", and nothing was recorded: charged, and told it failed,
 * which invites a second payment. The page is now withheld unless the write
 * went through and matched the row.
 */

const rows = {
  quotes: { id: 'q1', inquiry_id: 'inq-1', total_amount: 291, currency: 'USD', title: 'Goa', quote_number: 'Q-1' },
  inquiries: { customer_email: 'jane@example.com', customer_name: 'Jane Doe' },
  payments: { id: 'pay-1' },
};
let updateResult;
const updates = [];

const builder = (table) => {
  const state = { op: 'select' };
  const b = {
    select: vi.fn(() => b),
    insert: vi.fn(() => { state.op = 'insert'; return b; }),
    update: vi.fn((patch) => { state.op = 'update'; updates.push({ table, patch }); return b; }),
    eq: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    single: vi.fn(async () => ({ data: rows[table] ?? null, error: null })),
    // Awaited without .single(): an UPDATE, answered as the test says.
    then: (resolve, reject) => Promise.resolve(state.op === 'update' ? updateResult : { data: null, error: null }).then(resolve, reject),
  };
  b.maybeSingle = b.single;
  return b;
};

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    supabase: { from: vi.fn((table) => builder(table)) },
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
  };
});

const initiatePayment = async () => {
  const { handleInitiatePayment } = await import('../../backend/routes/payment/checkout.handlers.js');
  const res = createResponse();
  await handleInitiatePayment(createRequest({ method: 'POST', body: { quote_id: 'q1' } }), res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  updates.length = 0;
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'SESSION123' }, successIndicator: 'SI-QUOTE-1' } });
});

describe('the quote payment page and its stored success indicator', () => {
  it('is withheld when storing the indicator fails, and says nothing has been charged', async () => {
    updateResult = { data: null, error: { message: 'connection reset' } };

    const res = await initiatePayment();

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/nothing has been charged/i);
    expect(res.body).not.toHaveProperty('paymentPageUrl');
    expect(res.body).not.toHaveProperty('checkoutUrl');
    expect(JSON.stringify(res.body)).not.toContain('SESSION123');
  });

  it('is withheld when the write matched no payment row', async () => {
    updateResult = { data: [], error: null };

    const res = await initiatePayment();

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/nothing has been charged/i);
    expect(res.body).not.toHaveProperty('checkoutUrl');
  });

  it('is handed out once the indicator is stored on the row', async () => {
    updateResult = { data: [{ id: 'pay-1' }], error: null };

    const res = await initiatePayment();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, checkoutUrl: 'https://api.arcpay.travel/checkout/pay/SESSION123' });
    expect(updates).toContainEqual({
      table: 'payments',
      patch: { arc_session_id: 'SESSION123', success_indicator: 'SI-QUOTE-1', arc_order_id: 'pay-1' },
    });
  });
});
