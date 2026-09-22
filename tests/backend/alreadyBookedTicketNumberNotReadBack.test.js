import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { liveTicketNumbersMissingOf } from '../../shared/reviewQueue.js';
import { ticketState } from '../../frontend/src/utils/eTicket.js';

/**
 * A reload of the order page for two travellers whose ticket numbers were not
 * all read back, after a same-day cancel voided one ticket and not the other.
 *
 * The chain issued two tickets and read back one number (A); its flag says two
 * were expected (ticket_numbers_not_retrieved). A cancel voided A, the void of
 * B was refused, and the itinerary was left live. B is a live ticket, and every
 * booking read says so (ticket_numbers_missing, ticketState 'pending').
 *
 * The ALREADY_BOOKED answer was ticketed only on a ticket number once any was
 * voided. With A voided and B's number never read, it answered ticketed:false,
 * "its ticket has been voided", and both the order page and the confirmation
 * page said "Ticket Voided - not valid for travel" of a booking with a live
 * ticket. A ticket whose number was not read back is issued until the voids
 * cover it (liveTicketNumbersMissingOf), as the booking reads count it.
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

// The chain's flag: issued, `got` of `expected` numbers read back.
const numbersMissing = (expected, got) => ({
  reason: 'ticket_numbers_not_retrieved', ticketed: true, expected, got, at: '2026-09-21T08:01:00Z',
});
// The refused cancel's flag, on top of the chain's.
const refusedCancel = (voided, unvoided, previous) => ({
  reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99',
  voided_tickets: voided, unvoided_tickets: unvoided, at: '2026-09-22T08:01:00Z', previous,
});

// A ticketed booking as the success path left it, then as the refused cancel left it.
const row = ({ tickets, voided, flag }) => ({
  id: 'bk-held1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 582,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  booking_details: {
    pnr: 'HELD99',
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    gds: { ticketed: true },
    tickets,
    voided_tickets: voided,
    gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
    confirmation_email: { state: 'sent' },
    needs_review: flag,
  },
});

// What the booking reads send the pages for the same row (toClientBooking).
const bookingRead = (booking) => ({
  type: 'flight',
  status: booking.status,
  tickets: booking.booking_details.tickets,
  voided_tickets: booking.booking_details.voided_tickets,
  needs_review: { reason: REFUSED, no_confirmed_seat: false, ticket_numbers_missing: Boolean(liveTicketNumbersMissingOf(booking)) },
});

describe('two travellers, one number read back, one ticket voided and the other left live', () => {
  it('is answered ticketed, not "voided", as the booking reads have it', async () => {
    const booking = row({
      tickets: [{ number: A, travelerId: '1' }],
      voided: [A],
      flag: refusedCancel([A], [B], numbersMissing(2, 1)),
    });
    // What every booking read already says of this row: a ticket still issued.
    expect(ticketState(bookingRead(booking))).toBe('pending');

    const res = await retry(booking);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.ticketed).toBe(true);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.message).toBe('This booking already exists');
    // The voided number is still not listed as a ticket, and is still named.
    expect(res.body.tickets).toEqual([]);
    expect(res.body.voided_tickets).toEqual([A]);
    expect(createFlightOrder).not.toHaveBeenCalled();
  });

  it('with no number read back, and the one voided found by the cancel: the same', async () => {
    const booking = row({
      tickets: [],
      voided: [A],
      flag: refusedCancel([A], [], numbersMissing(2, 0)),
    });
    expect(ticketState(bookingRead(booking))).toBe('pending');

    const res = await retry(booking);

    expect(res.body.ticketed).toBe(true);
    expect(res.body.message).not.toMatch(/voided/);
    expect(res.body.voided_tickets).toEqual([A]);
  });
});

describe('the answers next to it', () => {
  it('one traveller, its number never read back, its one ticket voided: not ticketed, voided, as before', async () => {
    const booking = row({ tickets: [], voided: [A], flag: refusedCancel([A], [], numbersMissing(1, 0)) });
    expect(ticketState(bookingRead(booking))).toBe('none');

    const res = await retry(booking);

    expect(res.body.ticketed).toBe(false);
    expect(res.body.data.status).toBe('PENDING_TICKETING');
    expect(res.body.message).toBe('This booking already exists; its ticket has been voided');
    expect(res.body.voided_tickets).toEqual([A]);
  });

  it('two travellers, one number read back, both tickets voided: not ticketed, as before', async () => {
    const booking = row({
      tickets: [{ number: A, travelerId: '1' }],
      voided: [A, B],
      flag: refusedCancel([A, B], [], numbersMissing(2, 1)),
    });
    expect(ticketState(bookingRead(booking))).toBe('none');

    const res = await retry(booking);

    expect(res.body.ticketed).toBe(false);
    expect(res.body.tickets).toEqual([]);
    expect(res.body.message).toMatch(/its ticket has been voided/);
  });

  it('every number read back, one voided: ticketed on the live one, as before', async () => {
    const res = await retry(row({
      tickets: [{ number: A, travelerId: '1' }, { number: B, travelerId: '2' }],
      voided: [A],
      flag: refusedCancel([A], [B]),
    }));

    expect(res.body.ticketed).toBe(true);
    expect(res.body.tickets).toEqual([{ number: B, travelerId: '2' }]);
  });

  it('every number read back, all voided, no numbers-missing flag: not ticketed, as before', async () => {
    const res = await retry(row({ tickets: [{ number: A, travelerId: '1' }], voided: [A], flag: refusedCancel([A], []) }));

    expect(res.body.ticketed).toBe(false);
    expect(res.body.message).toMatch(/its ticket has been voided/);
  });
});
