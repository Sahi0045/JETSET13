import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';
import { selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';

/**
 * Jet Coins that a failed order, a duplicate payment or a void could not give
 * back. The return failure was written on the booking and logged, and nothing
 * else: the desk's open queue never listed it, so the coins stayed out of the
 * customer's wallet until someone happened to open the booking.
 *
 * Listed for the desk only: the Slack alarm does not announce coins, and
 * "Mark as handled" records its note on the coin problem, never as a review
 * flag (which drives the alarm and the cancel rules).
 */

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return { ...actual, get supabase() { return { from: (...args) => table.from(...args) }; } };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

const AT = '2026-10-11T10:00:00.000Z';
const returnFailed = (over = {}) => ({ kind: 'return_failed', coins: 5000, reason: 'void', at: AT, ...over });

const booking = (details = {}, over = {}) => ({
  id: 'bk-coins',
  booking_reference: 'FLTCOIN1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 72.2,
  created_at: '2026-10-11T09:00:00.000Z',
  ...over,
  booking_details: {
    pnr: 'ABC123', gds: { ticketed: true }, tickets: [{ number: '220-7491175300' }],
    verified_charge: { total: 72.2, wallet: { coins: 5000, amount: 50 } },
    ...details,
  },
});

const voided = (details = {}) => booking(
  { cancellation: { paymentAction: 'VOID', refundAmount: 72.2, cancellationFee: 0, cancelledAt: AT }, ...details },
  { status: 'cancelled', payment_status: 'refunded' },
);

describe('the desk queue and Jet Coins that could not be returned', () => {
  it('lists a booking whose coins could not be returned, naming the coins', () => {
    const attention = attentionOf(voided({ wallet_issue: returnFailed() }));
    expect(attention).toEqual({
      kind: 'coins_not_returned',
      reason: 'Jet Coins (5,000) could not be returned: use Return Jet Coins',
      since: AT,
    });
    expect(attentionLabel(attention)).toBe('Jet Coins not returned');
  });

  it('lists one on a booking that is still live too, as after a duplicate payment', () => {
    expect(attentionOf(booking({ wallet_issue: returnFailed({ reason: 'duplicate' }) }))?.kind).toBe('coins_not_returned');
  });

  it('says so without a number when the problem did not record how many coins', () => {
    const { coins: _unknown, ...issue } = returnFailed();
    expect(attentionOf(voided({ wallet_issue: issue })).reason).toBe('Jet Coins could not be returned: use Return Jet Coins');
  });

  it('does not list a capture that failed: the customer kept the flight', () => {
    expect(attentionOf(booking({ wallet_issue: { kind: 'capture_failed', coins: 5000, status: 'error', at: AT } }))).toBeNull();
  });

  it('stops listing it once the problem is resolved', () => {
    expect(attentionOf(voided({ wallet_issue: returnFailed({ resolved_at: '2026-10-12T09:00:00.000Z', resolvedBy: 'staff-1' }) }))).toBeNull();
  });

  it('lists it after a review flag a person resolved, which settles nothing about the coins', () => {
    const resolvedFlag = { reason: 'flagged for review', at: AT, resolved_at: '2026-10-11T11:00:00.000Z', resolution: 'done' };
    expect(attentionOf(booking({ needs_review: resolvedFlag, wallet_issue: returnFailed() }))?.kind).toBe('coins_not_returned');
  });

  it('shows the booking\'s other open job first, and lists nothing new for a booking with no coin problem', () => {
    const failedCancel = {
      reason: 'the airline did not cancel the reservation', source: 'cancellation', cancelFailed: true, at: AT,
    };
    expect(attentionOf(booking({ needs_review: failedCancel, wallet_issue: returnFailed() }))?.kind).toBe('cancel_failed');
    expect(attentionOf(voided())).toBeNull();
  });
});

describe('the needs-review alarm', () => {
  it('does not announce a booking for its coins alone', () => {
    const resolvedFlag = { reason: 'flagged for review', at: AT, resolved_at: '2026-10-11T11:00:00.000Z', resolution: 'done' };
    expect(selectUnannounced([
      booking({ gds: { ticketed: false }, tickets: [], needs_review: resolvedFlag, wallet_issue: returnFailed({ reason: 'duplicate' }) }, { booking_reference: 'FLTCOIN2' }),
      booking({ gds: { ticketed: false }, tickets: [], wallet_issue: returnFailed({ reason: 'duplicate' }) }, { booking_reference: 'FLTCOIN3' }),
    ]).map((row) => row.booking_reference)).toEqual(['FLTCOIN3']);
  });
});

const deskApp = async (row) => {
  table = fakeBookingsTable([row]);
  supabaseMock.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return app;
};

const shown = (row) => `?${new URLSearchParams({ shownKind: attentionOf(row).kind, shownSince: attentionOf(row).since || '' })}`;

describe('"Mark as handled" on Jet Coins that could not be returned', () => {
  beforeEach(() => { vi.resetModules(); });

  it('records the note on the coin problem, takes it off the queue, and writes no review flag', async () => {
    const row = voided({ wallet_issue: returnFailed() });
    const app = await deskApp(row);

    const res = await request(app)
      .post(`/api/flights/admin-bookings/${row.id}/resolve-review${shown(row)}`)
      .send({ note: 'Returned 5,000 coins by hand after the outage' });

    expect(res.status).toBe(200);
    const saved = table.row(row.booking_reference);
    expect(saved.booking_details.wallet_issue).toMatchObject({
      kind: 'return_failed', coins: 5000, resolvedBy: 'staff-1', resolution: 'Returned 5,000 coins by hand after the outage',
    });
    expect(saved.booking_details.wallet_issue.resolved_at).toEqual(expect.any(String));
    expect(saved.booking_details.needs_review).toBeUndefined();
    expect(attentionOf(saved)).toBeNull();
  });
});

describe('Return Jet Coins on a booking whose coins could not be returned', () => {
  const runReturn = async (row, { returned = 2000, markFails = false } = {}) => {
    table = fakeBookingsTable([row], { fail: ({ patch }) => markFails && Boolean(patch) });
    supabaseMock.from.mockImplementation(table.from);
    supabaseMock.rpc = vi.fn()
      .mockResolvedValueOnce({ data: { status: 'captured' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'captured', coins: returned }, error: null })
      .mockResolvedValueOnce({ data: { coins: 0 }, error: null });
    const { staffReturn } = await import('../../backend/controllers/wallet.controller.js');
    const res = createResponse();
    await staffReturn(createRequest({ user: { id: 'staff-9', role: 'support' }, body: { bookingReference: row.booking_reference, coins: 2000 } }), res);
    return res;
  };

  it('marks the problem resolved by the staff member once coins went back', async () => {
    const res = await runReturn(voided({ wallet_issue: returnFailed() }));

    expect(res.body.data.coins).toBe(2000);
    const issue = table.row('FLTCOIN1').booking_details.wallet_issue;
    expect(issue).toMatchObject({ kind: 'return_failed', coins: 5000, resolvedBy: 'staff-9' });
    expect(issue.resolved_at).toEqual(expect.any(String));
    expect(attentionOf(table.row('FLTCOIN1'))).toBeNull();
  });

  it('leaves it open when nothing went back', async () => {
    await runReturn(voided({ wallet_issue: returnFailed() }), { returned: 0 });
    expect(table.row('FLTCOIN1').booking_details.wallet_issue.resolved_at).toBeUndefined();
  });

  it('leaves a capture problem and a booking with no problem as they were', async () => {
    const capture = { kind: 'capture_failed', coins: 5000, status: 'error', at: AT };
    await runReturn(booking({ wallet_issue: capture }));
    expect(table.row('FLTCOIN1').booking_details.wallet_issue).toEqual(capture);

    await runReturn(voided());
    expect(table.row('FLTCOIN1').booking_details.wallet_issue).toBeUndefined();
    expect(table.writes.filter((write) => write.patch)).toEqual([]);
  });

  it('still answers the coins returned when the problem cannot be marked resolved', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runReturn(voided({ wallet_issue: returnFailed() }), { markFails: true });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { coins: 2000 } });
    expect(table.row('FLTCOIN1').booking_details.wallet_issue.resolved_at).toBeUndefined();
    silence.mockRestore();
  });
});
