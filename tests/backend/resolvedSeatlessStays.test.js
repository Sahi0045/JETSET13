import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A PNR the airline confirmed no seat on, whose flag a person resolved.
 *
 * Round 4 read the no-seat flag through the walker, which stops at a resolved
 * flag, so resolving it - or the refused cancel on top of it - settled the
 * customer's pages: "Reservation Held - Your seats are reserved", a PDF saying
 * the seat is held, and a reload of the order page answered ALREADY_BOOKED
 * ("Your seats are reserved"). Resolving records that a person dealt with it,
 * not that the airline gave a seat: a person who called the customer and
 * pressed "Mark as handled" with the seat still waitlisted did exactly that.
 * The booking reads not confirmed until it records a ticket.
 */

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

const REF = 'FLTSEAT7';
const SEATLESS = 'chain failed after commit at segmentStatus';
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const RESOLVED = { resolved_at: '2026-09-22T09:00:00Z', resolved_by: 'staff@example.com', resolution: 'called the customer' };
const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];

const seatlessRow = (needsReview, details = {}) => ({
  id: 'bk-seat7',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  booking_details: {
    pnr: 'SEAT77',
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    gds: { ticketed: false },
    tickets: [],
    gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
    needs_review: needsReview,
    ...details,
  },
});
const seatless = (extra = {}) => ({ reason: SEATLESS, ticketed: false, at: '2026-09-21T08:01:00Z', ...extra });
const refusedOn = (previous, extra = {}) => ({ reason: REFUSED, source: 'cancellation', cancelFailed: true, at: '2026-09-21T09:00:00Z', previous, ...extra });

const noConfirmedSeat = async (row) => {
  const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
  return toClientBooking(row).needs_review.no_confirmed_seat;
};

const createFlightOrder = vi.fn();

const retry = async (row) => {
  table = fakeBookingsTable([row]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return request(app).post('/api/flights/order').send({
    bookingReference: REF, orderId: REF, transactionId: `SI-${REF}`, contactInfo: { email: 'jane@example.com' }, travelers: JANE,
  });
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
  vi.resetModules();
  createFlightOrder.mockReset();
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { createFlightOrder },
    providerStatus: () => ({ bookingEnabled: false }),
  }));
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.doUnmock('../../backend/services/emailService.js');
  vi.unstubAllEnvs();
});

describe('a no-seat flag a person resolved, with no ticket on the booking', () => {
  it('still tells the pages the seat is not confirmed: the flag resolved on top', async () => {
    expect(await noConfirmedSeat(seatlessRow(seatless(RESOLVED)))).toBe(true);
  });

  it('still tells the pages the seat is not confirmed: under a refused cancel a person resolved', async () => {
    expect(await noConfirmedSeat(seatlessRow(refusedOn(seatless(), RESOLVED)))).toBe(true);
  });

  it('a reload of the order page is refused as under review, not answered "already booked"', async () => {
    const res = await retry(seatlessRow(seatless(RESOLVED)));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_NEEDS_REVIEW');
    expect(res.body.mode).toBeUndefined();
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  // The one record that settles it is a ticket, flag resolved or not: a reload
  // of a booking staff ticketed by hand was refused as "under review" while
  // every page already said it was ticketed.
  it('once the booking records a ticket it reads ticketed, flag resolved or not', async () => {
    const ticketed = seatlessRow(seatless(), { gds: { ticketed: true }, tickets: [{ number: '220-7491174926' }] });
    ticketed.status = 'confirmed';

    expect(await noConfirmedSeat(ticketed)).toBe(false);
    const res = await retry(ticketed);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'ALREADY_BOOKED', ticketed: true });
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });
});

// Fence: the bookings next to it keep today's answers.
describe('the bookings next to it', () => {
  it('the flag not resolved: not confirmed, and refused as under review', async () => {
    expect(await noConfirmedSeat(seatlessRow(seatless()))).toBe(true);
    expect(await noConfirmedSeat(seatlessRow(refusedOn(seatless())))).toBe(true);
    const res = await retry(seatlessRow(seatless()));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_NEEDS_REVIEW');
  });

  it('a booking that never had the flag: not claimed', async () => {
    expect(await noConfirmedSeat(seatlessRow({ reason: 'chain failed after commit at issueTicket', ticketed: false, ...RESOLVED }))).toBe(false);
  });

  it('a resolved held PNR that never had the flag: a reload is still answered ALREADY_BOOKED', async () => {
    const res = await retry(seatlessRow({ reason: 'chain failed after commit at issueTicket', ticketed: false, ...RESOLVED }));

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
  });

  it('a no-seat flag on a booking that has since recorded a ticket: not claimed, and a reload is ALREADY_BOOKED', async () => {
    const ticketed = seatlessRow(seatless(RESOLVED), { gds: { ticketed: true }, tickets: [{ number: '220-7491174926' }] });
    ticketed.status = 'confirmed';

    expect(await noConfirmedSeat(ticketed)).toBe(false);
    const res = await retry(ticketed);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'ALREADY_BOOKED', ticketed: true });
  });
});
