import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';
import { COMMIT_UNKNOWN_REVIEW_REASON, attentionOf } from '../../shared/reviewQueue.js';

/**
 * "The airline holds it", recorded on a commit that never answered whose
 * payment a cancel already returned.
 *
 * recordHeldAtAirline refused a booking recorded cancelled or refunded ("cancel
 * that reservation with the airline, then record it as not held"), and read
 * nothing else. Cancel & Refund on a commit that never answered has no
 * reservation to release and VOIDs the whole payment; when its record write
 * fails, the row still reads pending and paid, under "Cancelled, but not
 * recorded", and the dialog still offers "held". The press was accepted: the
 * booking became a paid reservation waiting to be ticketed, the customer was
 * emailed a booking confirmation, and Slack said the customer had paid and
 * asked staff to ticket it - against a payment ARC Pay had voided.
 *
 * "Held" is now refused once any cancel has run on the booking: recorded (its
 * cancellation record) or carried out and not recorded (the unrecorded flag),
 * and on a payment voided as well as refunded or reversed. The real cancel,
 * desk list and resolve-review.
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

const REF = 'FLTHOV1';
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

const captured = {
  status: 200,
  data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
};

// A paid booking whose airline commit never answered: no PNR.
const commitUnknown = (over = {}) => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-22T08:00:00Z',
  ...over,
  booking_details: {
    order_id: REF,
    customer_email: 'traveler@example.com',
    gds_chain: { state: 'in_progress', startedAt: HOUR_AGO() },
    needs_review: { reason: COMMIT_UNKNOWN_REVIEW_REASON, ticketed: false, at: '2026-09-22T08:01:00Z' },
    ...over.booking_details,
  },
});

let mailer;

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

/** Cancel & Refund from the desk, whose record write fails. */
const cancelUnrecorded = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  failCancelWrite = true;
  await handleCancelBookingAction(createRequest({
    method: 'POST', body: { bookingReference: REF, reason: 'Cancelled by the support desk' }, user: { id: 'staff-1', role: 'support' },
  }), res);
  failCancelWrite = false;
  // Its claim ages out, as on every booking the desk picks up.
  table.row(REF).booking_details.gds_chain.startedAt = HOUR_AGO();
  return res;
};

const held = async (server) => request(server).post(`/api/flights/admin-bookings/bk-1/resolve-review${await shownQueryFor('bk-1')}`)
  .send({ note: 'Rang the airline: it holds the booking under ABC123.', outcome: 'held', pnr: 'ABC123' });

const snapshot = (row) => JSON.parse(JSON.stringify(row));

beforeEach(() => {
  vi.resetModules();
  failCancelWrite = false;
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(captured);
  mailer = {
    sendBookingNotificationEmails: vi.fn(async () => ({ success: true })),
    sendEmail: vi.fn(),
    sendCancellationNotificationEmails: vi.fn(async () => ({ success: true })),
  };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
});

describe('held, over a cancel that voided the payment and was not recorded', () => {
  it('is refused, as it is for the same cancel recorded: nothing written, nobody emailed', async () => {
    load([commitUnknown()]);

    // Desk: Cancel & Refund. No PNR, so no airline call; ARC VOIDs 291; the record write fails.
    const cancel = await cancelUnrecorded();
    expect(cancel.statusCode).toBe(500);
    expect(axios.put.mock.calls.filter(([, body]) => body?.apiOperation === 'VOID')).toHaveLength(1);

    // The desk still reads it pending and paid, and still asks what the airline said.
    const server = await app();
    const list = await request(server).get('/api/flights/admin-bookings-all?attention=open');
    const card = list.body.data.find((row) => row.bookingReference === REF);
    expect(card).toMatchObject({ status: 'pending', paymentStatus: 'paid', commitUnknown: true, attention: { kind: 'unrecorded_cancellation' } });

    const before = snapshot(table.row(REF));
    mailer.sendBookingNotificationEmails.mockClear();
    const res = await held(server);

    expect(res.status, 'a paid reservation to ticket, over a payment ARC Pay voided').toBe(409);
    expect(res.body.code).toBe('HELD_NOT_ALLOWED');
    expect(res.body.error).toBe('A cancellation has already been carried out on this booking (it recorded payment VOID 291 USD), '
      + 'so it cannot be recorded as held: its payment may no longer be held. If the airline holds a reservation for it, '
      + 'cancel that reservation with the airline, then record it as not held with what you did.');
    expect(table.row(REF)).toEqual(before);
    expect(mailer.sendBookingNotificationEmails).not.toHaveBeenCalled();

    // "Not held" is still what the desk can record.
    const notHeld = await request(server).post(`/api/flights/admin-bookings/bk-1/resolve-review${await shownQueryFor('bk-1')}`)
      .send({ note: 'Cancelled the reservation with the airline by phone.', outcome: 'not_held' });
    expect(notHeld.status).toBe(200);
    expect(table.row(REF).booking_details.needs_review.outcome).toBe('not_held');
  });
});

describe('held, beside other records that the money went back', () => {
  it.each([
    ['a cancellation record', { booking_details: { cancellation: { cancelledAt: '2026-09-22T09:00:00Z', paymentAction: 'VOID', refundAmount: 291, currency: 'USD' } } }],
    ['a payment voided', { payment_status: 'voided' }],
    ['a payment reversed', { payment_status: 'reversed' }],
    ['a payment refunded', { payment_status: 'refunded' }],
    ['a booking cancelled', { status: 'cancelled' }],
  ])('%s: refused, nothing written', async (_label, over) => {
    load([commitUnknown(over)]);
    const before = snapshot(table.row(REF));

    const res = await held(await app());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HELD_NOT_ALLOWED');
    expect(table.row(REF)).toEqual(before);
    expect(mailer.sendBookingNotificationEmails).not.toHaveBeenCalled();
  });
});

// Fence: a commit nothing has cancelled is recorded held, as before.
describe('held, on a commit that never answered and nothing cancelled', () => {
  it('goes on the booking under its record locator, and waits to be ticketed', async () => {
    load([commitUnknown()]);

    const res = await held(await app());

    expect(res.status).toBe(200);
    const row = table.row(REF);
    expect(row).toMatchObject({ status: 'pending_ticketing', payment_status: 'paid' });
    expect(row.booking_details.pnr).toBe('ABC123');
    expect(attentionOf(row)).toMatchObject({ kind: 'review', reason: 'PNR committed, never ticketed' });
  });
});
