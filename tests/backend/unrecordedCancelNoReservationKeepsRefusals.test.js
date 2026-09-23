import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { allowedStatuses } from '../../shared/bookingStatusChange.js';
import { cancelledWithNothingTaken } from '../../backend/routes/payment/operations.handlers.js';

/**
 * An unrecorded cancel of a booking with NO airline reservation may not be
 * recorded cancelled by hand while it holds money or opened a payment page.
 *
 * Modify Status takes `cancelled` on an unrecorded cancel so staff can record
 * a reservation the cancel already released (unrecordedCancelRecordedByHand).
 * The exemption ran before every refusal, so it also skipped the two that
 * guard a booking with no reservation:
 *
 *  - a checkout whose payment page is still open. ARC had no order, the cancel
 *    found NOTHING_TO_REFUND and could not write it down. Hand-cancelled, the
 *    row had no cancellation record, so a payment on that page was answered a
 *    plain BOOKING_CANCELLED, skipped by the abandoned-checkout job and matched
 *    by neither alarm - money held, nobody told;
 *  - a payment still held (ARC refused the refund). Hand-cancelled, it left the
 *    payment alarm, and the desk once the flag was marked handled.
 *
 * With no reservation nothing needs the exemption: Cancel & Refund works
 * again, asks ARC first, and writes the record every late-payment net reads.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
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

const REF = 'FLTOPEN9';
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const RESOLVED = { resolved_at: '2026-09-22T10:00:00Z', resolved_by: 'desk@example.com', resolution: 'called the customer' };

// flagUnrecordedCancellation's flag on a booking with no reservation.
const unrecorded = (paymentAction, over = {}) => ({
  reason: `cancellation carried out but not recorded: no airline reservation, payment ${paymentAction} 0 USD; `
    + 'check the airline and ARC Pay and record it by hand',
  source: 'cancellation', unrecorded: true, ticketsVoided: false, at: '2026-09-22T08:03:00Z', paymentAction, refundAmount: 0,
  ...over,
});

// A checkout whose ARC payment page was opened and never came back.
const openCheckout = (details = {}, over = {}) => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'unpaid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-22T08:00:00Z',
  ...over,
  booking_details: {
    order_id: REF,
    customer_email: 'traveler@example.com',
    success_indicator: `SI-${REF}`,
    session_id: 'SESSION9',
    arc_pay_checkout_url: 'https://arc.test/checkout/pay/SESSION9',
    ...details,
  },
});

// Paid, the airline never reached, ARC refused the cancel's refund.
const paidNoReservation = (details = {}) => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { order_id: REF, ...details },
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

const put = async (rows, body) => {
  table = fakeBookingsTable(rows);
  return request(await app()).put('/api/flights/admin-bookings/bk-1').send(body);
};

const statusWrites = () => table.writes.filter((w) => w.patch.status !== undefined);

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
  axios.get.mockReset();
});

afterEach(() => {
  failCancelWrite = false;
});

describe('an unrecorded cancel with no airline reservation, given Cancelled by hand', () => {
  it.each([
    ['on the desk', unrecorded('NOTHING_TO_REFUND')],
    ['marked handled', unrecorded('NOTHING_TO_REFUND', RESOLVED)],
  ])('is refused while its payment page may have been paid (%s): Use Cancel & Refund', async (_label, flag) => {
    const booking = openCheckout({ needs_review: flag });

    const res = await put([booking], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(res.body.error).toMatch(/payment page was opened/);
    expect(statusWrites()).toEqual([]);
    expect(allowedStatuses(asPanel(booking))).not.toContain('cancelled');
  });

  it.each([
    ['on the desk', unrecorded('REFUND_FAILED')],
    ['marked handled', unrecorded('REFUND_FAILED', RESOLVED)],
  ])('is refused while it holds a payment (%s): Use Cancel & Refund', async (_label, flag) => {
    const booking = paidNoReservation({ needs_review: flag });

    const res = await put([booking], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(res.body.error).toMatch(/holds a payment/);
    expect(statusWrites()).toEqual([]);
    expect(allowedStatuses(asPanel(booking))).not.toContain('cancelled');
  });

  it('the finding end to end: the cancel of an open checkout goes unrecorded, the hand-cancel is refused, '
    + 'and Cancel & Refund again writes the record a late payment is caught by', async () => {
    table = fakeBookingsTable([openCheckout()], {
      tables: { price_settings: [], payments: [] },
      // The cancel's own record write fails: "carried out but not recorded".
      fail: ({ patch }) => failCancelWrite && patch?.status === 'cancelled',
    });
    const server = await app();
    const cancelAndRefund = async () => {
      const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
      const res = createResponse();
      await handleCancelBookingAction(createRequest({
        method: 'POST', body: { bookingReference: REF, reason: 'Cancelled by the support desk' }, user: { id: 'staff-1', role: 'support' },
      }), res);
      return res;
    };
    // ARC has no order yet: the page was opened and not paid.
    axios.get.mockResolvedValue({ status: 404, data: { error: { cause: 'INVALID_REQUEST' } } });

    failCancelWrite = true;
    const first = await cancelAndRefund();
    failCancelWrite = false;
    expect(first.statusCode).toBe(500);
    expect(first.body.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    expect(table.row(REF).booking_details.needs_review).toMatchObject({ source: 'cancellation', unrecorded: true });
    // Its claim ages out, as on every booking the desk picks up.
    table.row(REF).booking_details.gds_chain.startedAt = HOUR_AGO();

    const hand = await request(server).put('/api/flights/admin-bookings/bk-1').send({ status: 'cancelled' });
    expect(hand.status).toBe(409);
    expect(hand.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(table.row(REF).status).toBe('pending');

    const again = await cancelAndRefund();
    expect(again.statusCode).toBe(200);
    const row = table.row(REF);
    expect(row.status).toBe('cancelled');
    expect(row.booking_details.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    // What the order route, recordPaymentAfterCancel and the abandoned-checkout
    // job read to catch a payment made on the still-open page.
    expect(cancelledWithNothingTaken(row)).toBe(true);
  });
});

// Fences: the neighbouring states read as they did.
describe('next to it', () => {
  it('an unrecorded cancel of a checkout that never opened a payment page and holds nothing: allowed, as without the flag', async () => {
    const plain = { id: 'bk-1', booking_reference: REF, travel_type: 'flight', status: 'pending', payment_status: 'unpaid', booking_details: { order_id: REF } };
    const flagged = { ...plain, booking_details: { ...plain.booking_details, needs_review: unrecorded('NOTHING_TO_REFUND') } };

    const res = await put([flagged], { status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(table.row(REF).status).toBe('cancelled');
    expect(allowedStatuses(asPanel(flagged))).toEqual(allowedStatuses(asPanel(plain)));
  });

  it('an unrecorded cancel that released the reservation: still allowed, the one case the exemption is for', async () => {
    const res = await put([{
      id: 'bk-1', booking_reference: REF, travel_type: 'flight', status: 'confirmed', payment_status: 'paid', total_amount: 291,
      booking_details: {
        pnr: 'HELD99', order_id: REF, gds: { ticketed: true }, tickets: [{ number: '220-1111111111' }],
        gds_chain: { state: 'cancelling', startedAt: HOUR_AGO(), stateBeforeCancel: 'finished' },
        needs_review: {
          ...unrecorded('VOID', { ticketsVoided: true, refundAmount: 291 }),
          reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
            + 'check the airline and ARC Pay and record it by hand',
        },
      },
    }], { status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(table.row(REF).status).toBe('cancelled');
  });
});
