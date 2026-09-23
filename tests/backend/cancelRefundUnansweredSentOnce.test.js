import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { refundOwedOf } from '../../shared/reviewQueue.js';

/**
 * The cancel's own refund, sent to ARC Pay and never answered, is never sent
 * a second time by Finish refund.
 *
 * A 90 USD fare, the default 50 fee, tickets voided the day they were issued:
 * the cancel decides 40 goes back. Its REFUND reaches ARC and lands, and the
 * socket drops: REFUND_UNDER_REVIEW with reversalOutcomeUnknown. That was
 * written to the cancellation record and not as `unansweredRefund`, the one
 * thing settleManualFlightRefund's ledger and recency guard reads. The desk
 * and the admin panel filled in the decided 40, ARC still held 50, and one
 * press of Refund now sent a second 40: the customer got 80 of 90 and the 50
 * fee became 10.
 *
 * The cancel is the real admin cancel route; the list and Finish refund are
 * the real routes over the row it wrote.
 */

const REF = 'FLTSMALL';
let table = fakeBookingsTable([]);
let ledger = [];
// Whether the REFUND the cancel sends reaches ARC before its answer is lost.
let cancelRefundLands = true;

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

const cancelFlightOrder = vi.fn();
vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? cancelFlightOrder : target[key]),
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

const ticketed = (total = 90) => ({
  id: 'bk-small',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: total,
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
  booking_details: {
    order_id: REF,
    pnr: 'SML123',
    customer_email: 'jane@example.com',
    arc_captured_amount: total,
    arc_captured_currency: 'USD',
    refundable: true,
    gds: { ticketed: true },
    tickets: [{ number: '125-1111111111' }],
  },
});

let captured = 90;
const payment = () => ({ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: captured, currency: 'USD' } });
const refundOf = (amount, id) => ({ result: 'SUCCESS', transaction: { id, type: 'REFUND', amount, currency: 'USD' } });

beforeEach(() => {
  vi.resetModules();
  ledger = [];
  captured = 90;
  cancelRefundLands = true;
  cancelFlightOrder.mockReset();
  // Voided the day they were issued: refund_less_fee, 40 back, 50 kept.
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockImplementation(async () => ({
    status: 200,
    data: { status: 'CAPTURED', amount: captured, currency: 'USD', transaction: [payment(), ...ledger] },
  }));
  // The first PUT is the cancel's own REFUND: it lands (or not), and its
  // answer is lost. Every later one lands and is answered.
  let first = true;
  axios.put.mockImplementation(async (_url, body) => {
    const isFirst = first;
    first = false;
    if (body?.apiOperation === 'REFUND' && (!isFirst || cancelRefundLands)) {
      ledger.push(refundOf(Number(body.transaction.amount), `r-${ledger.length + 1}`));
    }
    if (isFirst) throw new Error('socket hang up');
    return { status: 200, data: { result: 'SUCCESS' } };
  });
});

afterEach(() => { vi.useRealTimers(); });

const desk = async (row = ticketed()) => {
  table = fakeBookingsTable([row], { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return {
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-small/cancel').send({ reason: 'Customer called' }),
    all: async () => (await request(app).get(`/api/flights/admin-bookings-all?search=${REF}`)).body.data,
    refund: (body) => request(app).post('/api/flights/admin-bookings/bk-small/refund').send(body),
  };
};

const refundedAtArc = () => ledger.reduce((sum, t) => sum + t.transaction.amount, 0);
const refundPuts = () => axios.put.mock.calls.filter(([, body]) => body?.apiOperation === 'REFUND').length;

describe('a cancel refund sent and never answered', () => {
  it('is recorded as unanswered on the cancellation: how much, when, and what ARC showed refunded before it', async () => {
    const d = await desk();
    await d.cancel();
    const { cancellation } = table.row(REF).booking_details;
    expect(cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true, cancellationFee: 50 });
    expect(cancellation.unansweredRefund, 'the one thing Finish refund\'s guard reads was never written').toEqual({
      amount: 40, currency: 'USD', at: cancellation.cancelledAt, refundedBefore: 0,
    });
  });

  it('landed at ARC: one press of Refund now with the decided amount records it and sends nothing', async () => {
    const d = await desk();
    await d.cancel();
    expect(refundedAtArc()).toBe(40);

    const [listed] = await d.all();
    const decided = refundOwedOf(listed)?.owed;
    expect(decided).toBe(40);
    const press = await d.refund({ mode: 'refund', amount: decided, reason: 'Refund finished by the support desk' });

    expect(refundedAtArc(), 'the decided 40 went back twice: the customer got 80 of 90, the 50 fee is 10').toBe(40);
    expect(refundPuts(), 'a second REFUND was sent').toBe(1);
    expect(press.status).toBe(200);
    expect(press.body.message).toMatch(/went through, so nothing more was sent/);
    const { cancellation } = table.row(REF).booking_details;
    expect(cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 40, cancellationFee: 50, decidedFee: 50 });
    expect(cancellation.unansweredRefund).toBeUndefined();
    expect(cancellation.manualRefund).toMatchObject({ mode: 'sync', earlierUnanswered: { amount: 40 } });
  });

  it('did not land, pressed at once: nothing is sent, and the desk is told to check ARC Pay', async () => {
    cancelRefundLands = false;
    const d = await desk();
    await d.cancel();
    const press = await d.refund({ mode: 'refund', amount: 40, reason: 'Refund finished by the support desk' });
    expect(press.status).toBe(409);
    expect(press.body.code).toBe('REFUND_UNANSWERED');
    expect(refundPuts()).toBe(1);
    expect(refundedAtArc()).toBe(0);
  });

  it('did not land, pressed after ARC has had time to show it: the decided amount goes back, once', async () => {
    cancelRefundLands = false;
    const d = await desk();
    await d.cancel();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    const press = await d.refund({ mode: 'refund', amount: 40, reason: 'Refund finished by the support desk' });
    expect(press.status).toBe(200);
    expect(refundedAtArc()).toBe(40);
    expect(table.row(REF).booking_details.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 40, cancellationFee: 50 });
  });

  it('a whole reversal that was never answered is recorded for the whole amount', async () => {
    // Released before any ticket: refund_all, reversed through
    // reverseArcPaymentForOrder, whose VOID is the first PUT and loses its answer.
    cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] });
    const row = ticketed();
    row.booking_details = { ...row.booking_details, gds: { ticketed: false }, tickets: [] };
    const d = await desk(row);
    await d.cancel();
    const { cancellation } = table.row(REF).booking_details;
    expect(cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true });
    expect(cancellation.unansweredRefund).toEqual({ amount: 90, currency: 'USD', at: cancellation.cancelledAt, refundedBefore: 0 });
  });
});

describe('beside it', () => {
  it('a cancel refund ARC answered writes nothing unanswered', async () => {
    axios.put.mockImplementation(async (_url, body) => {
      if (body?.apiOperation === 'REFUND') ledger.push(refundOf(Number(body.transaction.amount), `r-${ledger.length + 1}`));
      return { status: 200, data: { result: 'SUCCESS' } };
    });
    const d = await desk();
    await d.cancel();
    const { cancellation } = table.row(REF).booking_details;
    expect(cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 40 });
    expect(cancellation.unansweredRefund).toBeUndefined();
  });

  it('a cancel refund ARC refused writes nothing unanswered, and the desk may send the decided amount', async () => {
    axios.put.mockImplementation(async () => ({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } }));
    const d = await desk();
    await d.cancel();
    const { cancellation } = table.row(REF).booking_details;
    expect(cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED' });
    expect(cancellation.unansweredRefund).toBeUndefined();

    axios.put.mockImplementation(async (_url, body) => {
      if (body?.apiOperation === 'REFUND') ledger.push(refundOf(Number(body.transaction.amount), `r-${ledger.length + 1}`));
      return { status: 200, data: { result: 'SUCCESS' } };
    });
    const press = await d.refund({ mode: 'refund', amount: 40, reason: 'Refund finished by the support desk' });
    expect(press.status).toBe(200);
    expect(refundedAtArc()).toBe(40);
  });
});
