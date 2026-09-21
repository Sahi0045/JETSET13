import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Opening the ARC payment page for a payment link.
 *
 * Every Pay click minted a new ARC order, `PL-<link>-<last 6 digits of the
 * clock>`, so a customer who clicked twice, or paid and came back before the
 * link was marked paid, had two live payment pages and could be charged twice.
 * The clock suffix repeats every 1,000 seconds. And the booking row the
 * payment is completed against was inserted without reading its error: if it
 * was refused, the customer was still sent to pay, and completing the payment
 * then answered "Booking not found" - the capture recorded nowhere.
 */

const LINK_ID = '5a6b7c8d-0000-4000-8000-000000000001';
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

let db = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => db.from(...args) }; },
  };
});

const link = { id: LINK_ID, link_token: 'tok-1', status: 'pending', amount: 150, currency: 'USD', booking_type: 'flight', customer_name: 'Sam Lee', customer_email: 'sam@example.com' };

/** A page opened for this link earlier. */
const earlierPage = (over = {}) => ({
  id: 'pay-old',
  arc_order_id: 'PL-5a6b7c8d-OLDORDER01',
  arc_session_id: 'SESSION-OLD',
  success_indicator: 'SI-OLD',
  payment_status: 'pending',
  amount: 150,
  currency: 'USD',
  metadata: { payment_link_id: LINK_ID, payment_link_token: 'tok-1', order_id: 'PL-5a6b7c8d-OLDORDER01' },
  created_at: minutesAgo(3),
  ...over,
});

const seed = ({ payments = [], bookings = [], fail } = {}) => {
  db = fakeBookingsTable(bookings, { tables: { payment_links: [{ ...link }], payments }, fail });
};

const process = async () => {
  const { handleProcessPaymentLink } = await import('../../backend/routes/payment/links.handlers.js');
  const res = createResponse();
  await handleProcessPaymentLink(createRequest({ method: 'POST', body: { token: 'tok-1' } }), res);
  return res;
};

/** ARC by order id; an order it has never seen - a page nobody paid on - is a 404. */
const arcOrders = (orders) => axios.get.mockImplementation(async (url) => {
  const id = String(url).split('/order/')[1];
  return orders[id] ?? { status: 404, data: { result: 'ERROR', error: { cause: 'INVALID_REQUEST' } } };
});

const captured = { status: 200, data: { status: 'CAPTURED', amount: 150, transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 150 } }] } };
const openedSessions = () => axios.post.mock.calls.filter(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT');

let session = 0;
beforeEach(() => {
  vi.resetModules();
  session = 0;
  axios.post.mockReset();
  axios.post.mockImplementation(async () => {
    session += 1;
    return { status: 201, data: { result: 'SUCCESS', session: { id: `SESSION-${session}` }, successIndicator: `SI-${session}` } };
  });
  axios.get.mockReset();
  arcOrders({});
});

afterEach(() => vi.useRealTimers());

describe('a second Pay click on a link', () => {
  it('while its payment page is still open gets that page back, not a second one', async () => {
    seed({ payments: [earlierPage()] });

    const res = await process();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      reused: true,
      sessionId: 'SESSION-OLD',
      orderId: 'PL-5a6b7c8d-OLDORDER01',
      checkoutUrl: 'https://api.arcpay.travel/checkout/pay/SESSION-OLD',
    });
    expect(openedSessions()).toHaveLength(0);
    expect(db.writes.filter((w) => w.insert)).toEqual([]);
  });

  it('after an earlier page was paid but never recorded is refused, and opens nothing', async () => {
    seed({ payments: [earlierPage({ created_at: minutesAgo(40) })] });
    arcOrders({ 'PL-5a6b7c8d-OLDORDER01': captured });

    const res = await process();

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(openedSessions()).toHaveLength(0);
  });

  it('when ARC cannot say whether an earlier page was paid is refused, and opens nothing', async () => {
    seed({ payments: [earlierPage({ created_at: minutesAgo(40) })] });
    arcOrders({ 'PL-5a6b7c8d-OLDORDER01': { status: 503, data: {} } });

    const res = await process();

    expect(res.statusCode).toBe(503);
    expect(openedSessions()).toHaveLength(0);
  });

  // The link reused a page for sixteen minutes, one more than ARC keeps it
  // open, so a Pay click in that minute got back a page that was already shut.
  it('in the last minute of the earlier page, opens a fresh one rather than hand back a page about to close', async () => {
    seed({ payments: [earlierPage({ created_at: minutesAgo(14.5) })] });

    const res = await process();

    expect(res.statusCode).toBe(200);
    expect(res.body.reused).toBeUndefined();
    expect(openedSessions()).toHaveLength(1);
    expect(openedSessions()[0][1].interaction.timeout).toBe(900);
  });

  it('after an earlier page expired unpaid opens a fresh one', async () => {
    seed({ payments: [earlierPage({ created_at: minutesAgo(40) })] });

    const res = await process();

    expect(res.statusCode).toBe(200);
    expect(res.body.reused).toBeUndefined();
    expect(openedSessions()).toHaveLength(1);
    expect(res.body.orderId).not.toBe('PL-5a6b7c8d-OLDORDER01');
  });

  it('gets a new ARC order reference that cannot repeat an earlier one', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-21T10:00:00.000Z'), toFake: ['Date'] });
    seed();
    const first = await process();
    // The first page runs out unpaid 1,000 seconds later - exactly when a
    // clock-digit suffix comes round again.
    vi.setSystemTime(new Date(Date.parse('2026-09-21T10:00:00.000Z') + 1_000_000));
    const second = await process();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.body.orderId).not.toBe(first.body.orderId);
  });
});

describe('a payment page is handed over only once its records exist', () => {
  it('not when the booking row it completes against was refused', async () => {
    seed({ fail: ({ table, write }) => table === 'bookings' && write?.kind === 'insert' });

    const res = await process();

    expect(res.statusCode).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body).not.toHaveProperty('checkoutUrl');
    expect(res.body).not.toHaveProperty('sessionId');
  });

  it('not when the payment record was refused, and the booking row it opened is taken back', async () => {
    seed({ fail: ({ table, write }) => table === 'payments' && write?.kind === 'insert' });

    const res = await process();

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toHaveProperty('checkoutUrl');
    expect(db.table).toEqual([]);
  });
});
