import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * GET /api/payments?action=payment-callback - where a quote payer lands after
 * ARC, and a GET anyone can make.
 *
 * It took the LAST transaction on the ARC order as the payment's result, so a
 * refunded quote payment reached with nothing but its quote id read the
 * successful REFUND as a successful payment: the row went back to completed,
 * the quote and inquiry to paid, the customer got a booking confirmation, and
 * `metadata` - the refund record among it - was replaced wholesale. The result
 * indicator was checked only when one was sent.
 *
 * And it asked ARC for the row's own id. That is the order id only for a quote;
 * a payment link opens `PL-...`, so the RETRIEVE 404'd, and the 404 was read as
 * a decline: a completed payment-link payment was written `failed` with its
 * metadata emptied.
 */

const sendBookingNotificationEmails = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../../backend/services/emailService.js', () => {
  const mailer = { sendBookingNotificationEmails, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  return { ...mailer, default: mailer };
});

let db = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
    get supabase() { return { from: (...args) => db.from(...args) }; },
  };
});

const LINK_PAYMENT_ID = '7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f';
const LINK_ORDER = 'PL-5a6b7c8d-A1B2C3D4E5';

const quotePayment = (over = {}) => ({
  id: 'pay-q1',
  quote_id: 'q1',
  inquiry_id: 'inq-1',
  arc_order_id: 'pay-q1',
  arc_session_id: 'SESSION-Q1',
  success_indicator: 'SI-Q1',
  amount: 291,
  currency: 'USD',
  payment_status: 'pending',
  customer_email: 'jane@example.com',
  customer_name: 'Jane Doe',
  metadata: { order_id: 'pay-q1' },
  created_at: '2026-09-21T08:00:00Z',
  ...over,
});

const linkPayment = (over = {}) => ({
  id: LINK_PAYMENT_ID,
  arc_order_id: LINK_ORDER,
  arc_session_id: 'SESSION-PL',
  success_indicator: 'SI-PL',
  amount: 150,
  currency: 'USD',
  payment_status: 'pending',
  customer_email: 'sam@example.com',
  customer_name: 'Sam Lee',
  metadata: { payment_link_id: 'link-1', payment_link_token: 'tok-1', order_id: LINK_ORDER },
  created_at: '2026-09-21T08:00:00Z',
  ...over,
});

const seed = (payments) => {
  db = fakeBookingsTable([], {
    tables: {
      payments,
      quotes: [{ id: 'q1', quote_number: 'Q-0001', status: 'sent', payment_status: 'unpaid' }],
      inquiries: [{ id: 'inq-1', status: 'quoted', customer_email: 'jane@example.com', inquiry_type: 'flight' }],
      payment_links: [
        { id: 'link-1', link_token: 'tok-1', status: 'pending' },
        { id: 'link-2', link_token: 'tok-victim', status: 'pending' },
      ],
    },
  });
};

const paymentTransaction = (amount, receipt = '625923098465') => ({
  result: 'SUCCESS',
  response: { gatewayCode: 'APPROVED' },
  transaction: { id: '1', type: 'PAYMENT', amount, currency: 'USD', receipt },
});
const refundTransaction = (amount) => ({
  result: 'SUCCESS',
  response: { gatewayCode: 'APPROVED' },
  transaction: { id: '2', type: 'REFUND', amount, currency: 'USD' },
});

const order = (id, status, transaction) => ({ status: 200, data: { id, status, amount: transaction[0]?.transaction?.amount, currency: 'USD', transaction } });

/**
 * ARC by order id, answered the way axios answers: a status outside 2xx
 * throws unless the caller passed `validateStatus`. An order ARC has never
 * seen is a 404.
 */
const arc = (orders) => axios.get.mockImplementation(async (url, config = {}) => {
  const id = decodeURIComponent(String(url).split('/order/')[1] || '');
  const reply = orders[id] ?? { status: 404, data: { result: 'ERROR', error: { cause: 'INVALID_REQUEST', explanation: 'Unable to find order' } } };
  if (reply instanceof Error) throw reply;
  const accepted = config.validateStatus ? config.validateStatus(reply.status) : reply.status >= 200 && reply.status < 300;
  if (!accepted) throw Object.assign(new Error(`Request failed with status code ${reply.status}`), { response: reply });
  return reply;
});

const callback = async (query) => {
  const { handlePaymentCallback } = await import('../../backend/routes/payment/checkout.handlers.js');
  const res = createResponse();
  await handlePaymentCallback(createRequest({ method: 'GET', query }), res);
  return res;
};

const rowOf = (table, id) => db.from(table).eq('id', id).maybeSingle().then(({ data }) => data);
const writesTo = (table) => db.writes.filter((w) => w.table === table && (w.patch || w.insert || w.upsert));

beforeEach(() => {
  vi.resetModules();
  axios.get.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  sendBookingNotificationEmails.mockClear();
});

describe('a quote payer returning from ARC', () => {
  it('records a captured payment once, with the bank reference, and keeps what the row already held', async () => {
    seed([quotePayment()]);
    arc({ 'pay-q1': order('pay-q1', 'CAPTURED', [paymentTransaction(291)]) });

    const res = await callback({ sessionId: 'SESSION-Q1', resultIndicator: 'SI-Q1', quote_id: 'q1', inquiry_id: 'inq-1' });

    expect(res._redirectUrl).toBe('/payment/success?paymentId=pay-q1');
    const payment = await rowOf('payments', 'pay-q1');
    expect(payment.payment_status).toBe('completed');
    expect(payment.arc_transaction_id).toBe('1');
    expect(payment.metadata.arc_receipt).toBe('625923098465');
    expect(payment.metadata.order_id).toBe('pay-q1');
    expect((await rowOf('quotes', 'q1')).status).toBe('paid');
    expect((await rowOf('inquiries', 'inq-1')).status).toBe('paid');
    expect(sendBookingNotificationEmails).toHaveBeenCalledTimes(1);

    // The same return again - the back button, a reload - settles nothing twice.
    const writesBefore = db.writes.length;
    const again = await callback({ sessionId: 'SESSION-Q1', resultIndicator: 'SI-Q1', quote_id: 'q1', inquiry_id: 'inq-1' });
    expect(again._redirectUrl).toBe('/payment/success?paymentId=pay-q1');
    expect(db.writes.length).toBe(writesBefore);
    expect(sendBookingNotificationEmails).toHaveBeenCalledTimes(1);
  });

  it('records a declined payment as failed, and the row keeps its metadata', async () => {
    seed([quotePayment()]);
    arc({
      'pay-q1': {
        status: 200,
        data: {
          id: 'pay-q1', status: 'FAILED', result: 'FAILURE', amount: 291,
          transaction: [{ result: 'FAILURE', response: { gatewayCode: 'DECLINED' }, transaction: { id: '1', type: 'PAYMENT', amount: 291 } }],
        },
      },
    });

    const res = await callback({ sessionId: 'SESSION-Q1', resultIndicator: 'SI-Q1' });

    expect(res._redirectUrl).toBe('/payment/failed?reason=DECLINED&paymentId=pay-q1');
    const payment = await rowOf('payments', 'pay-q1');
    expect(payment.payment_status).toBe('failed');
    expect(payment.metadata.order_id).toBe('pay-q1');
    expect(payment.metadata.failureReason).toBe('DECLINED');
    expect(sendBookingNotificationEmails).not.toHaveBeenCalled();
  });

  it('does not call a gateway that did not answer a decline', async () => {
    seed([quotePayment()]);
    arc({ 'pay-q1': Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });

    const res = await callback({ sessionId: 'SESSION-Q1', resultIndicator: 'SI-Q1' });

    expect(res._redirectUrl).toBe('/inquiry/inq-1?payment=pending');
    expect(writesTo('payments')).toEqual([]);
    expect((await rowOf('payments', 'pay-q1')).payment_status).toBe('pending');
  });
});

describe('what the callback may never do', () => {
  it('turns a refunded payment back into a paid one - not with its quote id, and not with its own indicator', async () => {
    const refunds = [{ amount: 291, transactionId: 'refund-admin-1', by: 'admin' }];
    seed([quotePayment({ payment_status: 'refunded', metadata: { order_id: 'pay-q1', refunds } })]);
    // The last transaction on the order is the successful refund.
    arc({ 'pay-q1': order('pay-q1', 'REFUNDED', [paymentTransaction(291), refundTransaction(291)]) });

    for (const query of [{ quote_id: 'q1' }, { quote_id: 'q1', resultIndicator: 'SI-Q1' }, { sessionId: 'SESSION-Q1', resultIndicator: 'SI-Q1' }]) {
      await callback(query);
    }

    const payment = await rowOf('payments', 'pay-q1');
    expect(payment.payment_status).toBe('refunded');
    expect(payment.metadata.refunds).toEqual(refunds);
    expect(writesTo('payments')).toEqual([]);
    expect(writesTo('quotes')).toEqual([]);
    expect(writesTo('inquiries')).toEqual([]);
    expect(sendBookingNotificationEmails).not.toHaveBeenCalled();
  });

  it('does not read a refund as a payment on a row that was never settled', async () => {
    seed([quotePayment()]);
    arc({ 'pay-q1': order('pay-q1', 'REFUNDED', [paymentTransaction(291), refundTransaction(291)]) });

    await callback({ sessionId: 'SESSION-Q1', resultIndicator: 'SI-Q1' });

    expect((await rowOf('payments', 'pay-q1')).payment_status).not.toBe('completed');
    expect(writesTo('quotes')).toEqual([]);
    expect(sendBookingNotificationEmails).not.toHaveBeenCalled();
  });

  it('writes nothing without the indicator ARC gave the payer', async () => {
    seed([quotePayment()]);
    arc({ 'pay-q1': order('pay-q1', 'CAPTURED', [paymentTransaction(291)]) });

    const res = await callback({ quote_id: 'q1', inquiry_id: 'inq-1' });

    expect(res._redirectUrl).toBe('/inquiry/inq-1?payment=failed&error=invalid_indicator');
    expect(db.writes.filter((w) => w.patch)).toEqual([]);
    expect(sendBookingNotificationEmails).not.toHaveBeenCalled();
  });

  it('marks paid only the payment link this payment was opened for, never one named in the query', async () => {
    seed([quotePayment()]);
    arc({ 'pay-q1': order('pay-q1', 'CAPTURED', [paymentTransaction(291)]) });

    await callback({ sessionId: 'SESSION-Q1', resultIndicator: 'SI-Q1', paymentLinkToken: 'tok-victim' });

    expect((await rowOf('payments', 'pay-q1')).payment_status).toBe('completed');
    expect((await rowOf('payment_links', 'link-2')).status).toBe('pending');
  });
});

describe('a payment-link payment reaching the callback', () => {
  it('leaves a completed payment exactly as it is', async () => {
    const metadata = { payment_link_id: 'link-1', payment_link_token: 'tok-1', order_id: LINK_ORDER, arc_receipt: '625923098465' };
    seed([linkPayment({ payment_status: 'completed', metadata })]);
    arc({ [LINK_ORDER]: order(LINK_ORDER, 'CAPTURED', [paymentTransaction(150)]) });

    await callback({ sessionId: 'SESSION-PL' });

    const payment = await rowOf('payments', LINK_PAYMENT_ID);
    expect(payment.payment_status).toBe('completed');
    expect(payment.metadata).toEqual(metadata);
    expect(writesTo('payments')).toEqual([]);
  });

  it('asks ARC about the order the link opened, and keeps the link token on the row', async () => {
    seed([linkPayment()]);
    arc({ [LINK_ORDER]: order(LINK_ORDER, 'CAPTURED', [paymentTransaction(150)]) });

    const res = await callback({ sessionId: 'SESSION-PL', resultIndicator: 'SI-PL' });

    expect(axios.get.mock.calls[0][0]).toBe(`https://arc.test/api/rest/version/77/merchant/TESTMERCHANT/order/${LINK_ORDER}`);
    expect(res._redirectUrl).toBe(`/payment/success?paymentId=${LINK_PAYMENT_ID}`);
    const payment = await rowOf('payments', LINK_PAYMENT_ID);
    expect(payment.payment_status).toBe('completed');
    expect(payment.metadata.payment_link_token).toBe('tok-1');
    expect(payment.metadata.arc_receipt).toBe('625923098465');
    expect((await rowOf('payment_links', 'link-1')).status).toBe('paid');
  });
});

describe('a direct booking', () => {
  // Hosted checkout keeps its payment on the booking row, and its return page
  // reconciles the booking; it opens no payments row for this callback to find.
  it('finds no payments row and writes nothing', async () => {
    seed([quotePayment()]);
    const res = await callback({ orderId: 'FLT123456', resultIndicator: 'SI-FLT' });

    expect(res._redirectUrl).toBe('/payment/failed?error=invalid_session');
    expect(db.writes.filter((w) => w.patch)).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
