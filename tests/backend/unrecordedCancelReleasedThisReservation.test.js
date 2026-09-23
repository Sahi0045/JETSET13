import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryOf } from './helpers/deskShown.js';
import { allowedStatuses } from '../../shared/bookingStatusChange.js';
import { COMMIT_UNKNOWN_REVIEW_REASON, UNTICKETED_REVIEW_REASON } from '../../shared/reviewQueue.js';

/**
 * Modify Status takes `cancelled` on an unrecorded cancel only for the
 * reservation that cancel released.
 *
 * The exemption asked only whether an unrecorded-cancellation flag was there,
 * read past "Mark as handled" - not what its cancel did, nor what was recorded
 * since. The finding's case: an airline commit never answered, so the row had
 * no PNR. Staff pressed Cancel & Refund: no airline to call, the money moved,
 * and the record could not be written - the flag says "no airline
 * reservation". The desk then learned the airline does hold the booking and
 * recorded it held under its PNR (recordHeldAtAirline), which resolves that
 * flag under the "never ticketed" one. Modify Status then accepted Cancelled:
 * the PNR was never released, and Cancel & Refund, ticket sync and the
 * paid-not-ticketed alarm all skip a cancelled booking.
 *
 * The flag now records whether its cancel released the reservation
 * (amadeusCancelled) and which (pnr); a flag stored before says so only in its
 * text. The exemption holds only for that same reservation, and only while
 * nothing since records it held again - above the flag, only a later cancel of
 * the same reservation that the airline refused and a person has looked at.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'admin-1', email: 'desk@jetsetterss.com', role: 'admin' }; next(); },
    admin: (_req, _res, next) => next(),
  };
});

let table = fakeBookingsTable([]);
let failCancelWrite = false;

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
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const REF = 'FLTREL1';
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const RESOLVED = { resolved_at: '2026-09-22T10:00:00Z', resolved_by: 'desk@example.com', resolution: 'checked with the airline' };
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const RELEASED_TEXT = 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
  + 'check the airline and ARC Pay and record it by hand';
const NOT_RELEASED_TEXT = 'cancellation carried out but not recorded: no airline reservation, payment VOID 291 USD; '
  + 'check the airline and ARC Pay and record it by hand';

const captured = {
  status: 200,
  data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
};

// flagUnrecordedCancellation's flag. Without `amadeusCancelled`, as stored before.
const unrecorded = (over = {}) => ({
  reason: RELEASED_TEXT, source: 'cancellation', unrecorded: true, ticketsVoided: true, at: '2026-09-22T08:03:00Z', paymentAction: 'VOID', refundAmount: 291,
  ...over,
});

// A ticketed booking whose cancel released HELD99 and could not be recorded.
const ticketed = (needsReview, over = {}) => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-22T08:00:00Z',
  ...over,
  booking_details: {
    pnr: 'HELD99',
    order_id: REF,
    customer_email: 'traveler@example.com',
    gds: { ticketed: true },
    tickets: [{ number: '220-1111111111', travelerId: '1' }],
    gds_chain: { state: 'cancelling', startedAt: HOUR_AGO(), stateBeforeCancel: 'finished' },
    ...(needsReview ? { needs_review: needsReview } : {}),
  },
});

// A paid booking whose airline commit never answered: no PNR.
const commitUnknown = () => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-22T08:00:00Z',
  booking_details: {
    order_id: REF,
    customer_email: 'traveler@example.com',
    gds: { ticketed: false },
    gds_chain: { state: 'in_progress', startedAt: HOUR_AGO() },
    needs_review: { reason: COMMIT_UNKNOWN_REVIEW_REASON, ticketed: false, at: '2026-09-22T08:01:00Z' },
  },
});

const app = async () => {
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation((...args) => table.from(...args));
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const server = express();
  server.use(express.json());
  server.use('/api/flights', routes);
  return server;
};

const load = (rows) => {
  table = fakeBookingsTable(rows, {
    tables: { price_settings: [], payments: [] },
    // The cancel's own record write fails: "carried out but not recorded".
    fail: ({ patch }) => failCancelWrite && patch?.status === 'cancelled',
  });
};

const handCancel = async () => request(await app()).put('/api/flights/admin-bookings/bk-1').send({ status: 'cancelled' });

/** Cancel & Refund from the desk, whose record write fails. */
const cancelUnrecorded = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  failCancelWrite = true;
  await handleCancelBookingAction(createRequest({
    method: 'POST', body: { bookingReference: REF, reason: 'Cancelled by the support desk' }, user: { id: 'staff-1', role: 'support' },
  }), res);
  failCancelWrite = false;
  expect(res.statusCode).toBe(500);
  // Its claim ages out, as on every booking the desk picks up.
  table.row(REF).booking_details.gds_chain.startedAt = HOUR_AGO();
  return table.row(REF).booking_details.needs_review;
};

/** As Modify Status reads the booking (frontend/src/utils/adminBookingActions.js). */
const asPanel = (booking) => ({
  type: booking.travel_type, status: booking.status, paymentStatus: booking.payment_status, details: booking.booking_details,
});

beforeEach(() => {
  vi.resetModules();
  failCancelWrite = false;
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(captured);
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn(async () => ({ success: true })) };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
});

describe('the unrecorded-cancellation flag says what its cancel released', () => {
  it('a cancel that released the reservation records that, and which', async () => {
    load([ticketed(null)]);
    cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });

    const flag = await cancelUnrecorded();

    expect(flag).toMatchObject({ unrecorded: true, amadeusCancelled: true, pnr: 'HELD99' });
  });

  it('a cancel with no reservation to release records that, and names none', async () => {
    load([commitUnknown()]);

    const flag = await cancelUnrecorded();

    expect(cancelFlightOrder).not.toHaveBeenCalled();
    expect(flag).toMatchObject({ unrecorded: true, amadeusCancelled: false });
    expect(flag.reason).toMatch(/no airline reservation/);
    expect(flag).not.toHaveProperty('pnr');
  });
});

describe('a reservation the unrecorded cancel did not release, given Cancelled by hand', () => {
  it('the finding end to end: a commit that never answered, cancelled unrecorded, then recorded held by the desk - refused', async () => {
    load([commitUnknown()]);
    await cancelUnrecorded();
    const server = await app();

    const held = await request(server).post(`/api/flights/admin-bookings/bk-1/resolve-review${shownQueryOf(table.row(REF))}`)
      .send({ note: 'The airline holds it', outcome: 'held', pnr: 'NEWPNR' });
    expect(held.status).toBe(200);
    const booking = table.row(REF);
    expect(booking.booking_details.pnr).toBe('NEWPNR');
    expect(booking.booking_details.needs_review.reason).toBe(UNTICKETED_REVIEW_REASON);

    const res = await request(server).put('/api/flights/admin-bookings/bk-1').send({ status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(table.row(REF).status).toBe('pending_ticketing');
    expect(allowedStatuses(asPanel(table.row(REF)))).not.toContain('cancelled');
  });

  it.each([
    ['a flag stored before, read by its text', unrecorded({ reason: NOT_RELEASED_TEXT, ticketsVoided: false })],
    ['a flag that released another reservation', unrecorded({ amadeusCancelled: true, pnr: 'OTHER1' })],
    ['a released reservation later recorded held', {
      reason: UNTICKETED_REVIEW_REASON, ticketed: false, at: '2026-09-22T09:00:00Z', previous: unrecorded({ amadeusCancelled: true, pnr: 'HELD99' }),
    }],
    ['a released reservation whose later cancel the airline refused, not yet looked at', {
      reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T09:00:00Z',
      previous: unrecorded({ amadeusCancelled: true, pnr: 'HELD99' }),
    }],
    ['a released reservation under a refused cancel of another one, marked handled', {
      reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'OTHER1', at: '2026-09-22T09:00:00Z', ...RESOLVED,
      previous: unrecorded({ amadeusCancelled: true, pnr: 'HELD99' }),
    }],
  ])('is refused (%s): Use Cancel & Refund', async (_label, needsReview) => {
    load([ticketed(needsReview)]);

    const res = await handCancel();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(table.row(REF).status).toBe('confirmed');
    expect(allowedStatuses(asPanel(ticketed(needsReview)))).not.toContain('cancelled');
  });
});

// Fences: the case the exemption is for still reads as it did.
describe('next to it', () => {
  it('end to end: the reservation the cancel released, recorded cancelled by hand - allowed', async () => {
    load([ticketed(null)]);
    cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });
    await cancelUnrecorded();

    const res = await handCancel();

    expect(res.status).toBe(200);
    expect(table.row(REF).status).toBe('cancelled');
  });

  it.each([
    ['a flag stored before, read by its text', unrecorded()],
    ['a flag naming it', unrecorded({ amadeusCancelled: true, pnr: 'HELD99' })],
    ['marked handled', unrecorded({ amadeusCancelled: true, pnr: 'HELD99', ...RESOLVED })],
    ['under a later refused cancel of it, marked handled', {
      reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T09:00:00Z', ...RESOLVED,
      previous: unrecorded({ amadeusCancelled: true, pnr: 'HELD99' }),
    }],
  ])('the reservation it released (%s) - allowed', async (_label, needsReview) => {
    load([ticketed(needsReview)]);

    const res = await handCancel();

    expect(res.status).toBe(200);
    expect(table.row(REF).status).toBe('cancelled');
  });
});
