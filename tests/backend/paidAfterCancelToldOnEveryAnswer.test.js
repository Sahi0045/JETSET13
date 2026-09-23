import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The payer of a checkout cancelled while its ARC payment page was open, who
 * paid on that page, told about their money on every answer - not the first
 * one only.
 *
 * The first POST /order records the payment (recordPaymentAfterCancel:
 * REFUND_UNDER_REVIEW, `paidAfterCancel`) and answers "This booking was
 * cancelled before your payment went through" with bookingFailed and
 * refunded: false, so the order page says the payment has not been reversed
 * yet and our team will refund it. The next answer found the cancellation no
 * longer NOTHING_TO_REFUND, and said only "This booking was cancelled and
 * cannot be completed": the page showed "Booking Failed ... Start a new
 * search" and nothing about the 291 USD still at ARC. That is the answer to a
 * reload of the order page (location.state survives it), and the first answer
 * when the abandoned-checkout job found the payment before the payer came
 * back. Every answer now reads the payment the cancellation recorded, and
 * what its payment record says became of it since (paymentStateOf).
 *
 * The harness is paidAfterCheckoutCancelled.test.js's: the real cancel
 * handler, the real order route and job, and the fake bookings table.
 */

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

const REF = 'FLTOPEN1';
const MIN = 60_000;
const openedAt = () => new Date(Date.now() - 5 * MIN).toISOString();

// Hosted checkout's row: the payment page opened five minutes ago.
const openCheckout = (over = {}, details = {}) => ({
  id: 'bk-open1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'unpaid',
  total_amount: 291,
  user_id: '11111111-1111-4111-8111-111111111111',
  created_at: openedAt(),
  ...over,
  booking_details: {
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    arc_pay_checkout_url: 'https://api.arcpay.travel/checkout/pay/SESSION1',
    session_id: 'SESSION1',
    pending_booking_data: { returnUrl: 'https://www.jetsetterss.com/payment/callback', bookingData: {} },
    ...details,
  },
});

const noSuchOrder = { status: 404, data: { error: { cause: 'INVALID_REQUEST' } } };
const capture = { result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD', receipt: 'RRN1' } };
const captured = { status: 200, data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [capture] } };
const refunded = {
  status: 200,
  data: {
    status: 'REFUNDED', amount: 291, currency: 'USD',
    transaction: [capture, { result: 'SUCCESS', transaction: { id: '2', type: 'REFUND', amount: 291, currency: 'USD' } }],
  },
};

const LATE = 'This booking was cancelled before your payment went through, so it has not been booked.';
const PLAIN = { success: false, error: 'This booking was cancelled and cannot be completed', code: 'BOOKING_CANCELLED' };
const lateAnswer = (paymentState) => ({
  success: false, error: LATE, message: LATE, code: 'BOOKING_CANCELLED', bookingFailed: true,
  refunded: paymentState === 'returned', paymentState,
});

const moneyMoved = () => axios.put.mock.calls.some(([, body]) => ['VOID', 'REFUND'].includes(body?.apiOperation));
const row = () => ({ ...table.row(REF) });

beforeEach(async () => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { createFlightOrder: vi.fn(), cancelFlightOrder: vi.fn(), priceFlightOffer: vi.fn() },
    providerStatus: () => ({ bookingEnabled: true }),
  }));
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn(async () => ({ success: true })) };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  table = fakeBookingsTable([openCheckout()]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation((...args) => table.from(...args));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.doUnmock('../../backend/services/emailService.js');
  vi.unstubAllEnvs();
});

/** The desk presses Cancel & Refund while ARC has no order yet. */
async function cancelWhilePageOpen() {
  axios.get.mockResolvedValue(noSuchOrder);
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handleCancelBookingAction({
    method: 'POST', body: { bookingReference: REF, reason: 'Cancelled by the support desk' },
    user: { id: 'staff-1', role: 'support' }, headers: {}, cookies: {},
  }, res);
  expect(res.body.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
  expect(table.row(REF).status).toBe('cancelled');
  axios.get.mockReset();
}

/** The payer's browser comes back from ARC and posts the order. */
async function postOrder(body = { bookingReference: REF, orderId: REF, transactionId: `SI-${REF}` }) {
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return request(app).post('/api/flights/order').send(body);
}

async function runJob(options = {}) {
  const { runOnce } = await import('../../backend/jobs/abandonedCheckout.job.js');
  return runOnce({ site: 'site', checked: new Map(), send: vi.fn(), flag: vi.fn(), ...options });
}

describe('a payment made after the checkout was cancelled, on every answer', () => {
  it('a reload of the order page after the first answer: the same answer, and nothing recorded twice', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);
    const first = await postOrder();
    const recorded = row().booking_details;
    axios.get.mockClear();

    const reload = await postOrder();

    expect(first.status).toBe(409);
    expect(first.body).toMatchObject({ code: 'BOOKING_CANCELLED', bookingFailed: true, refunded: false, error: LATE });
    expect(reload.status).toBe(409);
    expect(reload.body).toEqual(lateAnswer('held'));
    // Answered from the row: ARC is not asked again, and nothing moves or is written.
    expect(axios.get).not.toHaveBeenCalled();
    expect(moneyMoved()).toBe(false);
    expect(row().booking_details).toEqual(recorded);
  });

  it('the job found the payment before the payer came back: told it on their first answer', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);
    expect(await runJob()).toEqual([{ bookingReference: REF, outcome: 'paid-after-cancel', final: true }]);

    const res = await postOrder();

    expect(res.status).toBe(409);
    expect(res.body).toEqual(lateAnswer('held'));
    expect(moneyMoved()).toBe(false);
  });

  it('returned by the desk since: says it was refunded', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);
    await postOrder();
    axios.get.mockReset();
    axios.get.mockResolvedValueOnce(captured).mockResolvedValue(refunded);
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
    const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
    expect((await settleManualFlightRefund(row(), { mode: 'refund', amount: 291, adminId: 'staff-1' })).status).toBe(200);
    axios.put.mockClear();

    const res = await postOrder();

    expect(res.body).toEqual(lateAnswer('returned'));
    expect(res.body.refunded).toBe(true);
    expect(moneyMoved()).toBe(false);
  });

  it('partly returned since: says so, not that it was refunded', async () => {
    table = fakeBookingsTable([openCheckout({ status: 'cancelled', payment_status: 'partially_refunded' }, {
      cancellation: {
        paymentAction: 'PARTIAL_REFUND', refundAmount: 100, cancelledAt: new Date().toISOString(),
        paidAfterCancel: { at: new Date().toISOString(), amount: 291, currency: 'USD' },
      },
    })]);

    const res = await postOrder();

    expect(res.body).toEqual(lateAnswer('partly_returned'));
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('a gateway that cannot be reached: says the payment could not be checked, and what happens to one made after the cancel', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue({ status: 503, data: {} });

    const res = await postOrder();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CANCELLED');
    // Nothing known to be taken, so no "not reversed yet" line.
    expect(res.body.bookingFailed).toBeUndefined();
    expect(res.body.error).toMatch(/^This booking was cancelled, so it cannot be completed\. /);
    expect(res.body.error).toMatch(/could not check with the payment gateway just now/);
    expect(res.body.error).toMatch(/If you paid for it after it was cancelled, it has not been booked, and our team will refund you\./);
    expect(res.body.error).toContain(REF);
    expect(row().booking_details.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
  });
});

describe('what stays as it was', () => {
  it('a cancelled checkout ARC has no payment for: the plain answer', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(noSuchOrder);

    const res = await postOrder();

    expect(res.body).toEqual(PLAIN);
  });

  it('a cancelled booking whose own cancel settled the money, paid before it was cancelled: the plain answer, the gateway not asked', async () => {
    for (const [paymentAction, paymentStatus] of [['VOID', 'refunded'], ['FULL_REFUND', 'refunded'], ['REFUND_UNDER_REVIEW', 'paid'], ['REFUND_FAILED', 'paid']]) {
      table = fakeBookingsTable([openCheckout({ status: 'cancelled', payment_status: paymentStatus }, {
        cancellation: { paymentAction, cancelledAt: new Date().toISOString(), refundAmount: 0 },
      })]);
      axios.get.mockReset();

      const res = await postOrder();

      expect(res.body).toEqual(PLAIN);
      expect(axios.get).not.toHaveBeenCalled();
    }
  });

  it('a caller who cannot prove the payment learns nothing of it', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);
    await postOrder();

    const res = await postOrder({ bookingReference: REF, orderId: REF, transactionId: 'SI-SOMEONE-ELSE' });

    expect(res.status).toBe(403);
    expect(res.body.bookingFailed).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/payment went through/);
  });
});
