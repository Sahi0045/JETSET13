import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { allowedStatuses } from '../../shared/bookingStatusChange.js';
import { unrecordedCancellationForCustomerOf } from '../../shared/reviewQueue.js';
import { attentionMessage, needsManualRefund, refundStatus } from '../../frontend/src/utils/bookingStatus.js';

/**
 * Recording, by hand, a cancel the airline and the gateway already carried out.
 *
 * A cancel that went through and could not be recorded
 * (flagUnrecordedCancellation) leaves the booking confirmed, paid and ticketed,
 * with a flag saying the reservation was released and the money moved. The
 * customer reads "our record of it is still being updated" until the booking
 * is recorded cancelled (unrecordedCancellationForCustomerOf) - and nothing
 * could record it: Modify Status refused `cancelled` for a flight with a PNR
 * or a held payment (statusChangeRefusal: "Use Cancel & Refund"), and Cancel &
 * Refund has nothing left to cancel. Finish refund (settleManualFlightRefund)
 * runs only on a cancelled booking. So after "Mark as handled" the booking
 * stayed confirmed for good, and the customer's sentence had no end.
 *
 * Modify Status now takes `cancelled` while that flag is in force: staff record
 * what the airline already did. Nothing else about a status change loosens.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
    admin: (_req, _res, next) => next(),
  };
});

const REF = 'FLTHELD1';
const A = '220-1111111111';
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const RESOLVED = { resolved_at: '2026-09-22T10:00:00Z', resolved_by: 'desk@example.com', resolution: 'called the customer' };
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

// flagUnrecordedCancellation's flag, as the cancel handler writes it.
const unrecorded = (over = {}) => ({
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
    + 'check the airline and ARC Pay and record it by hand',
  source: 'cancellation', unrecorded: true, ticketsVoided: true, at: '2026-09-22T08:03:00Z', paymentAction: 'VOID', refundAmount: 291,
  ...over,
});

// A ticketed booking as the cancel left it: its claim expired, the row otherwise untouched.
const row = (details = {}, over = {}) => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  ...over,
  booking_details: {
    pnr: 'HELD99',
    order_id: REF,
    gds: { ticketed: true },
    tickets: [{ number: A, travelerId: '1' }],
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

const statusWrites = () => table.writes.filter((w) => w.patch.status !== undefined);

/** As Modify Status reads the booking (shared/bookingStatusChange.js). */
const asPanel = (booking) => ({
  type: booking.travel_type, status: booking.status, paymentStatus: booking.payment_status, details: booking.booking_details,
});

beforeEach(() => {
  vi.resetModules();
});

describe('an unrecorded cancel, recorded cancelled by hand', () => {
  it.each([
    ['still on the desk', () => row({ needs_review: unrecorded() })],
    ['marked handled', () => row({ needs_review: unrecorded(RESOLVED) })],
    ['under a later refused cancel, marked handled', () => row({
      needs_review: { reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T09:00:00Z', ...RESOLVED, previous: unrecorded() },
    })],
  ])('is allowed (%s), and the customer then reads a cancellation whose refund is being finished', async (_label, make) => {
    const before = make();
    const res = await put([structuredClone(before)], { status: 'cancelled' });

    expect(res.status).toBe(200);
    const recorded = table.row(REF);
    expect(recorded.status).toBe('cancelled');
    // Nothing else was written: the flag and the payment stay as they were.
    expect(recorded.payment_status).toBe('paid');
    expect(recorded.booking_details).toEqual(before.booking_details);

    // The sentence with no end is over; Finish refund is offered, which asks
    // the gateway what the cancel did with the money.
    expect(unrecordedCancellationForCustomerOf(recorded)).toBeNull();
    expect(attentionMessage(recorded)).not.toMatch(/still being updated/);
    expect(refundStatus(recorded)?.key).toBe('pending');
    expect(needsManualRefund(recorded)).toBe(true);
  });

  it('Modify Status offers it, and nothing else it did not offer before', () => {
    const flagged = asPanel(row({ needs_review: unrecorded(RESOLVED) }));
    const plain = asPanel(row());

    expect(allowedStatuses(flagged)).toEqual([...allowedStatuses(plain), 'cancelled']);
  });
});

// Fences: every refusal next to it stands.
describe('next to it', () => {
  it('a ticketed booking nobody cancelled: refused, Use Cancel & Refund', async () => {
    const res = await put([row()], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(statusWrites()).toEqual([]);
  });

  it('a cancel the airline refused: refused, the reservation is live', async () => {
    const res = await put([row({ needs_review: { reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T09:00:00Z' } })], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(statusWrites()).toEqual([]);
  });

  it('an unrecorded cancel still holding its claim: waits, as any busy booking', async () => {
    const res = await put([row({
      needs_review: unrecorded(),
      gds_chain: { state: 'cancelling', startedAt: new Date().toISOString(), stateBeforeCancel: 'finished' },
    })], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_BUSY');
    expect(statusWrites()).toEqual([]);
  });

  it('an unrecorded cancel given any other status: refused as before', async () => {
    const res = await put([row({ needs_review: unrecorded(RESOLVED) })], { status: 'pending' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HAS_RESERVATION');
    expect(statusWrites()).toEqual([]);
  });

  it('once recorded cancelled: cannot be reopened', async () => {
    const res = await put([row({ needs_review: unrecorded(RESOLVED) }, { status: 'cancelled' })], { status: 'confirmed' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CANCELLED');
    expect(statusWrites()).toEqual([]);
  });
});
