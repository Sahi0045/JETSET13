import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { supabaseMock } from './setup.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';
import { selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';

/**
 * A valid trip voucher the order route could not reserve (the wallet was out,
 * three times) was marked on the booking and logged, and nothing else: the
 * desk's open queue listed only Jet Coins that could not be returned, so the
 * customer's reward was simply never paid. A refusal by the voucher itself
 * (VOUCHER_*) is the customer's answer and is not listed.
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

const AT = '2026-10-13T10:00:00.000Z';
const notReserved = (over = {}) => ({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'WALLET_UNAVAILABLE', at: AT, ...over });

const booking = (details = {}, over = {}) => ({
  id: 'bk-trip',
  booking_reference: 'FLTTRIP1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-10-13T09:00:00.000Z',
  ...over,
  booking_details: {
    pnr: 'ABC123', gds: { ticketed: true }, tickets: [{ number: '220-7491175300' }],
    verified_charge: { total: 291, voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } },
    ...details,
  },
});

describe('the desk queue and a trip reward that could not be recorded', () => {
  it('lists a voucher the wallet could not reserve, naming it', () => {
    const attention = attentionOf(booking({ voucher_issue: notReserved() }));
    expect(attention).toEqual({
      kind: 'trip_reward_not_recorded',
      reason: 'Trip reward SHUBHAM could not be recorded: check the voucher',
      since: AT,
    });
    expect(attentionLabel(attention)).toBe('Trip reward not recorded');
  });

  it('lists any other reason that is not the voucher\'s own answer', () => {
    expect(attentionOf(booking({ voucher_issue: notReserved({ reason: 'LOGIN_REQUIRED' }) }))?.kind).toBe('trip_reward_not_recorded');
    expect(attentionOf(booking({ voucher_issue: notReserved({ reason: undefined }) }))?.kind).toBe('trip_reward_not_recorded');
  });

  it('does not list a voucher that refused for its own reasons', () => {
    for (const reason of ['VOUCHER_USED_UP', 'VOUCHER_FIRST_TIME_ONLY', 'VOUCHER_EXPIRED']) {
      expect(attentionOf(booking({ voucher_issue: notReserved({ reason }) }))).toBeNull();
    }
  });

  it('stops listing it once it is resolved', () => {
    expect(attentionOf(booking({ voucher_issue: notReserved({ resolved_at: '2026-10-13T11:00:00.000Z' }) }))).toBeNull();
  });

  it('does not list it on a booking that was cancelled or whose payment went back: no reward is owed', () => {
    expect(attentionOf(booking({ voucher_issue: notReserved() }, { status: 'cancelled', payment_status: 'refunded' }))).toBeNull();
    expect(attentionOf(booking({ voucher_issue: notReserved() }, { payment_status: 'reversed' }))).toBeNull();
  });

  it('shows the booking\'s other open job first', () => {
    const failedCancel = { reason: 'the airline did not cancel the reservation', source: 'cancellation', cancelFailed: true, at: AT };
    expect(attentionOf(booking({ needs_review: failedCancel, voucher_issue: notReserved() }))?.kind).toBe('cancel_failed');
  });

  // A capture that failed is never listed (the customer kept the flight), and
  // it used to hide the reward behind it: both lived in `wallet_issue`.
  it('lists it on a booking whose Jet Coins capture also failed', () => {
    const capture = { kind: 'capture_failed', coins: 500, status: 'released', at: AT };
    expect(attentionOf(booking({ wallet_issue: capture, voucher_issue: notReserved() }))?.kind).toBe('trip_reward_not_recorded');
  });

  it('names the reward without a code when the refusal recorded none', () => {
    expect(attentionOf(booking({ voucher_issue: notReserved({ code: undefined }) })).reason).toBe('Trip reward could not be recorded: check the voucher');
  });
});

describe('the needs-review alarm', () => {
  it('does not announce a booking for its trip reward alone', () => {
    expect(selectUnannounced([booking({ voucher_issue: notReserved() })])).toEqual([]);
  });
});

describe('"Mark as handled" on a trip reward that could not be recorded', () => {
  beforeEach(() => { vi.resetModules(); });

  it('records the note on the refusal, takes it off the queue, and writes no review flag', async () => {
    const row = booking({ voucher_issue: notReserved() });
    table = fakeBookingsTable([row]);
    supabaseMock.from.mockImplementation(table.from);
    const routes = (await import('../../backend/routes/flight.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/flights', routes);
    const shown = new URLSearchParams({ shownKind: attentionOf(row).kind, shownSince: attentionOf(row).since });

    const res = await request(app)
      .post(`/api/flights/admin-bookings/${row.id}/resolve-review?${shown}`)
      .send({ note: 'Credited 5,000 coins by hand' });

    expect(res.status).toBe(200);
    const saved = table.row(row.booking_reference);
    expect(saved.booking_details.voucher_issue).toMatchObject({
      kind: 'voucher_refused', code: 'SHUBHAM', resolvedBy: 'staff-1', resolution: 'Credited 5,000 coins by hand',
    });
    expect(saved.booking_details.voucher_issue.resolved_at).toEqual(expect.any(String));
    expect(saved.booking_details.needs_review).toBeUndefined();
    expect(attentionOf(saved)).toBeNull();
  });
});

describe('"Mark as handled" on a trip reward beside a Jet Coins problem', () => {
  beforeEach(() => { vi.resetModules(); });

  it('closes the reward and leaves the coin problem as it was', async () => {
    const capture = { kind: 'capture_failed', coins: 500, status: 'released', at: AT };
    const row = booking({ wallet_issue: capture, voucher_issue: notReserved() });
    table = fakeBookingsTable([row]);
    supabaseMock.from.mockImplementation(table.from);
    const routes = (await import('../../backend/routes/flight.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/flights', routes);
    const shown = new URLSearchParams({ shownKind: attentionOf(row).kind, shownSince: attentionOf(row).since });

    const res = await request(app)
      .post(`/api/flights/admin-bookings/${row.id}/resolve-review?${shown}`)
      .send({ note: 'Credited 5,000 coins by hand' });

    expect(res.status).toBe(200);
    const saved = table.row(row.booking_reference);
    expect(saved.booking_details.voucher_issue.resolved_at).toEqual(expect.any(String));
    expect(saved.booking_details.wallet_issue).toEqual(capture);
    expect(attentionOf(saved)).toBeNull();
  });
});
