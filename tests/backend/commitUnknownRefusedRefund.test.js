import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';

/**
 * A customer refund ARC Pay refused, on a staff cancel of a booking whose
 * airline commit never answered.
 *
 * Where two rules meet. The desk keeps a commit that never answered on Needs
 * attention whatever happened to the booking since, cancelled included, until
 * a person records what the airline said (commitUnknownOf); and a refund ARC
 * Pay refused stays there until it is recorded or handled on its own entry
 * (refundNotReturnedAttentionOf) - a flag about something else does not
 * settle it, as with an airline claim. The commit is decided first, and the
 * cancel writes no flag for a refused refund, so the desk read only "chain
 * failed after commit at commit" of a booking whose customer had nothing back;
 * and recording "the airline does not hold it" took the unreturned money off
 * the list.
 *
 * The cancel is the real one, over the row the order route leaves; the desk
 * list and "Mark as handled" are the real routes.
 */

const REF = 'FLTUNK1';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

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

/** The row the order route leaves when the commit never answered, the chain's claim long lapsed. */
const commitUnknown = (details = {}) => {
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
      ...details,
    },
  };
};

beforeEach(async () => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  // ARC Pay refuses the VOID and the REFUND.
  axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } });
});

const desk = async (rows) => {
  table = fakeBookingsTable(rows, { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return {
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-unk1/cancel').send({ reason: 'Customer called' }),
    open: async () => (await request(app).get('/api/flights/admin-bookings-all?attention=open')).body.data,
    // With the entry the desk page showed, as the page sends it.
    handle: async (body) => request(app).post(`/api/flights/admin-bookings/bk-unk1/resolve-review${await shownQueryFor('bk-unk1')}`).send(body),
  };
};

describe('a refund ARC Pay refused, on a cancel of a commit that never answered', () => {
  it('the desk reads the refused refund beside the commit, and it stays once the airline\'s answer is recorded', async () => {
    const { cancel, open, handle } = await desk([commitUnknown()]);

    expect((await cancel()).status).toBe(200);
    const row = table.row(REF);
    expect(row.status).toBe('cancelled');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED', refundAmount: 0 });

    // Still the commit's entry - the airline's answer is asked for - and it says the refund was refused.
    const [listed] = await open();
    expect(listed).toMatchObject({ bookingReference: REF, commitUnknown: true, attention: { kind: 'review' } });
    expect(listed.attention.reason, 'the desk is never told the customer refund was refused').toMatch(/the refund did not go through \(REFUND_FAILED\)/);
    expect(listed.attention.reason).toMatch(/291\.00 USD owed/);
    expect(listed.attention.reason).toMatch(/chain failed after commit at commit/);

    // The airline does not hold it: recorded, and the commit is settled.
    expect((await handle({ note: 'Rang the airline: nothing held.', outcome: 'not_held' })).status).toBe(200);
    const after = await open();
    expect(after.map((b) => b.bookingReference), 'the unreturned 291 left Needs attention').toEqual([REF]);
    expect(after[0]).toMatchObject({ commitUnknown: false, attention: { kind: 'refund_failed' } });
    expect(attentionLabel(after[0].attention)).toBe('Refund did not go through');

    // Handled on its own entry - no airline answer asked for now - it goes.
    expect((await handle({ note: 'Refunded 291 in the ARC portal.' })).status).toBe(200);
    expect(await open()).toHaveLength(0);
    expect(table.row(REF).booking_details.needs_review).toMatchObject({
      reason: /REFUND_FAILED/, resolution: 'Refunded 291 in the ARC portal.',
      previous: { reason: COMMIT_UNKNOWN, outcome: 'not_held' },
    });
  });
});

describe('beside it', () => {
  const cancelledRow = (cancellation, review) => ({
    ...commitUnknown(),
    status: 'cancelled',
    booking_details: {
      order_id: REF,
      arc_captured_amount: 291,
      cancellation: { cancelledAt: '2026-09-22T10:00:00Z', refundAmount: 0, cancellationFee: 0, currency: 'USD', amadeusCancelled: false, ...cancellation },
      needs_review: { reason: COMMIT_UNKNOWN, ticketed: false, at: '2026-09-22T09:00:00Z', ...review },
    },
  });

  it('a refund that went back: the commit\'s own words, and settled with it, as before', () => {
    const refunded = { ...cancelledRow({ paymentAction: 'VOID', refundAmount: 291 }), payment_status: 'refunded' };
    expect(attentionOf(refunded)).toEqual({ kind: 'review', reason: COMMIT_UNKNOWN, since: '2026-09-22T09:00:00Z' });
    const answered = { ...cancelledRow({ paymentAction: 'VOID', refundAmount: 291 }, { resolved_at: '2026-09-22T11:00:00Z', outcome: 'not_held' }), payment_status: 'refunded' };
    expect(attentionOf(answered)).toBeNull();
  });

  it('a commit answered before the cancel, whose refund was then refused: the refused refund, as before', () => {
    const answeredFirst = cancelledRow({ paymentAction: 'REFUND_FAILED' }, { resolved_at: '2026-09-22T09:30:00Z', outcome: 'not_held' });
    expect(attentionOf(answeredFirst)).toMatchObject({ kind: 'refund_failed', since: '2026-09-22T10:00:00Z' });
  });

  // The cancel's own flag for a refund nobody heard back about. Closed with the
  // airline's answer ("not held") it settled the airline question only: the
  // unknown refund stays on the desk (unansweredRefundSurvivesAirlineAnswer).
  // This case used to expect it gone - the defect the final check found.
  // Closed plainly, with no airline answer, it is settled, as before.
  it('a refund the cancel sent and never heard back about stays on the desk after the airline answer, and is settled by a plain close', () => {
    const unknown = () => {
      const row = cancelledRow({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true });
      row.booking_details.needs_review = {
        reason: 'automatic reversal ended NONE: retrieve order failed (503)', source: 'cancellation', at: '2026-09-22T10:00:00Z',
        previous: row.booking_details.needs_review,
      };
      return row;
    };
    expect(attentionOf(unknown())).toMatchObject({ kind: 'review', reason: 'automatic reversal ended NONE: retrieve order failed (503)' });

    const answered = unknown();
    answered.booking_details.needs_review.resolved_at = '2026-09-22T11:00:00Z';
    answered.booking_details.needs_review.outcome = 'not_held';
    expect(attentionOf(answered)).toMatchObject({ kind: 'refund_not_made' });

    const closedPlainly = unknown();
    closedPlainly.booking_details.needs_review.resolved_at = '2026-09-22T11:00:00Z';
    expect(attentionOf(closedPlainly)).toBeNull();
  });

  it('a refused refund whose own entry was marked handled after the cancel is settled, as before', () => {
    const handled = cancelledRow({ paymentAction: 'REFUND_FAILED' }, {
      reason: 'the refund did not go through (REFUND_FAILED)', resolved_at: '2026-09-22T12:00:00Z',
    });
    expect(attentionOf(handled)).toBeNull();
  });
});
