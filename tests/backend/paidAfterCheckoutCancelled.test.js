import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf } from '../../shared/reviewQueue.js';
import { describeHeld, selectUnrefunded } from '../../backend/jobs/paymentFailureAlert.job.js';
import { needsManualRefund } from '../../frontend/src/utils/bookingStatus.js';

/**
 * A flight checkout cancelled while its ARC payment page is still open, then
 * paid on that page.
 *
 * Modify Status refuses to cancel a checkout that opened a payment page and
 * sends staff to Cancel & Refund, which asks the gateway first. ARC answers 404
 * - nothing paid yet - and the cancel closes the booking NOTHING_TO_REFUND. The
 * page stays payable for as long as ARC keeps it (ARC_PAGE_TIMEOUT_SECONDS, and
 * the abandoned-checkout job allows PAYABLE_MS). A payment made there
 * afterwards landed on a cancelled row: the order route answered "cancelled"
 * before asking the gateway, the job read pending rows only, and neither alarm
 * nor the desk list reads a cancellation that took nothing. 291 USD stayed at
 * ARC and nobody was told.
 *
 * Nothing is refunded automatically here - a person finishes it with Finish
 * refund - but the payer, the desk, the payment alarm and the job all see it.
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
const HOUR = 60 * MIN;
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

/** The payer's browser comes back from ARC and posts the order, with the payer's proof or without it. */
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

/** What every reader of the booking should now say about the 291 USD. */
function expectHeldForTheDesk(booking) {
  const details = booking.booking_details;
  expect(`${booking.status}/${booking.payment_status}`).toBe('cancelled/paid');
  expect(details.cancellation).toMatchObject({
    paymentAction: 'REFUND_UNDER_REVIEW',
    refundAmount: 0,
    paidAfterCancel: { amount: 291, currency: 'USD' },
  });
  expect(details.needs_review).toMatchObject({ source: 'cancellation' });
  expect(details.needs_review.reason).toMatch(/paid after it was cancelled/);
  // The desk list, the desk's Finish refund button and the payment alarm.
  expect(attentionOf(booking)).toMatchObject({ kind: 'review' });
  expect(needsManualRefund(booking)).toBe(true);
  expect(selectUnrefunded([booking])).toHaveLength(1);
  expect(describeHeld(booking)).toMatch(/held because: paid after it was cancelled/);
}

describe('a checkout paid on its payment page after it was cancelled', () => {
  it('tells the returning payer it was not booked and their payment is still held, and puts it in front of the desk and the payment alarm', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);

    const res = await postOrder();

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'BOOKING_CANCELLED', bookingFailed: true, refunded: false });
    expect(res.body.error).toMatch(/cancelled before your payment went through/);
    expect(moneyMoved()).toBe(false);
    expectHeldForTheDesk(row());
  });

  it('is found by the abandoned-checkout job when the payer never comes back', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);

    const settled = await runJob();

    expect(settled).toEqual([{ bookingReference: REF, outcome: 'paid-after-cancel', final: true }]);
    expect(moneyMoved()).toBe(false);
    expectHeldForTheDesk(row());
  });

  it('is recorded once when the returning payer and the job both find it', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);

    await postOrder();
    const flagged = row().booking_details.needs_review;
    const settled = await runJob();

    expect(settled).toEqual([]);
    expect(row().booking_details.needs_review).toEqual(flagged);
    expect(flagged.previous).toBeUndefined();
  });

  it('is returned by the desk with Finish refund, and then leaves every list', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);
    await runJob();

    axios.get.mockReset();
    axios.get.mockResolvedValueOnce(captured).mockResolvedValue(refunded);
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
    const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
    const answer = await settleManualFlightRefund(row(), { mode: 'refund', amount: 291, adminId: 'staff-1' });

    expect(answer.status).toBe(200);
    const after = row();
    expect(`${after.status}/${after.payment_status}`).toBe('cancelled/refunded');
    expect(after.booking_details.cancellation.paymentAction).toBe('FULL_REFUND');
    expect(attentionOf(after)).toBeNull();
    expect(selectUnrefunded([after])).toEqual([]);
    expect(await runJob()).toEqual([]);
  });
});

describe('what stays as it was', () => {
  it('a cancelled checkout ARC still has no payment for: the plain answer, nothing written, asked again until the page has closed for good', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(noSuchOrder);
    const before = row();

    const res = await postOrder();

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: 'This booking was cancelled and cannot be completed', code: 'BOOKING_CANCELLED' });
    expect(row().booking_details.cancellation).toEqual(before.booking_details.cancellation);
    expect(row().booking_details.needs_review).toBeUndefined();

    expect(await runJob()).toEqual([{ bookingReference: REF, outcome: 'not-paid', final: false }]);
    expect(await runJob({ now: Date.now() + 4 * HOUR })).toEqual([{ bookingReference: REF, outcome: 'not-paid', final: true }]);
    expect(row().booking_details.needs_review).toBeUndefined();
  });

  it('a cancelled booking whose cancel already settled the money: the gateway is not asked', async () => {
    for (const [paymentAction, paymentStatus] of [['VOID', 'refunded'], ['FULL_REFUND', 'refunded'], ['REFUND_UNDER_REVIEW', 'paid']]) {
      table = fakeBookingsTable([openCheckout({ status: 'cancelled', payment_status: paymentStatus }, {
        cancellation: { paymentAction, cancelledAt: new Date().toISOString(), refundAmount: 0 },
      })]);
      axios.get.mockReset();

      const res = await postOrder();

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CANCELLED');
      expect(res.body.bookingFailed).toBeUndefined();
      expect(axios.get).not.toHaveBeenCalled();
      expect(await runJob()).toEqual([]);
    }
  });

  it('a caller who cannot prove the payment learns nothing and the gateway is not asked', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue(captured);

    const res = await postOrder({ bookingReference: REF, orderId: REF, transactionId: 'SI-SOMEONE-ELSE' });

    expect(res.status).toBe(403);
    expect(axios.get).not.toHaveBeenCalled();
    expect(row().booking_details.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
  });

  it('a gateway that cannot be reached: the plain answer, nothing written, and the job asks again', async () => {
    await cancelWhilePageOpen();
    axios.get.mockResolvedValue({ status: 503, data: {} });

    const res = await postOrder();

    expect(res.status).toBe(409);
    expect(res.body.bookingFailed).toBeUndefined();
    expect(row().booking_details.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    expect(await runJob()).toEqual([{ bookingReference: REF, outcome: 'gateway-unavailable', final: false }]);
  });
});

describe('which cancelled checkouts the job asks about', () => {
  const cancelledRow = (over = {}, details = {}) => openCheckout({ status: 'cancelled', ...over }, {
    cancellation: { paymentAction: 'NOTHING_TO_REFUND', cancelledAt: new Date(Date.now() - MIN).toISOString(), refundAmount: 0 },
    ...details,
  });

  it('a hosted checkout of this site, cancelled with nothing taken while its page could be paid', async () => {
    const { selectCancelledCheckouts, PAYABLE_MS } = await import('../../backend/jobs/abandonedCheckout.job.js');
    const now = Date.now();
    const created = new Date(now - 5 * HOUR).toISOString();

    expect(selectCancelledCheckouts([cancelledRow()], { now, site: 'site' })).toHaveLength(1);
    // Paid but not recorded yet: reconcile wrote `paid`, the flag did not land.
    expect(selectCancelledCheckouts([cancelledRow({ payment_status: 'paid' })], { now, site: 'site' })).toHaveLength(1);

    expect(selectCancelledCheckouts([cancelledRow()], { now, site: 'local' })).toEqual([]);
    expect(selectCancelledCheckouts([cancelledRow({ status: 'pending' })], { now, site: 'site' })).toEqual([]);
    expect(selectCancelledCheckouts([cancelledRow({ travel_type: 'cruise' })], { now, site: 'site' })).toEqual([]);
    expect(selectCancelledCheckouts([cancelledRow({ payment_status: 'refunded' })], { now, site: 'site' })).toEqual([]);
    expect(selectCancelledCheckouts([cancelledRow({}, { success_indicator: undefined })], { now, site: 'site' })).toEqual([]);
    expect(selectCancelledCheckouts([cancelledRow({}, {
      cancellation: { paymentAction: 'VOID', cancelledAt: new Date(now - MIN).toISOString() },
    })], { now, site: 'site' })).toEqual([]);
    // Cancelled once the page could no longer be paid.
    expect(selectCancelledCheckouts([cancelledRow({ created_at: created }, {
      cancellation: { paymentAction: 'NOTHING_TO_REFUND', cancelledAt: new Date(Date.parse(created) + PAYABLE_MS + MIN).toISOString() },
    })], { now, site: 'site' })).toEqual([]);
  });

  it('remembers what it asked, apart from the pending checkouts', async () => {
    const { selectCancelledCheckouts, RECHECK_MS } = await import('../../backend/jobs/abandonedCheckout.job.js');
    const now = Date.now();
    const checked = new Map([[REF, { at: now, final: true }]]);

    // A pending checkout's answer is not this one's.
    expect(selectCancelledCheckouts([cancelledRow()], { now, site: 'site', checked })).toHaveLength(1);

    checked.set(`cancelled:${REF}`, { at: now, final: false });
    expect(selectCancelledCheckouts([cancelledRow()], { now, site: 'site', checked })).toEqual([]);
    expect(selectCancelledCheckouts([cancelledRow()], { now: now + RECHECK_MS, site: 'site', checked })).toHaveLength(1);

    checked.set(`cancelled:${REF}`, { at: now, final: true });
    expect(selectCancelledCheckouts([cancelledRow()], { now: now + RECHECK_MS, site: 'site', checked })).toEqual([]);
  });
});
