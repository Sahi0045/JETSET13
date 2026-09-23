import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf, refundOwedOf, refundPrefillOf } from '../../shared/reviewQueue.js';

/**
 * A cancel's refund answered by something that is not ARC Pay's verdict is not
 * a refusal.
 *
 * A 90 USD fare, the default 50 fee, tickets voided the day they were issued:
 * the cancel decides 40 goes back. Its REFUND reaches ARC and lands, and what
 * comes back is a proxy's 504 page, a 502, or a 200 whose result is PENDING,
 * UNKNOWN or missing. returnFlightPayment read anything short of SUCCESS that
 * did not throw as REFUND_FAILED - "ARC Pay refused" - where the desk's own
 * refund (arcRefused) counts only ARC's own FAILURE or ERROR under HTTP 500
 * as a no. The desk was then told "nothing has gone back to the customer; 40
 * owed", filled in 40, ARC still held 50, and one press of Refund now sent a
 * second 40: the customer got 80 of 90 and the 50 fee became 10.
 *
 * The whole reversal (reverseArcPaymentForOrder) read its replies the same
 * way, and sent a REFUND after a VOID that was never answered: a VOID that
 * had gone through made ARC refuse that REFUND, and the desk was told
 * "nothing has gone back; 90 owed" for money already returned.
 *
 * Both now read ARC's answer as the desk does: refused only when ARC said no,
 * otherwise unanswered - REFUND_UNDER_REVIEW with reversalOutcomeUnknown and
 * the unanswered refund written down for Finish refund's guard.
 *
 * The cancels are the real customer and admin cancels; the list and Finish
 * refund are the real routes over the row they wrote. ARC Pay is a ledger:
 * what a PUT does there is decided apart from what the reply says.
 */

const REF = 'FLTNOVERD';
let table = fakeBookingsTable([]);
let ledger = [];

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

const ticketed = () => ({
  id: 'bk-noverd',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 90,
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
  booking_details: {
    order_id: REF,
    pnr: 'NVD123',
    customer_email: 'jane@example.com',
    arc_captured_amount: 90,
    arc_captured_currency: 'USD',
    refundable: true,
    gds: { ticketed: true },
    tickets: [{ number: '125-1111111111' }],
  },
});

/** Released before any ticket was issued: refund_all, through reverseArcPaymentForOrder. */
const neverTicketed = () => {
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] });
  const row = ticketed();
  row.booking_details = { ...row.booking_details, gds: { ticketed: false }, tickets: [] };
  return row;
};

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 90, currency: 'USD' } };
const voided = () => ledger.some((t) => t.transaction.type === 'VOID_PAYMENT');
const refundedAtArc = () => ledger.filter((t) => t.transaction.type === 'REFUND').reduce((sum, t) => sum + t.transaction.amount, 0);
const puts = (operation) => axios.put.mock.calls.filter(([, body]) => body?.apiOperation === operation).length;

/**
 * What ARC Pay does with a PUT: a VOID voids the payment; a REFUND returns
 * its amount, unless the payment was voided, which ARC refuses outright.
 */
const arcDoes = (body) => {
  if (body?.apiOperation === 'VOID') {
    ledger.push({ result: 'SUCCESS', transaction: { id: `v-${ledger.length + 1}`, type: 'VOID_PAYMENT', amount: 90, currency: 'USD' } });
    return null;
  }
  if (voided()) return { status: 400, data: { result: 'ERROR', error: { cause: 'INVALID_REQUEST', explanation: 'Transaction already voided' } } };
  ledger.push({ result: 'SUCCESS', transaction: { id: `r-${ledger.length + 1}`, type: 'REFUND', amount: Number(body.transaction.amount), currency: 'USD' } });
  return null;
};

const answered = { status: 200, data: { result: 'SUCCESS' } };
const refusedOutright = { status: 400, data: { result: 'ERROR', error: { cause: 'INVALID_REQUEST', explanation: 'Transaction already settled' } } };

/**
 * Each PUT in turn: `lands` whether ARC acts on it, `reply` what comes back.
 * Any PUT past the script lands and is answered, as a desk press would be.
 */
const script = (steps) => {
  let n = 0;
  axios.put.mockImplementation(async (_url, body) => {
    const step = steps[n++] || { lands: true, reply: answered };
    const refusal = step.lands ? arcDoes(body) : null;
    return refusal || step.reply;
  });
};

beforeEach(() => {
  vi.resetModules();
  ledger = [];
  cancelFlightOrder.mockReset();
  // Voided the day they were issued: refund_less_fee, 40 back, 50 kept.
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockImplementation(async () => ({
    status: 200,
    data: { status: voided() ? 'CANCELLED' : 'CAPTURED', amount: 90, currency: 'USD', transaction: [payment, ...ledger] },
  }));
});

const desk = async (row = ticketed()) => {
  table = fakeBookingsTable([row], { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return {
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-noverd/cancel').send({ reason: 'Customer called' }),
    all: async () => (await request(app).get(`/api/flights/admin-bookings-all?search=${REF}`)).body.data,
    refund: (body) => request(app).post('/api/flights/admin-bookings/bk-noverd/refund').send(body),
    cancellation: () => table.row(REF).booking_details.cancellation,
    /** What the cancel answered about the money: it carries ARC's reason, the row does not. */
    answered: (response) => response.body.data.cancellation,
  };
};

const NOT_VERDICTS = [
  ['HTTP 504 with no body', { status: 504, data: '' }],
  ['a proxy 504 page', { status: 504, data: '<html><body>504 Gateway Time-out</body></html>' }],
  ['HTTP 502 with a JSON body and no result', { status: 502, data: { error: { cause: 'SERVER_BUSY' } } }],
  ['HTTP 500 whose body says FAILURE', { status: 500, data: { result: 'FAILURE' } }],
  ['HTTP 200 result UNKNOWN', { status: 200, data: { result: 'UNKNOWN' } }],
  ['HTTP 200 result PENDING', { status: 200, data: { result: 'PENDING' } }],
  ['HTTP 200 with no result', { status: 200, data: {} }],
];

describe('the cancel\'s refund, answered by something that is not ARC Pay\'s verdict', () => {
  for (const [label, reply] of NOT_VERDICTS) {
    it(`${label}: recorded unanswered, never refused, and the decided 40 goes back once`, async () => {
      script([{ lands: true, reply }]);
      const d = await desk();
      const cancelled = await d.cancel();
      expect(cancelled.status).toBe(200);
      expect(refundedAtArc()).toBe(40);

      const cancellation = d.cancellation();
      expect(cancellation, 'recorded as a refund ARC Pay refused').toMatchObject({
        paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true, refundAmount: 0, cancellationFee: 50,
      });
      expect(cancellation.unansweredRefund).toEqual({ amount: 40, currency: 'USD', at: cancellation.cancelledAt, refundedBefore: 0 });
      expect(d.answered(cancelled).errorDetails).toBeUndefined();
      expect(table.row(REF).payment_status).toBe('paid');

      const [listed] = await d.all();
      expect(listed.attention.reason, 'the desk is told nothing went back').not.toMatch(/nothing has gone back/);
      expect(refundPrefillOf(listed), 'the decided 40 is filled in before anyone looked at ARC').toBe('');

      // Someone types the decided amount anyway.
      const press = await d.refund({ mode: 'refund', amount: 40, reason: 'Refund finished by the support desk' });
      expect(press.status).toBe(200);
      expect(refundedAtArc(), 'the decided 40 went back twice; the 50 fee became 10').toBe(40);
      expect(puts('REFUND')).toBe(1);
    });
  }

  it('the customer\'s own cancel, answered by a proxy 504 page: the admin panel\'s amount goes back once', async () => {
    script([{ lands: true, reply: { status: 504, data: '<html><body>504 Gateway Time-out</body></html>' } }]);
    const d = await desk();
    const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
    const res = createResponse();
    await handleCancelBookingAction(createRequest({
      method: 'POST', body: { bookingReference: REF, reason: 'test', email: 'jane@example.com' },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true });
    expect(attentionOf(table.row(REF))?.reason).not.toMatch(/nothing has gone back/);

    const [listed] = await d.all();
    const press = await d.refund({ mode: 'refund', amount: refundOwedOf(listed).owed, reason: 'Refund finished by the support desk' });
    expect(press.status).toBe(200);
    expect(refundedAtArc()).toBe(40);
  });
});

describe('the whole reversal, answered by something that is not ARC Pay\'s verdict', () => {
  it('a VOID answered 504 that went through: no REFUND follows it, and nothing says the money is still held', async () => {
    script([{ lands: true, reply: { status: 504, data: '' } }]);
    const d = await desk(neverTicketed());
    expect((await d.cancel()).status).toBe(200);

    expect(voided()).toBe(true);
    expect(puts('REFUND'), 'a REFUND was sent after a VOID nobody answered').toBe(0);
    const cancellation = d.cancellation();
    expect(cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true });
    expect(cancellation.unansweredRefund).toEqual({ amount: 90, currency: 'USD', at: cancellation.cancelledAt, refundedBefore: 0 });
    const [listed] = await d.all();
    expect(listed.attention.reason).not.toMatch(/nothing has gone back/);
    expect(listed.attention.reason).toMatch(/VOID/);
  });

  for (const [label, reply] of [
    ['HTTP 502 with a JSON body and no result', { status: 502, data: { error: { cause: 'SERVER_BUSY' } } }],
    ['HTTP 200 result PENDING', { status: 200, data: { result: 'PENDING' } }],
  ]) {
    it(`a REFUND answered ${label} after ARC refused the VOID: unanswered, not refused`, async () => {
      script([{ lands: false, reply: refusedOutright }, { lands: true, reply }]);
      const d = await desk(neverTicketed());
      const cancelled = await d.cancel();
      expect(cancelled.status).toBe(200);

      expect(refundedAtArc()).toBe(90);
      const cancellation = d.cancellation();
      expect(cancellation, 'recorded as a refund ARC Pay refused').toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true });
      expect(cancellation.unansweredRefund).toMatchObject({ amount: 90 });
      expect(d.answered(cancelled).errorDetails).toBeUndefined();
      const [listed] = await d.all();
      expect(listed.attention.reason).not.toMatch(/nothing has gone back/);
    });
  }

  it('reverseArcPaymentForOrder says which: a VOID with no verdict is unknown, and nothing more is sent', async () => {
    script([{ lands: true, reply: { status: 503, data: '' } }]);
    await desk();
    const { reverseArcPaymentForOrder } = await import('../../backend/routes/payment/operations.handlers.js');
    const reversal = await reverseArcPaymentForOrder(REF, {});
    expect(reversal).toMatchObject({ reversed: false, action: 'FAILED', outcomeUnknown: true });
    expect(reversal.refused).toBeUndefined();
    expect(axios.put).toHaveBeenCalledTimes(1);
  });
});

describe('beside it: ARC Pay\'s own no is still a refusal', () => {
  it('HTTP 400 result ERROR on the cancel\'s refund: REFUND_FAILED, nothing unanswered, and the desk may send the decided 40', async () => {
    script([{ lands: false, reply: refusedOutright }]);
    const d = await desk();
    const cancelled = await d.cancel();
    const cancellation = d.cancellation();
    expect(cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED', cancellationFee: 50 });
    expect(cancellation.reversalOutcomeUnknown).toBeUndefined();
    expect(cancellation.unansweredRefund).toBeUndefined();
    expect(d.answered(cancelled).errorDetails).toMatchObject({ result: 'ERROR' });

    const [listed] = await d.all();
    expect(listed.attention.reason).toMatch(/nothing has gone back/);
    expect(refundPrefillOf(listed)).toBe('40');
    const press = await d.refund({ mode: 'refund', amount: 40, reason: 'Refund finished by the support desk' });
    expect(press.status).toBe(200);
    expect(refundedAtArc()).toBe(40);
  });

  it('a VOID ARC refused is followed by the REFUND, and one that lands is a full refund', async () => {
    script([{ lands: false, reply: refusedOutright }, { lands: true, reply: answered }]);
    const d = await desk(neverTicketed());
    await d.cancel();
    expect(puts('VOID')).toBe(1);
    expect(puts('REFUND')).toBe(1);
    expect(d.cancellation()).toMatchObject({ paymentAction: 'FULL_REFUND', refundAmount: 90 });
    expect(table.row(REF).payment_status).toBe('refunded');
  });

  it('a VOID and a REFUND both refused: REFUND_FAILED, with ARC\'s reason', async () => {
    const declined = { status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } };
    script([{ lands: false, reply: declined }, { lands: false, reply: declined }]);
    const d = await desk(neverTicketed());
    const cancelled = await d.cancel();
    const cancellation = d.cancellation();
    expect(cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED' });
    expect(cancellation.reversalOutcomeUnknown).toBeUndefined();
    expect(cancellation.unansweredRefund).toBeUndefined();
    expect(d.answered(cancelled).errorDetails).toEqual({ result: 'FAILURE', response: { gatewayCode: 'DECLINED' } });
  });

  it('a VOID ARC answered SUCCESS is the reversal, and nothing more is sent', async () => {
    script([{ lands: true, reply: answered }]);
    const d = await desk(neverTicketed());
    await d.cancel();
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(d.cancellation()).toMatchObject({ paymentAction: 'VOID' });
  });
});
