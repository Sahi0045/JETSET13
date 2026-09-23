import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';

/**
 * "We will email you when the refund is made", kept by whichever desk action
 * returns the money.
 *
 * The desk's "not held" answer on a paid commit that never answered emails the
 * customer (flight.routes.js NOT_HELD_EMAIL): "Our team is refunding your
 * payment, and we will email you when the refund is made". Cancel & refund
 * keeps that promise with its cancellation email. The same desk card offers
 * Void payment beside it - a natural choice for a booking that was never made
 * - and that wrote the booking cancelled and refunded and emailed no one. So
 * did the Payments tab's refund, and Finish refund after a Cancel & refund
 * whose own refund ARC Pay refused. The customer never heard the refund was
 * made.
 *
 * Now the first of them to record the money returned sends the cancellation
 * email (the one Cancel & refund sends), once: after it the booking no longer
 * reads paid, and nothing sends it again.
 *
 * The desk's answer, Cancel & refund and Finish refund are the real routes;
 * Void payment and the Payments-tab refund are the real handlers.
 */

const REF = 'FLTUNK1';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

let table = fakeBookingsTable([]);
let ledger = [];
let arcRefuses = false;

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? vi.fn() : target[key]),
    }),
  };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

vi.mock('../../backend/routes/payment/agents.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAdmin: async () => true,
  getCaller: async () => ({ id: 'admin-1', role: 'admin' }),
}));

/** The row the order route leaves when the commit never answered, the chain's claim long lapsed, announced by the alarm. */
const commitUnknown = () => {
  const at = tenMinutesAgo();
  return {
    id: 'bk-unk1',
    booking_reference: REF,
    travel_type: 'flight',
    status: 'pending',
    payment_status: 'paid',
    total_amount: 291,
    created_at: at,
    passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
    booking_details: {
      order_id: REF,
      customer_email: 'jane@example.com',
      arc_captured_amount: 291,
      arc_captured_currency: 'USD',
      gds_chain: { state: 'in_progress', startedAt: at, claimedAt: at, attempt: 1 },
      needs_review: { reason: COMMIT_UNKNOWN, ticketed: false, at, alerted_at: at },
    },
  };
};

/** The legacy payments row the Payments tab refunds. */
const paymentsRow = () => ({ id: 'pay-1', arc_order_id: REF, amount: 291, currency: 'USD', payment_status: 'completed', metadata: {} });

const captured = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };

let mailer;

beforeEach(() => {
  vi.resetModules();
  ledger = [];
  arcRefuses = false;
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockImplementation(async () => ({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [captured, ...ledger] },
  }));
  // ARC Pay's ledger: a VOID or REFUND it takes is listed on the next read.
  axios.put.mockImplementation(async (_url, body) => {
    if (arcRefuses) return { status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } };
    const id = `t-${ledger.length + 2}`;
    if (body?.apiOperation === 'REFUND') {
      ledger.push({ result: 'SUCCESS', transaction: { id, type: 'REFUND', amount: Number(body.transaction.amount), currency: 'USD' } });
    }
    if (body?.apiOperation === 'VOID') {
      ledger.push({ result: 'SUCCESS', transaction: { id, type: 'VOID_PAYMENT', amount: 291, currency: 'USD', targetTransactionId: body.transaction.targetTransactionId } });
    }
    return { status: 200, data: { result: 'SUCCESS' } };
  });
  mailer = {
    sendEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
    sendBookingNotificationEmails: vi.fn().mockResolvedValue({ success: true }),
    sendCancellationNotificationEmails: vi.fn().mockResolvedValue({ success: true }),
  };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
});

const desk = async (rows, { payments = [] } = {}) => {
  table = fakeBookingsTable(rows, { tables: { price_settings: [], payments } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const handlers = await import('../../backend/routes/payment/operations.handlers.js');
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  const call = async (handler, body) => {
    const res = createResponse();
    await handler(createRequest({ method: 'POST', body }), res);
    return res;
  };
  return {
    notHeld: async () => request(app).post(`/api/flights/admin-bookings/bk-unk1/resolve-review${await shownQueryFor('bk-unk1')}`)
      .send({ note: 'Rang the airline: it has no record of it.', outcome: 'not_held' }),
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-unk1/cancel').send({ reason: 'The airline does not hold it' }),
    finishRefund: (body = { mode: 'refund', amount: 291 }) => request(app).post('/api/flights/admin-bookings/bk-unk1/refund')
      .send({ reason: 'Refund finished by the support desk', ...body }),
    voidPayment: () => call(handlers.handlePaymentVoid, { bookingReference: REF, reason: 'Not held at the airline' }),
    refundPayment: (amount) => call(handlers.handlePaymentRefund, { paymentId: 'pay-1', amount, reason: 'Not held at the airline' }),
  };
};

/** The cancellation emails sent, as the customer's address and what they say about the money. */
const refundEmails = () => mailer.sendCancellationNotificationEmails.mock.calls.map(([mail]) => ({
  to: mail.customerEmail, reference: mail.bookingReference, paymentAction: mail.paymentAction, refundAmount: mail.refundAmount,
}));
const notHeldEmails = () => mailer.sendEmail.mock.calls.filter(([mail]) => mail.subject === 'Your flight booking did not go through');

describe('the not-held promise, kept by the desk action that returns the money', () => {
  it('Void payment on the not-held entry emails the customer that the payment went back, once', async () => {
    const d = await desk([commitUnknown()]);
    expect((await d.notHeld()).status).toBe(200);
    expect(notHeldEmails()).toHaveLength(1);

    const voided = await d.voidPayment();

    expect(voided.statusCode).toBe(200);
    expect(table.row(REF)).toMatchObject({ status: 'cancelled', payment_status: 'refunded' });
    expect(refundEmails()).toEqual([{ to: 'jane@example.com', reference: REF, paymentAction: 'VOID', refundAmount: 291 }]);

    // Pressed again: refused, and nothing is sent a second time.
    const again = await d.voidPayment();
    expect(again.statusCode).toBe(400);
    expect(refundEmails()).toHaveLength(1);
  });

  it('Finish refund after a Cancel & refund whose refund ARC Pay refused emails the refund made, once', async () => {
    const d = await desk([commitUnknown()]);
    await d.notHeld();
    arcRefuses = true;
    expect((await d.cancel()).status).toBe(200);
    expect(table.row(REF).booking_details.cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED' });
    // The cancel's own email: nothing has gone back yet.
    expect(refundEmails().map((mail) => mail.paymentAction)).toEqual(['REFUND_FAILED']);

    arcRefuses = false;
    const finished = await d.finishRefund();

    expect(finished.status).toBe(200);
    expect(refundEmails()).toHaveLength(2);
    expect(refundEmails()[1]).toEqual({ to: 'jane@example.com', reference: REF, paymentAction: 'FULL_REFUND', refundAmount: 291 });

    // Check ARC Pay afterwards records what ARC shows, and sends nothing more.
    expect((await d.finishRefund({ mode: 'sync' })).status).toBe(200);
    expect(refundEmails()).toHaveLength(2);
  });

  it('the Payments-tab refund emails the refund made, once', async () => {
    const d = await desk([commitUnknown()], { payments: [paymentsRow()] });
    await d.notHeld();

    const refunded = await d.refundPayment(291);

    expect(refunded.statusCode).toBe(200);
    expect(table.row(REF).payment_status).toBe('refunded');
    expect(refundEmails()).toEqual([{ to: 'jane@example.com', reference: REF, paymentAction: 'FULL_REFUND', refundAmount: 291 }]);
  });

  it('a Payments-tab refund in two parts emails once, at the first', async () => {
    const d = await desk([commitUnknown()], { payments: [paymentsRow()] });
    await d.notHeld();

    expect((await d.refundPayment(100)).statusCode).toBe(200);
    expect((await d.refundPayment(191)).statusCode).toBe(200);

    expect(refundEmails()).toEqual([{ to: 'jane@example.com', reference: REF, paymentAction: 'PARTIAL_REFUND', refundAmount: 100 }]);
  });

  it('a Finish refund press that read the booking before another one recorded sends nothing more', async () => {
    const d = await desk([commitUnknown()]);
    await d.notHeld();
    arcRefuses = true;
    await d.cancel();
    arcRefuses = false;
    // The second desk member's page read the booking while it was still paid.
    const readEarlier = JSON.parse(JSON.stringify(table.row(REF)));

    expect((await d.finishRefund()).status).toBe(200);
    expect(refundEmails()).toHaveLength(2);

    const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
    const late = await settleManualFlightRefund(readEarlier, { mode: 'sync' });
    expect(late.status).toBe(200);
    expect(refundEmails()).toHaveLength(2);
  });

  it('a Payments-tab refund that read the booking before another one recorded sends nothing more', async () => {
    const d = await desk([commitUnknown()], { payments: [paymentsRow()] });
    await d.notHeld();
    const readEarlier = JSON.parse(JSON.stringify(table.row(REF)));

    expect((await d.refundPayment(100)).statusCode).toBe(200);
    expect(refundEmails()).toHaveLength(1);

    // The second refund's read of the booking lands before the first one's
    // write: it still reads paid.
    const real = table;
    table = {
      ...real,
      from: (name) => {
        const query = real.from(name);
        if (name !== 'bookings') return query;
        query.maybeSingle = async () => ({ data: readEarlier, error: null });
        return query;
      },
    };
    expect((await d.refundPayment(191)).statusCode).toBe(200);
    expect(real.row(REF).payment_status).toBe('refunded');
    expect(refundEmails()).toHaveLength(1);
  });
});

// Fences: the paths around it, unchanged.
describe('around it', () => {
  it('Cancel & refund still sends its one cancellation email, and nothing after it sends another', async () => {
    const d = await desk([commitUnknown()]);
    await d.notHeld();

    expect((await d.cancel()).status).toBe(200);
    expect(refundEmails()).toEqual([{ to: 'jane@example.com', reference: REF, paymentAction: 'VOID', refundAmount: 291 }]);

    // Check ARC Pay on the cancelled booking records what ARC shows, and sends nothing.
    expect((await d.finishRefund({ mode: 'sync' })).status).toBe(200);
    expect(refundEmails()).toHaveLength(1);
  });

  it('Void payment on a checkout that never reached the airline, with no "not held" answer, emails no one', async () => {
    const row = commitUnknown();
    delete row.booking_details.needs_review;
    delete row.booking_details.gds_chain;
    const d = await desk([row]);

    expect((await d.voidPayment()).statusCode).toBe(200);
    expect(mailer.sendCancellationNotificationEmails).not.toHaveBeenCalled();
  });

  it('a void ARC Pay refuses moves nothing and emails no one', async () => {
    const d = await desk([commitUnknown()]);
    await d.notHeld();
    arcRefuses = true;

    const voided = await d.voidPayment();

    expect(voided.statusCode).toBe(400);
    expect(table.row(REF).payment_status).toBe('paid');
    expect(mailer.sendCancellationNotificationEmails).not.toHaveBeenCalled();
  });

  it('a void that went through and could not be recorded emails no one: nothing on the row says so yet', async () => {
    const d = await desk([commitUnknown()]);
    await d.notHeld();
    const fail = ({ patch }) => patch?.payment_status === 'refunded';
    table = fakeBookingsTable([table.row(REF)], { tables: { price_settings: [], payments: [] }, fail });

    const voided = await d.voidPayment();

    expect(voided.statusCode).toBe(500);
    expect(voided.body.code).toBe('RECORD_FAILED');
    expect(mailer.sendCancellationNotificationEmails).not.toHaveBeenCalled();
  });

  it('"held" at the airline is not the not-held promise: a Payments-tab refund of it emails no one from here', async () => {
    const row = commitUnknown();
    row.booking_details.needs_review = {
      reason: 'PNR committed, never ticketed', ticketed: false, at: tenMinutesAgo(),
      previous: { ...row.booking_details.needs_review, resolved_at: tenMinutesAgo(), outcome: 'held', pnr: 'HELD42' },
    };
    row.booking_details.pnr = 'HELD42';
    const d = await desk([row], { payments: [paymentsRow()] });

    expect((await d.refundPayment(291)).statusCode).toBe(200);
    expect(mailer.sendCancellationNotificationEmails).not.toHaveBeenCalled();
  });
});
