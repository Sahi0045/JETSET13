import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * "Mark as handled" records what the desk page showed, or nothing.
 *
 * The route acted on whatever the booking needed NOW. A refundable fare past
 * its void window, ARC Pay refusing the refund: the desk reads "Refund to
 * claim from the airline" (REFUND_FAILED under the claim flag). Two members
 * load /desk; the page never polls. X claims the tickets and marks it
 * handled, and the booking now reads "Refund did not go through". Y, on the
 * page loaded before that, records the same claim - and the route took Y's
 * claim note as the refused refund's resolution, so the unreturned 241 left
 * Needs attention with nothing returned.
 *
 * The desk now says which entry it showed (kind, and the time it gives); a
 * press on an entry the booking no longer shows is refused, BOOKING_CHANGED,
 * and nothing is written. So is a press that says nothing of it: the desk page
 * always says, and one that does not is a tab from before this check
 * (tests/backend/resolveReviewShownRequired.test.js).
 *
 * The cancel is the real one; the desk list and "Mark as handled" are the real
 * routes over the row it wrote.
 */

const booking = () => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com', refundable: true },
  user_id: null,
});

const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c), insert: vi.fn(() => c), eq: vi.fn(() => c), is: vi.fn(() => c),
      neq: vi.fn(() => c), or: vi.fn(() => c), filter: vi.fn(() => c), order: vi.fn(() => c), limit: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve) => resolve({ data: [row], error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

const cancelFlightOrder = vi.fn();
let database = supabaseFor(booking());

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return database.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));
vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

beforeEach(() => {
  vi.resetModules();
  database = supabaseFor(booking());
  // Past the void window: the tickets are listed for a claim from the airline.
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['108-2412345671'] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  // ARC refuses the REFUND.
  axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } });
});

/** The cancel, then the row as it left it (with an id the desk routes can address). */
const cancelled = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } }), res);
  const written = database.updates.find((update) => update.status === 'cancelled');
  return { ...booking(), ...written, id: 'b-claim', created_at: '2026-09-22T09:00:00Z' };
};

/** What the desk page sends with a press: the entry it showed, as the list gave it. */
const shownOf = (attention) => (attention
  ? `?${new URLSearchParams({ shownKind: attention.kind, shownSince: attention.since ?? '' })}`
  : '');

const deskOver = async (rows) => {
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  const open = async () => (await request(app).get('/api/flights/admin-bookings-all?attention=open')).body.data;
  const handle = (id, note, shown, extra = {}) => request(app)
    .post(`/api/flights/admin-bookings/${id}/resolve-review${shownOf(shown)}`)
    .send({ note, ...extra });
  return { table, open, handle };
};

describe('a second member on a page loaded before the first press', () => {
  it('is refused, and the refused customer refund stays on Needs attention', async () => {
    const desk = await deskOver([await cancelled()]);

    // Both loaded the list while it read "Refund to claim from the airline".
    const [shown] = await desk.open();
    expect(shown.attention).toMatchObject({ kind: 'airline_refund' });

    // X claims the tickets from the airline. The entry is two jobs, the
    // refused refund and the claim (attention.jobs), so the press names the one
    // X handled.
    expect((await desk.handle('b-claim', 'Claimed 108-2412345671 from the airline.', shown.attention, { job: 'claim' })).status).toBe(200);
    const flagAfterX = desk.table.row('FLT123').booking_details.needs_review;

    // Y, on the page as it was, records the same claim.
    const second = await desk.handle('b-claim', 'Claimed the ticket from the airline (Y).', shown.attention, { job: 'claim' });
    expect(second.status, 'Y\'s claim note was written as the refused refund\'s resolution').toBe(409);
    expect(second.body.code).toBe('BOOKING_CHANGED');
    expect(second.body.error).toMatch(/changed/);
    expect(second.body.error).toMatch(/Refund did not go through/);
    expect(second.body.error).toMatch(/Nothing has been recorded/);

    // Nothing written: the claim as X left it, and the 241 still on the list.
    expect(desk.table.row('FLT123').booking_details.needs_review).toEqual(flagAfterX);
    const listed = await desk.open();
    expect(listed.map((b) => b.bookingReference), 'the unreturned 241 left Needs attention').toEqual(['FLT123']);
    expect(listed[0].attention).toMatchObject({ kind: 'refund_failed' });

    // Reloaded, Y sees the refused refund, and handling that is recorded.
    expect((await desk.handle('b-claim', 'Refunded 241 in the ARC portal.', listed[0].attention)).status).toBe(200);
    expect(await desk.open()).toHaveLength(0);
    expect(desk.table.row('FLT123').booking_details.needs_review).toMatchObject({
      reason: /REFUND_FAILED/, resolution: 'Refunded 241 in the ARC portal.',
      previous: { resolution: 'Claimed 108-2412345671 from the airline.' },
    });
  });

  it('a press naming an entry the booking does not show is refused whichever way round', async () => {
    const desk = await deskOver([await cancelled()]);
    // A made-up entry the booking never showed: the refused refund, under the claim still open.
    const [shown] = await desk.open();
    const response = await desk.handle('b-claim', 'Refunded 241 in the ARC portal.', { kind: 'refund_failed', since: shown.attention.since });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(response.body.error).toMatch(/Refund to claim from the airline/);
    expect(desk.table.row('FLT123').booking_details.needs_review.resolved_at).toBeUndefined();
  });
});

describe('beside it', () => {
  const flagged = (at, extra = {}) => ({
    id: 'b-held',
    booking_reference: 'FLTHELD1',
    travel_type: 'flight',
    status: 'pending_ticketing',
    payment_status: 'paid',
    total_amount: 291,
    created_at: '2026-09-22T09:00:00Z',
    booking_details: {
      pnr: 'HELD42', gds: { ticketed: false },
      needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at, ...extra },
    },
  });

  it('a press on what the booking still shows is recorded, as before', async () => {
    const desk = await deskOver([flagged('2026-09-22T09:05:00Z')]);
    const [shown] = await desk.open();
    const response = await desk.handle('b-held', 'Issued the ticket by hand.', shown.attention);
    expect(response.status).toBe(200);
    expect(desk.table.row('FLTHELD1').booking_details.needs_review).toMatchObject({
      reason: 'chain failed after commit at issueTicket', resolution: 'Issued the ticket by hand.',
    });
  });

  it('the same kind under a newer flag is refused: the page showed the one before', async () => {
    const desk = await deskOver([flagged('2026-09-22T09:10:00Z')]);
    const response = await desk.handle('b-held', 'Issued the ticket by hand.', { kind: 'review', since: '2026-09-22T09:05:00Z' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(desk.table.row('FLTHELD1').booking_details.needs_review.resolved_at).toBeUndefined();
  });

  it('an entry with no time (paid, seats held, never flagged) is matched on its kind', async () => {
    const unflagged = { ...flagged('x'), booking_details: { pnr: 'HELD42', gds: { ticketed: false } } };
    const desk = await deskOver([unflagged]);
    const [shown] = await desk.open();
    expect(shown.attention).toMatchObject({ kind: 'not_ticketed', since: null });
    expect((await desk.handle('b-held', 'Ticketed by hand.', shown.attention)).status).toBe(200);
    expect(desk.table.row('FLTHELD1').booking_details.needs_review).toMatchObject({
      reason: 'PNR committed, never ticketed', ticketed: false, resolution: 'Ticketed by hand.',
    });
  });

  it('a press that says nothing of what it showed is refused: reload the page', async () => {
    const desk = await deskOver([flagged('2026-09-22T09:05:00Z')]);
    const response = await desk.handle('b-held', 'Issued the ticket by hand.', null);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(desk.table.row('FLTHELD1').booking_details.needs_review.resolved_at).toBeUndefined();
  });

  it('a commit that never answered is still answered with what the airline said', async () => {
    const commitUnknown = {
      ...flagged('2026-09-22T09:05:00Z'),
      status: 'pending',
      booking_details: { needs_review: { reason: 'chain failed after commit at commit', at: '2026-09-22T09:05:00Z' } },
    };
    const desk = await deskOver([commitUnknown]);
    const [shown] = await desk.open();
    expect(shown.attention).toMatchObject({ kind: 'review' });
    const response = await desk.handle('b-held', 'Rang the airline: nothing held.', shown.attention, { outcome: 'not_held' });
    expect(response.status).toBe(200);
    expect(desk.table.row('FLTHELD1').booking_details.needs_review).toMatchObject({ outcome: 'not_held' });
  });

  it('a booking already handled is still answered ALREADY_RESOLVED, whatever the page showed', async () => {
    const desk = await deskOver([flagged('2026-09-22T09:05:00Z', { resolved_at: '2026-09-22T09:30:00Z', resolution: 'done' })]);
    const response = await desk.handle('b-held', 'Issued the ticket by hand.', { kind: 'review', since: '2026-09-22T09:05:00Z' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_RESOLVED');
  });
});
