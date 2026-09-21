import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A quote or a payment link is paid in US dollars, or not online at all.
 *
 * The merchant settles only USD and answers any other currency with HTTP 501
 * (arcpay.config.js, ARC_SETTLEMENT_CURRENCY). Hosted checkout pins USD because
 * its amounts are computed in USD. A quote's or a link's amount is in whatever
 * currency the agent picked, so relabelling it USD would charge a different
 * sum - INR 25,000 as USD 25,000. Instead it was sent to ARC as it was: the
 * session was refused, the customer read "Payment initiation failed", and the
 * quote path had already written a payments row that stayed pending forever.
 * Now it is refused up front, with the reason, and the link at creation.
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

vi.mock('../../backend/routes/payment/payment.helpers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCallerInfo: () => ({ role: 'admin', agentId: null, userId: 'admin-1' }),
}));

const call = async (handlerName, module, body) => {
  const handlers = await import(`../../backend/routes/payment/${module}`);
  const res = createResponse();
  await handlers[handlerName](createRequest({ method: 'POST', body }), res);
  return res;
};

const openedSession = () => axios.post.mock.calls.some(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT');
const inserted = (table) => db.writes.filter((w) => w.table === table && w.insert);

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'SESSION123' }, successIndicator: 'SI' } });
  axios.get.mockReset();
});

describe('a quote', () => {
  const seed = (currency) => {
    db = fakeBookingsTable([], {
      tables: {
        quotes: [{ id: 'q1', inquiry_id: 'inq-1', total_amount: 25000, currency, title: 'Goa' }],
        inquiries: [{ id: 'inq-1', customer_email: 'jane@example.com', customer_name: 'Jane Doe' }],
        payments: [],
      },
    });
  };

  it('priced in another currency is refused before a payment record or a session exists', async () => {
    seed('INR');
    const res = await call('handleInitiatePayment', 'checkout.handlers.js', { quote_id: 'q1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CURRENCY_NOT_SUPPORTED');
    expect(res.body.error).toMatch(/US dollars/);
    expect(inserted('payments')).toEqual([]);
    expect(openedSession()).toBe(false);
  });

  it('priced in USD is sent to ARC in USD', async () => {
    seed('USD');
    await call('handleInitiatePayment', 'checkout.handlers.js', { quote_id: 'q1' });

    const sent = axios.post.mock.calls.find(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT')?.[1];
    expect(sent.order.currency).toBe('USD');
  });
});

describe('a payment link', () => {
  it('cannot be created in another currency', async () => {
    db = fakeBookingsTable([], { tables: { payment_links: [] } });
    const res = await call('handleCreatePaymentLink', 'links.handlers.js', { customerName: 'Sam Lee', amount: 150, currency: 'EUR' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CURRENCY_NOT_SUPPORTED');
    expect(inserted('payment_links')).toEqual([]);
  });

  it('made in another currency before this check opens no payment page', async () => {
    db = fakeBookingsTable([], {
      tables: {
        payment_links: [{ id: '5a6b7c8d-0000-4000-8000-000000000001', link_token: 'tok-1', status: 'pending', amount: 150, currency: 'GBP', booking_type: 'flight' }],
        payments: [],
      },
    });
    const res = await call('handleProcessPaymentLink', 'links.handlers.js', { token: 'tok-1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CURRENCY_NOT_SUPPORTED');
    expect(openedSession()).toBe(false);
    expect(inserted('payments')).toEqual([]);
    expect(inserted('bookings')).toEqual([]);
  });

  it('in USD is sent to ARC in USD', async () => {
    db = fakeBookingsTable([], {
      tables: {
        payment_links: [{ id: '5a6b7c8d-0000-4000-8000-000000000001', link_token: 'tok-1', status: 'pending', amount: 150, currency: 'USD', booking_type: 'flight' }],
        payments: [],
      },
    });
    const res = await call('handleProcessPaymentLink', 'links.handlers.js', { token: 'tok-1' });

    expect(res.statusCode).toBe(200);
    const sent = axios.post.mock.calls.find(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT')?.[1];
    expect(sent.order.currency).toBe('USD');
  });
});
