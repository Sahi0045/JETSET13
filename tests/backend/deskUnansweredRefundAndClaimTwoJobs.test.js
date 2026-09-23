import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf, needsAirlineRefundClaim } from '../../shared/reviewQueue.js';

/**
 * One entry, two jobs, when the customer refund under an airline claim was
 * sent to ARC Pay and never answered.
 *
 * A refundable fare past its void window: the cancel decides 241 back and
 * writes a claim flag for the ticket. Its REFUND throws, or is answered by a
 * 504: REFUND_UNDER_REVIEW with reversalOutcomeUnknown, one flag carrying both
 * reasons. The desk showed a single "Refund to claim from the airline" with no
 * jobs; someone claimed the ticket and pressed "Mark as handled" with a claim
 * note, the flag was resolved, and the customer's 241 - which may never have
 * gone back - left Needs attention with nobody asked to check ARC Pay.
 *
 * The two-job entry that covered a refund ARC Pay refused now covers one it
 * never answered: each job is closed by its own press, and the refund stays
 * listed on its own once the claim is handled.
 *
 * The cancel is the real admin cancel; the list, Check ARC Pay and "Mark as
 * handled" are the real routes over the row it wrote.
 */

const REF = 'FLTUNK9';
let table = fakeBookingsTable([]);
let ledger = [];
// What the cancel's own REFUND gets back, after it lands (or not).
let cancelRefund = { lands: false, reply: null };

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
  id: 'bk-unk',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
  booking_details: {
    order_id: REF,
    pnr: 'UNK123',
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    refundable: true,
    gds: { ticketed: true },
    tickets: [{ number: '108-2412345671' }],
  },
});

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };

beforeEach(() => {
  vi.resetModules();
  ledger = [];
  cancelRefund = { lands: false, reply: null };
  // Past the void window, refundable: 241 back, 50 kept, the ticket to claim.
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['108-2412345671'] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockImplementation(async () => ({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, ...ledger] },
  }));
  // The cancel's REFUND: it lands or not, and its answer is lost (a throw) or
  // is not a verdict (`reply`).
  axios.put.mockImplementation(async (_url, body) => {
    if (cancelRefund.lands) {
      ledger.push({ result: 'SUCCESS', transaction: { id: `r-${ledger.length + 1}`, type: 'REFUND', amount: Number(body.transaction.amount), currency: 'USD' } });
    }
    if (cancelRefund.reply) return cancelRefund.reply;
    throw new Error('socket hang up');
  });
});

const shownOf = (attention) => `?${new URLSearchParams({ shownKind: attention.kind, shownSince: attention.since ?? '' })}`;

const desk = async (row = ticketed()) => {
  table = fakeBookingsTable([row], { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  const d = {
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-unk/cancel').send({ reason: 'Customer called' }),
    open: async () => (await request(app).get('/api/flights/admin-bookings-all?attention=open')).body.data,
    refund: (body) => request(app).post('/api/flights/admin-bookings/bk-unk/refund').send(body),
    handle: (shown, body) => request(app).post(`/api/flights/admin-bookings/bk-unk/resolve-review${shownOf(shown)}`).send(body),
    row: () => table.row(REF),
    flag: () => table.row(REF).booking_details.needs_review,
  };
  await d.cancel();
  return d;
};

describe('an unanswered customer refund under an airline claim', () => {
  for (const [label, answer] of [
    ['a REFUND that threw', null],
    ['a REFUND answered 504', { status: 504, data: '' }],
  ]) {
    it(`${label}: listed as one entry that names its two jobs`, async () => {
      cancelRefund = { lands: false, reply: answer };
      const d = await desk();
      expect(d.row().booking_details.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true, cancellationFee: 50 });
      const [listed] = await d.open();
      expect(listed.attention).toMatchObject({ kind: 'airline_refund', jobs: ['refund', 'claim'] });
      expect(listed.attention.reason).toMatch(/refund request did not complete/);
      expect(listed.attention.reason).toMatch(/airline refund must be claimed/);
    });
  }

  it('the reviewer\'s case: a claim note that names no job is refused, and nothing is written', async () => {
    const d = await desk();
    const [listed] = await d.open();
    const before = JSON.parse(JSON.stringify(d.flag()));
    const response = await d.handle(listed.attention, { note: 'Claimed 108-2412345671 from the airline.' });
    expect(response.status, 'the unanswered 241 left the desk with a claim note').toBe(409);
    expect(response.body.code).toBe('JOB_REQUIRED');
    expect(response.body.error).toMatch(/refused or never answered/);
    expect(d.flag()).toEqual(before);
    expect(await d.open()).toHaveLength(1);
  });

  it('"Airline claim handled" resolves the claim, and the unanswered refund stays on its own entry until it is handled', async () => {
    const d = await desk();
    const [listed] = await d.open();
    expect((await d.handle(listed.attention, { note: 'Claimed 108-2412345671 from the airline.', job: 'claim' })).status).toBe(200);
    expect(d.flag()).toMatchObject({ resolution: 'Claimed 108-2412345671 from the airline.' });

    const [left] = await d.open();
    expect(left?.attention, 'a claim note took the unanswered refund off Needs attention').toMatchObject({ kind: 'refund_not_made' });
    expect(left.attention.reason).toMatch(/never answered: check ARC Pay before refunding anything; if none of it went back, 241\.00 USD owed/);

    // Handled on its own entry, it goes.
    expect((await d.handle(left.attention, { note: 'ARC portal shows no refund; refunded 241 there.' })).status).toBe(200);
    expect(await d.open()).toHaveLength(0);
  });

  it('"Customer refund handled" leaves the airline claim open, on its own', async () => {
    const d = await desk();
    const [listed] = await d.open();
    const response = await d.handle(listed.attention, { note: 'ARC portal shows the 241 went back.', job: 'refund' });
    expect(response.status).toBe(200);

    const flag = d.flag();
    expect(flag.resolved_at, 'the claim was closed by a refund note').toBeUndefined();
    expect(needsAirlineRefundClaim(d.row())).toBe(true);
    expect(flag.refundHandled).toMatchObject({ note: 'ARC portal shows the 241 went back.' });

    const [still] = await d.open();
    expect(still.attention).toMatchObject({ kind: 'airline_refund', tickets: ['108-2412345671'] });
    expect(still.attention.jobs).toBeUndefined();

    expect((await d.handle(still.attention, { note: 'Claimed 108-2412345671 from the airline.' })).status).toBe(200);
    expect(await d.open()).toHaveLength(0);
    expect(attentionOf(d.row())).toBeNull();
  });

  it('Check ARC Pay that finds the refund landed records it: the refund job goes, the claim stays', async () => {
    cancelRefund = { lands: true, reply: { status: 504, data: '' } };
    const d = await desk();
    const synced = await d.refund({ mode: 'sync', reason: 'Checked ARC Pay' });
    expect(synced.status).toBe(200);
    expect(d.row().booking_details.cancellation).toMatchObject({ refundAmount: 241 });

    const [still] = await d.open();
    expect(still.attention).toMatchObject({ kind: 'airline_refund' });
    expect(still.attention.jobs).toBeUndefined();
    expect(axios.put.mock.calls.filter(([, body]) => body?.apiOperation === 'REFUND')).toHaveLength(1);
  });
});

describe('beside it', () => {
  it('a refund held for a person under a claim (non-refundable fare) stays one job: resolving the claim settles it', async () => {
    const row = ticketed();
    row.booking_details.refundable = false;
    const d = await desk(row);
    expect(d.row().booking_details.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(d.row().booking_details.cancellation.reversalOutcomeUnknown).toBeUndefined();
    expect(axios.put).not.toHaveBeenCalled();
    const [listed] = await d.open();
    expect(listed.attention).toMatchObject({ kind: 'airline_refund' });
    expect(listed.attention.jobs).toBeUndefined();
    expect((await d.handle(listed.attention, { note: 'Claimed it; refunded what the airline returned.' })).status).toBe(200);
    expect(await d.open()).toHaveLength(0);
  });

  it('an unanswered refund with no claim (tickets voided) is one job on the cancel\'s own flag, as before', async () => {
    cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });
    const d = await desk();
    const [listed] = await d.open();
    expect(listed.attention).toMatchObject({ kind: 'review' });
    expect(listed.attention.jobs).toBeUndefined();
    expect((await d.handle(listed.attention, { note: 'ARC portal shows the 241 went back.' })).status).toBe(200);
    expect(await d.open()).toHaveLength(0);
  });
});
