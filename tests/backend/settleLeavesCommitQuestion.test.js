import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';
import { attentionOf, commitUnknownOf } from '../../shared/reviewQueue.js';

/**
 * Finish refund settles the money, not whether the airline holds a booking
 * whose commit never answered.
 *
 * A commit that never answered, cancelled by staff, ARC Pay refusing the
 * refund: the desk entry leads with the refused refund, which invites Finish
 * refund. A full one is "settled" (there is no PNR, so the airline counts as
 * released) and the flag is not an airline claim, so settle stamped the open
 * commit flag resolved - "refund finished by the desk", no held or not-held
 * answer. commitUnknownOf then read the question as answered, and "does the
 * airline hold it?" left the desk with nobody having asked. On a commit flag
 * the desk had already answered, settle wrote its own words over the desk's
 * "not held" note.
 *
 * Settle now never resolves a commit that never answered - on top, or under
 * a later flag whose resolving would settle it too. The airline's answer is
 * resolve-review's, with its outcome.
 *
 * The cancel is the real one, over the row the order route leaves; the desk
 * list, Finish refund and "Mark as handled" are the real routes.
 */

const REF = 'FLTUNK1';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

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

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };

beforeEach(() => {
  vi.resetModules();
  ledger = [];
  arcRefuses = true;
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockImplementation(async () => ({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, ...ledger] },
  }));
  // ARC Pay refuses the cancel's VOID and REFUND; later, it takes a REFUND.
  axios.put.mockImplementation(async (_url, body) => {
    if (arcRefuses) return { status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } };
    if (body?.apiOperation === 'REFUND') {
      ledger.push({ result: 'SUCCESS', transaction: { id: `r-${ledger.length + 1}`, type: 'REFUND', amount: Number(body.transaction.amount), currency: 'USD' } });
    }
    return { status: 200, data: { result: 'SUCCESS' } };
  });
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
    finishRefund: () => {
      arcRefuses = false;
      return request(app).post('/api/flights/admin-bookings/bk-unk1/refund').send({ mode: 'refund', amount: 291, reason: 'Refund finished by the support desk' });
    },
    handle: async (body) => request(app).post(`/api/flights/admin-bookings/bk-unk1/resolve-review${await shownQueryFor('bk-unk1')}`).send(body),
    flag: () => table.row(REF).booking_details.needs_review,
  };
};

describe('Finish refund on a staff-cancelled commit that never answered', () => {
  it('returns the money and leaves the airline question open for the desk to answer', async () => {
    const d = await desk([commitUnknown()]);
    expect((await d.cancel()).status).toBe(200);
    expect(table.row(REF).booking_details.cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED' });

    const finished = await d.finishRefund();
    expect(finished.status).toBe(200);
    expect(table.row(REF).booking_details.cancellation).toMatchObject({ paymentAction: 'FULL_REFUND', refundAmount: 291 });

    expect(d.flag().resolved_at, 'the commit was answered "refund finished by the desk", with no held or not-held').toBeUndefined();
    expect(d.flag().resolution).toBeUndefined();
    expect(commitUnknownOf(table.row(REF))).not.toBeNull();
    const [listed] = await d.open();
    expect(listed, '"does the airline hold it?" left the desk unasked').toMatchObject({
      bookingReference: REF, commitUnknown: true, attention: { kind: 'review', reason: COMMIT_UNKNOWN },
    });

    // The desk answers it, with what the airline said.
    expect((await d.handle({ note: 'Rang the airline: nothing held.', outcome: 'not_held' })).status).toBe(200);
    expect(d.flag()).toMatchObject({ reason: COMMIT_UNKNOWN, outcome: 'not_held', resolution: 'Rang the airline: nothing held.' });
    expect(await d.open()).toHaveLength(0);
  });

  it('answered "not held" by the desk before: the desk\'s answer and note are kept', async () => {
    const d = await desk([commitUnknown()]);
    await d.cancel();
    expect((await d.handle({ note: 'Rang the airline: nothing held.', outcome: 'not_held' })).status).toBe(200);
    const answered = JSON.parse(JSON.stringify(d.flag()));

    expect((await d.finishRefund()).status).toBe(200);
    expect(d.flag(), 'settle wrote "refund finished by the desk" over the desk\'s not-held note').toEqual(answered);
    expect(attentionOf(table.row(REF))).toBeNull();
  });

  it('under a later flag of the cancel\'s own: that flag stays open too, since resolving it would answer the commit', async () => {
    const row = commitUnknown();
    const at = row.booking_details.needs_review.at;
    Object.assign(row, { status: 'cancelled' });
    row.booking_details = {
      ...row.booking_details,
      gds_chain: { state: 'cancelled', startedAt: at, cancelledAt: at },
      cancellation: { cancelledAt: at, reason: 'Customer called', amadeusCancelled: false, paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, currency: 'USD' },
      needs_review: { reason: 'automatic reversal ended NONE: retrieve order failed (503)', source: 'cancellation', at, previous: row.booking_details.needs_review },
    };
    const d = await desk([row]);
    expect((await d.finishRefund()).status).toBe(200);
    expect(d.flag().resolved_at).toBeUndefined();
    expect(commitUnknownOf(table.row(REF))).not.toBeNull();
  });
});

describe('beside it', () => {
  it('a cancel\'s own flag with no commit under it is still resolved by Finish refund, as before', async () => {
    const row = commitUnknown();
    const at = row.booking_details.needs_review.at;
    Object.assign(row, { status: 'cancelled' });
    row.booking_details = {
      ...row.booking_details,
      pnr: 'ABC123',
      gds_chain: { state: 'cancelled', startedAt: at, cancelledAt: at },
      cancellation: { cancelledAt: at, reason: 'Customer called', amadeusCancelled: true, paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, currency: 'USD' },
      needs_review: { reason: 'automatic reversal ended NONE: retrieve order failed (503)', source: 'cancellation', at },
    };
    const d = await desk([row]);
    expect((await d.finishRefund()).status).toBe(200);
    expect(d.flag()).toMatchObject({ resolution: 'refund finished by the desk' });
    expect(d.flag().resolved_at).toBeTruthy();
    expect(attentionOf(table.row(REF))).toBeNull();
  });

  it('a commit recorded held under its record locator is not a commit that never answered: its later flag settles as before', async () => {
    const row = commitUnknown();
    const at = row.booking_details.needs_review.at;
    Object.assign(row, { status: 'cancelled' });
    row.booking_details = {
      ...row.booking_details,
      pnr: 'HELD42',
      gds_chain: { state: 'cancelled', startedAt: at, cancelledAt: at },
      cancellation: { cancelledAt: at, reason: 'Customer called', amadeusCancelled: true, paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 0, currency: 'USD' },
      needs_review: {
        reason: 'PNR committed, never ticketed', ticketed: false, at,
        previous: { ...row.booking_details.needs_review, resolved_at: at, resolution: 'Held.', outcome: 'held', pnr: 'HELD42' },
      },
    };
    const d = await desk([row]);
    expect((await d.finishRefund()).status).toBe(200);
    expect(d.flag()).toMatchObject({ resolution: 'refund finished by the desk' });
  });
});
