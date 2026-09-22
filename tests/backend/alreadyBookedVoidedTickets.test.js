import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A reload of the order page after a cancel voided the booking's tickets and
 * the airline then refused PNR_Cancel. The row stays confirmed and paid, with
 * gds.ticketed and its ticket list as they were; the voided numbers are on
 * booking_details.voided_tickets and on the refused cancel's flag.
 *
 * The order route's ALREADY_BOOKED answer read the list alone: ticketed:true,
 * with the void numbers as its tickets, and the order page said the booking
 * was confirmed and its ticket issued. The answer now leaves the voided
 * tickets out (voidedTicketsOf), is ticketed only on a live one, and names the
 * voided numbers, as the booking reads (toClientBooking) do.
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

const REF = 'FLTHELD1';
const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];

// A paid PNR held for review after its ticket failed to issue.
const heldPnr = (over = {}, details = {}) => ({
  id: 'bk-held1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    pnr: 'HELD99',
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    gds: { ticketed: false },
    tickets: [],
    gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
    confirmation_email: { state: 'sent' },
    needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-21T08:01:00Z' },
    ...details,
  },
});

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
  // As in production: booking is switched off, and this answer comes first.
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

const A = '220-1111111111';
const B = '220-2222222222';
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const refusedFlag = (voided) => ({
  reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99',
  voided_tickets: voided, unvoided_tickets: [], at: '2026-09-22T08:01:00Z',
});
// A ticketed booking, as the success path leaves it.
const ticketedRow = (details = {}) => heldPnr({ status: 'confirmed' }, {
  gds: { ticketed: true },
  tickets: [{ number: A, travelerId: '1' }],
  needs_review: undefined,
  ...details,
});

describe('a reload of the order page after a cancel voided every ticket and the airline refused PNR_Cancel', () => {
  it('is not ticketed, lists no void number as a ticket, and names the voided ones', async () => {
    const res = await retry(ticketedRow({ voided_tickets: [A], needs_review: refusedFlag([A]) }));

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.ticketed).toBe(false);
    expect(res.body.tickets).toEqual([]);
    expect(res.body.voided_tickets).toEqual([A]);
    expect(res.body.data.status).toBe('PENDING_TICKETING');
    expect(res.body.message).not.toMatch(/not been issued yet/);
  });

  it('recorded on the refused cancel\'s flag alone, under a later flag: the same', async () => {
    const res = await retry(ticketedRow({
      needs_review: { reason: 'later', at: '2026-09-22T09:00:00Z', previous: refusedFlag([A]) },
    }));

    expect(res.body.ticketed).toBe(false);
    expect(res.body.tickets).toEqual([]);
    expect(res.body.voided_tickets).toEqual([A]);
  });
});

describe('the answers next to it', () => {
  it('one ticket of two voided: still ticketed, on the live one, with the voided one named', async () => {
    const res = await retry(ticketedRow({
      tickets: [{ number: A, travelerId: '1' }, { number: B, travelerId: '2' }],
      voided_tickets: [A],
      needs_review: refusedFlag([A]),
    }));

    expect(res.body.ticketed).toBe(true);
    expect(res.body.tickets).toEqual([{ number: B, travelerId: '2' }]);
    expect(res.body.voided_tickets).toEqual([A]);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('a ticketed booking nobody cancelled: the same tickets, ticketed, as before', async () => {
    const res = await retry(ticketedRow());

    expect(res.body).toMatchObject({
      mode: 'ALREADY_BOOKED', ticketed: true, tickets: [{ number: A, travelerId: '1' }], voided_tickets: [],
      message: 'This booking already exists', data: { status: 'CONFIRMED' }, paymentState: 'held',
    });
  });

  it('issued with its numbers not read back: ticketed, as before', async () => {
    const res = await retry(ticketedRow({
      tickets: [],
      needs_review: { reason: 'ticket_numbers_not_retrieved', ticketed: true, at: '2026-09-21T08:01:00Z' },
    }));

    expect(res.body).toMatchObject({ ticketed: true, tickets: [], voided_tickets: [], data: { status: 'CONFIRMED' } });
  });

  it('a held PNR with no ticket: unchanged', async () => {
    const res = await retry(heldPnr());

    expect(res.body).toMatchObject({
      ticketed: false, tickets: [], voided_tickets: [],
      message: 'This booking already exists; its ticket has not been issued yet',
    });
  });

  it('a voided booking refunded since still carries its payment record', async () => {
    const res = await retry({ ...ticketedRow({ voided_tickets: [A], needs_review: refusedFlag([A]) }), payment_status: 'refunded' });

    expect(res.body.paymentState).toBe('returned');
    expect(res.body.ticketed).toBe(false);
  });
});
