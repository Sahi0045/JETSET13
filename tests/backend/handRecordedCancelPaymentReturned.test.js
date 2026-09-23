import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionMessage, refundStatus } from '../../frontend/src/utils/bookingStatus.js';

/**
 * A cancel that went through and could not be recorded, then recorded
 * cancelled by hand (Modify Status, allowed for it by
 * shared/bookingStatusChange.js unrecordedCancellationReleasing).
 *
 * The flag says what the cancel did with the money: "payment VOID 291 USD"
 * (paymentAction 'VOID', refundAmount 291) - the money went back. The hand
 * cancel writes `status` only: payment_status stays 'paid' and there is no
 * cancellation record. So every customer page read refundStatus from
 * payment_status: "Refund pending", "This booking is cancelled, but no refund
 * has been recorded for it yet", and Manage Booking's tracker "Not refunded
 * yet" - of 291 USD that went back. Both booking reads now send what the flag
 * says the cancel did as the booking's cancellation record
 * (cancellationRecordedByHandOf), and the pages word it as they word any
 * cancellation.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
    admin: (_req, _res, next) => next(),
    bookingStaff: (_req, _res, next) => next(),
  };
});

const REF = 'FLTHELD1';
const A = '220-1111111111';
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const RESOLVED = { resolved_at: '2026-09-22T10:00:00Z', resolved_by: 'desk@example.com', resolution: 'checked ARC: voided' };

// flagUnrecordedCancellation's flag, as the cancel handler writes it: the
// reservation released and the payment VOIDED.
const unrecorded = (over = {}) => ({
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
    + 'check the airline and ARC Pay and record it by hand',
  source: 'cancellation', unrecorded: true, amadeusCancelled: true, pnr: 'HELD99', ticketsVoided: true,
  at: '2026-09-22T08:03:00Z', paymentAction: 'VOID', refundAmount: 291,
  ...over,
});

const row = (details = {}, over = {}) => ({
  id: 'bk-1', booking_reference: REF, travel_type: 'flight', status: 'confirmed', payment_status: 'paid', total_amount: 291,
  user_id: 'user-1', created_at: new Date().toISOString(), ...over,
  booking_details: {
    pnr: 'HELD99', order_id: REF, departure_date: '2099-11-15', gds: { ticketed: true }, tickets: [{ number: A, travelerId: '1' }],
    gds_chain: { state: 'cancelling', startedAt: HOUR_AGO(), stateBeforeCancel: 'finished' },
    ...details,
  },
});

let table = null;
const put = async (rows, body) => {
  table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return request(app).put('/api/flights/admin-bookings/bk-1').send(body);
};

/** The booking as both booking reads send it. */
const sent = async (booking) => (await import('../../backend/routes/flight.routes.js')).toClientBooking(booking);

beforeEach(() => vi.resetModules());

describe('an unrecorded cancel whose money went back, recorded cancelled by hand', () => {
  it.each([
    ['flag still open', unrecorded()],
    ['flag marked handled', unrecorded(RESOLVED)],
  ])('says the payment was refunded, not that it is pending (%s)', async (_label, flag) => {
    const res = await put([row({ needs_review: flag })], { status: 'cancelled' });
    expect(res.status).toBe(200);

    const booking = await sent(table.row(REF));

    expect(booking.status).toBe('cancelled');
    expect(booking.cancellation).toMatchObject({ paymentAction: 'VOID', refundAmount: 291, recordedByHand: true });
    expect(refundStatus(booking)).toEqual({ key: 'refunded', label: 'Refunded $291.00', tone: 'success' });
    expect(attentionMessage(booking)).toBeNull();
  });

  it.each([
    ['FULL_REFUND', 291, 'Refunded $291.00'],
    ['PARTIAL_REFUND', 200, 'Refunded $200.00'],
  ])('a %s: says what went back', async (paymentAction, refundAmount, label) => {
    const booking = await sent(row({ needs_review: unrecorded({ paymentAction, refundAmount }) }, { status: 'cancelled' }));

    expect(refundStatus(booking)).toMatchObject({ key: 'refunded', label });
  });
});

describe('what stays as it was', () => {
  it('a cancel whose refund failed: says nothing went back, not that it is pending', async () => {
    const booking = await sent(row({ needs_review: unrecorded({ paymentAction: 'REFUND_FAILED', refundAmount: 0 }) }, { status: 'cancelled' }));

    expect(refundStatus(booking).key).toBe('failed');
    expect(attentionMessage(booking)).toMatch(/nothing has been returned to your card yet/);
  });

  it('a cancel whose refund failed, refunded since: the payment record is read first', async () => {
    for (const [paymentStatus, label] of [['refunded', 'Refunded'], ['partially_refunded', 'Partly refunded']]) {
      const booking = await sent(row({ needs_review: unrecorded({ paymentAction: 'REFUND_FAILED', refundAmount: 0 }) },
        { status: 'cancelled', payment_status: paymentStatus }));

      expect(refundStatus(booking)).toMatchObject({ key: 'refunded', label });
    }
  });

  it('a booking with its own cancellation record: that record, not the flag', async () => {
    const own = { paymentAction: 'FULL_REFUND', refundAmount: 250, cancelledAt: '2026-09-22T12:00:00Z' };
    const booking = await sent(row({ needs_review: unrecorded(), cancellation: own }, { status: 'cancelled', payment_status: 'refunded' }));

    expect(booking.cancellation).toEqual(own);
    expect(refundStatus(booking).label).toBe('Refunded $250.00');
  });

  it('a flag that does not say what the cancel did with the money: as before', async () => {
    const booking = await sent(row({ needs_review: unrecorded({ paymentAction: undefined, refundAmount: undefined }) }, { status: 'cancelled' }));

    expect(booking.cancellation).toBeNull();
    expect(refundStatus(booking).key).toBe('pending');
  });

  it('not yet recorded cancelled: no cancellation record, and the unrecorded state is sent', async () => {
    const booking = await sent(row({ needs_review: unrecorded() }));

    expect(booking.cancellation).toBeNull();
    expect(booking.needs_review.unrecorded_cancellation).toBe(true);
    expect(refundStatus(booking)).toBeNull();
    expect(attentionMessage(booking)).toMatch(/Our team will confirm what happened to your payment/);
  });

  it('a cancelled booking that carries no such flag: as before', async () => {
    const booking = await sent(row({}, { status: 'cancelled' }));

    expect(booking.cancellation).toBeNull();
    expect(refundStatus(booking).key).toBe('pending');
  });
});
