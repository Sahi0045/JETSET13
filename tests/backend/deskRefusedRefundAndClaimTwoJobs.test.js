import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf, needsAirlineRefundClaim } from '../../shared/reviewQueue.js';

/**
 * One entry, two jobs: a customer refund ARC Pay refused, under a claim flag
 * for tickets past their void window ("the refund did not go through ...;
 * tickets could not be voided; airline refund must be claimed").
 *
 * "Mark as handled" resolved the claim flag whatever the note said. The
 * page's kind and time cannot tell the jobs apart: a Finish refund leaves the
 * claim flag open (settle does not close a claim), so the entry keeps its kind
 * and time. A member on the page loaded before that - or anyone who only dealt
 * with the refund - recorded a refund note, and the airline claim left Needs
 * attention without being made.
 *
 * The entry now names its two jobs, and a press says which one it handled:
 * "Customer refund handled" leaves the claim open; "Airline claim handled"
 * resolves it. A press on it that names neither is refused, and a job the
 * booking no longer has is answered BOOKING_CHANGED. Nothing is written
 * either way.
 *
 * The cancel is the real admin cancel; the list, Finish refund and "Mark as
 * handled" are the real routes over the row it wrote.
 */

const REF = 'FLTCLM9';
let table = fakeBookingsTable([]);
let ledger = [];
let arcRefuses = true;

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
  id: 'bk-claim',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
  booking_details: {
    order_id: REF,
    pnr: 'CLM123',
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
  arcRefuses = true;
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
  axios.put.mockImplementation(async (_url, body) => {
    if (arcRefuses) return { status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } };
    ledger.push({ result: 'SUCCESS', transaction: { id: `r-${ledger.length + 1}`, type: 'REFUND', amount: Number(body.transaction.amount), currency: 'USD' } });
    return { status: 200, data: { result: 'SUCCESS' } };
  });
});

const shownOf = (attention) => `?${new URLSearchParams({ shownKind: attention.kind, shownSince: attention.since ?? '' })}`;

const desk = async () => {
  table = fakeBookingsTable([ticketed()], { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  const d = {
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-claim/cancel').send({ reason: 'Customer called' }),
    open: async () => (await request(app).get('/api/flights/admin-bookings-all?attention=open')).body.data,
    refund: (body) => request(app).post('/api/flights/admin-bookings/bk-claim/refund').send(body),
    handle: (shown, body) => request(app).post(`/api/flights/admin-bookings/bk-claim/resolve-review${shownOf(shown)}`).send(body),
    row: () => table.row(REF),
    flag: () => table.row(REF).booking_details.needs_review,
  };
  await d.cancel();
  return d;
};

describe('a refused customer refund under an airline claim', () => {
  it('is listed as one entry that names its two jobs', async () => {
    const d = await desk();
    expect(d.row().booking_details.cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED', cancellationFee: 50 });
    const [listed] = await d.open();
    expect(listed.attention).toMatchObject({ kind: 'airline_refund', jobs: ['refund', 'claim'] });
    expect(listed.attention.reason).toMatch(/the refund did not go through \(REFUND_FAILED\)/);
    expect(listed.attention.reason).toMatch(/airline refund must be claimed/);
  });

  it('a press that does not say which job it handled is refused, and nothing is written', async () => {
    const d = await desk();
    const [listed] = await d.open();
    const before = JSON.parse(JSON.stringify(d.flag()));
    const response = await d.handle(listed.attention, { note: 'Refunded 241 in the ARC portal.' });
    expect(response.status, 'one press closed the claim whichever job the note described').toBe(409);
    expect(response.body.code).toBe('JOB_REQUIRED');
    expect(response.body.error).toMatch(/Nothing has been recorded/);
    expect(d.flag()).toEqual(before);
  });

  it('"Customer refund handled" leaves the airline claim open, on its own, with the refund\'s note kept', async () => {
    const d = await desk();
    const [listed] = await d.open();
    const response = await d.handle(listed.attention, { note: 'Refunded 241 in the ARC portal.', job: 'refund' });
    expect(response.status).toBe(200);

    const flag = d.flag();
    expect(flag.resolved_at, 'the claim was closed by a refund note').toBeUndefined();
    expect(needsAirlineRefundClaim(d.row())).toBe(true);
    expect(flag.refundHandled).toMatchObject({ by: 'desk@jetsetterss.com', note: 'Refunded 241 in the ARC portal.' });

    const [still] = await d.open();
    expect(still.attention).toEqual({
      kind: 'airline_refund', reason: 'tickets could not be voided; airline refund must be claimed', since: listed.attention.since, tickets: ['108-2412345671'],
    });

    // The claim, handled on its own, takes the booking off the list: the
    // refund is not listed again.
    expect((await d.handle(still.attention, { note: 'Claimed 108-2412345671 from the airline.' })).status).toBe(200);
    expect(await d.open()).toHaveLength(0);
    expect(attentionOf(d.row())).toBeNull();
    expect(d.flag()).toMatchObject({ resolution: 'Claimed 108-2412345671 from the airline.', refundHandled: { note: 'Refunded 241 in the ARC portal.' } });
  });

  it('"Airline claim handled" resolves the claim, and the refused refund stays on its own entry', async () => {
    const d = await desk();
    const [listed] = await d.open();
    expect((await d.handle(listed.attention, { note: 'Claimed 108-2412345671 from the airline.', job: 'claim' })).status).toBe(200);
    expect(d.flag()).toMatchObject({ resolution: 'Claimed 108-2412345671 from the airline.' });
    expect(d.flag().refundHandled).toBeUndefined();
    const [left] = await d.open();
    expect(left.attention).toMatchObject({ kind: 'refund_failed' });
  });

  it('the reviewer\'s case: X finishes the refund, Y on the page from before records a refund note - refused, the claim stays open', async () => {
    const d = await desk();
    const [shownToY] = await d.open();

    // X finishes the refund; settle leaves the claim flag open.
    arcRefuses = false;
    const finished = await d.refund({ mode: 'refund', amount: 241, reason: 'Refund finished by the support desk' });
    expect(finished.status).toBe(200);
    expect(needsAirlineRefundClaim(d.row())).toBe(true);
    const flagAfterX = JSON.parse(JSON.stringify(d.flag()));

    const response = await d.handle(shownToY.attention, { note: 'Refunded the customer.', job: 'refund' });
    expect(response.status, 'Y\'s refund note closed the airline claim').toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(response.body.error).toMatch(/Nothing has been recorded/);
    expect(d.flag()).toEqual(flagAfterX);
    const [left] = await d.open();
    expect(left.attention).toMatchObject({ kind: 'airline_refund' });
    expect(left.attention.jobs).toBeUndefined();

    // Y reloads: the claim alone, handled as before.
    expect((await d.handle(left.attention, { note: 'Claimed 108-2412345671 from the airline.' })).status).toBe(200);
    expect(await d.open()).toHaveLength(0);
  });

  it('a second "Customer refund handled" from a page loaded before the first is refused, and the first note is kept', async () => {
    const d = await desk();
    const [listed] = await d.open();
    expect((await d.handle(listed.attention, { note: 'Refunded 241 in the ARC portal.', job: 'refund' })).status).toBe(200);
    const second = await d.handle(listed.attention, { note: 'Rang the customer.', job: 'refund' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('BOOKING_CHANGED');
    expect(d.flag().refundHandled).toMatchObject({ note: 'Refunded 241 in the ARC portal.' });
  });

  it('a job that is neither is refused', async () => {
    const d = await desk();
    const [listed] = await d.open();
    const response = await d.handle(listed.attention, { note: 'x', job: 'both' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('JOB_INVALID');
    expect(d.flag().resolved_at).toBeUndefined();
  });
});

describe('beside it', () => {
  it('a claim with no refused refund is one job: a press without one resolves it, as before', async () => {
    arcRefuses = false;
    const d = await desk();
    expect(d.row().booking_details.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND' });
    const [listed] = await d.open();
    expect(listed.attention).toMatchObject({ kind: 'airline_refund' });
    expect(listed.attention.jobs).toBeUndefined();
    expect((await d.handle(listed.attention, { note: 'Claimed it.' })).status).toBe(200);
    expect(await d.open()).toHaveLength(0);
  });

  it('"Customer refund handled" on a claim with no refused refund is refused: there is no such job', async () => {
    arcRefuses = false;
    const d = await desk();
    const [listed] = await d.open();
    const response = await d.handle(listed.attention, { note: 'Refunded.', job: 'refund' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(d.flag().resolved_at).toBeUndefined();
    expect(d.flag().refundHandled).toBeUndefined();
  });
});
