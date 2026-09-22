import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// See commitNeverAnsweredReadBack.test.js: the payment handlers take their
// Supabase client from arcpay.config.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

// Staff sign in with a header; the order route (optionalProtect) sees nobody.
vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  const userFrom = (req) => (req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user']) : null);
  return {
    ...actual,
    protect: (req, res, next) => {
      req.user = userFrom(req);
      return req.user ? next() : res.status(401).json({ message: 'Not authorized' });
    },
    optionalProtect: (req, res, next) => { req.user = userFrom(req); next(); },
  };
});

/**
 * What the customer hears once the desk finds the airline does hold a booking
 * whose commit never answered.
 *
 * When they paid, the order page told them "our team is checking with the
 * airline whether your booking went through ... we will email you either
 * way". The desk records "held" under the airline's record locator, and the
 * booking becomes a paid reservation waiting on its ticket - and nobody sent
 * that email. A reservation email was owed from that moment
 * (confirmationEmailOwed), but only a reload of the order page, or the
 * e-ticket much later, would ever have sent it.
 *
 * "Held" now sends it, through the confirmation's own claim
 * (sendConfirmationOnce), so neither a reload nor anything else sends it twice.
 */

const REF = 'FLTUNK1';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];

const offer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT7H45M',
    segments: [{
      id: '1',
      departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' },
      arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' },
      carrierCode: 'FI', number: '614', aircraft: { code: '7M9' }, numberOfStops: 0,
    }],
  }],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' }],
  }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [] },
};

const checkoutRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: new Date().toISOString(),
  booking_details: {
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: JANE } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: `SI-${REF}`,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: JANE,
};

const send = vi.fn();
const createFlightOrder = vi.fn();
const desk = { 'x-test-user': JSON.stringify({ id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }) };

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  send.mockReset();
  send.mockResolvedValue({ success: true });
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn(), sendTicketIssuedEmail: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));

  // The chain as it stops when the commit's answer never arrives.
  createFlightOrder.mockReset();
  createFlightOrder.mockImplementation(async (_orderData, options) => {
    if (options?.beforeCommit) await options.beforeCommit();
    throw Object.assign(new Error('We could not confirm your booking'), {
      name: 'BookingChainError',
      step: 'commit',
      committed: 'unknown',
      code: 504,
      operation: 'PNR_AddMultiElements',
      technicalError: 'timeout of 25000ms exceeded',
    });
  });
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (priced) => ({
        success: true,
        data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder,
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

/** The real order route, to the row a commit that never answered leaves, its claim lapsed. */
const commitNeverAnswered = async () => {
  const table = fakeBookingsTable([checkoutRow()]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);

  const res = await request(app).post('/api/flights/order').send(order);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(res.status).toBe(202);
  expect(table.row(REF).booking_details.needs_review.reason).toBe(COMMIT_UNKNOWN);
  // Nothing was owed yet: nobody knew whether there was a booking.
  expect(send).not.toHaveBeenCalled();

  const chain = table.row(REF).booking_details.gds_chain;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  Object.assign(chain, { startedAt: tenMinutesAgo, claimedAt: tenMinutesAgo });
  return { app, table };
};

const resolve = (app, body) => request(app).post('/api/flights/admin-bookings/1/resolve-review').set(desk).send(body);

describe('the desk records a commit that never answered as held', () => {
  it('emails the customer their reservation, once, and records it sent', async () => {
    const { app, table } = await commitNeverAnswered();

    const res = await resolve(app, { note: 'Airline confirms it holds the booking.', outcome: 'held', pnr: 'ABC123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, outcome: 'held', pnr: 'ABC123', emailed: true });
    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0][0];
    expect(email).toMatchObject({ customerEmail: 'jane@example.com', customerName: 'Jane Doe', bookingReference: REF, bookingType: 'flight' });
    // A reservation, not a ticket: the email says so from the row
    // (isUnticketedFlight), and it is not the "our team is finishing your
    // ticket" email for a booking the order route held.
    expect(email.heldForReview).toBe(false);
    expect(email.bookingDetails.pnr).toBe('ABC123');
    expect(email.bookingDetails.gds.ticketed).toBe(false);
    const { isUnticketedFlight } = await import('../../backend/services/email/templates.js');
    expect(isUnticketedFlight(email)).toBe(true);
    expect(table.row(REF).booking_details.confirmation_email.state).toBe('sent');
  });

  it('a reload of the order afterwards is answered booked, and sends it no second time', async () => {
    const { app } = await commitNeverAnswered();
    await resolve(app, { note: 'Airline confirms it holds the booking.', outcome: 'held', pnr: 'ABC123' });

    const retry = await request(app).post('/api/flights/order').send(order);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(retry.body).toMatchObject({ success: true, mode: 'ALREADY_BOOKED', pnr: 'ABC123' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('an email that could not be sent does not undo the held record, and stays owed', async () => {
    send.mockResolvedValue({ success: false, error: 'mailbox unavailable' });
    const { app, table } = await commitNeverAnswered();

    const res = await resolve(app, { note: 'Airline confirms it holds the booking.', outcome: 'held', pnr: 'ABC123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, outcome: 'held', pnr: 'ABC123', emailed: false });
    const row = table.row(REF);
    expect(row.booking_details.pnr).toBe('ABC123');
    expect(row.booking_details.confirmation_email.state).toBe('failed');
    const { confirmationEmailOwed } = await import('../../backend/routes/flight.routes.js');
    expect(confirmationEmailOwed(row)).toBe(true);
  });
});

// My Trips lists it by the flag the desk wrote (failedTabHeldReservation.test.jsx):
// the row as written, sent as the booking reads send it, is a held reservation
// waiting only on its ticket - under Upcoming, not "Failed".
describe('the booking My Trips reads afterwards', () => {
  it('is a held reservation waiting only on its ticket', async () => {
    const { app, table } = await commitNeverAnswered();
    await resolve(app, { note: 'Airline confirms it holds the booking.', outcome: 'held', pnr: 'ABC123' });

    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const { documentState } = await import('../../frontend/src/utils/eTicket.js');
    const { isAwaitingTicketOnly } = await import('../../shared/reviewQueue.js');
    const client = toClientBooking(table.row(REF));
    expect(documentState(client)).toBe('held');
    expect(isAwaitingTicketOnly(client)).toBe(true);
  });

  it('the flag it reads is the alarm\'s own', async () => {
    const shared = await import('../../shared/reviewQueue.js');
    const alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(shared.UNTICKETED_REVIEW_REASON).toBe(alarm.UNTICKETED_REVIEW_REASON);
  });
});

// Fences: nothing else sends it.
describe('what sends no email', () => {
  it('"not held": the desk tells the customer what the airline said', async () => {
    const { app } = await commitNeverAnswered();

    const res = await resolve(app, { note: 'Airline has no record of it.', outcome: 'not_held' });

    expect(res.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it('a "held" that is refused', async () => {
    const { app } = await commitNeverAnswered();

    const res = await resolve(app, { note: 'Held.', outcome: 'held', pnr: 'ABC12' });

    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
