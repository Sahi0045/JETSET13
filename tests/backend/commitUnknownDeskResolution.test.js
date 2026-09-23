import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';

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
 * "Mark as handled" on a booking whose airline commit never answered.
 *
 * The chain throws before any record locator is read, so the row has no PNR
 * and the flag "chain failed after commit at commit". The desk rings the
 * airline and finds out. resolve-review only stamped the flag resolved, so
 * from then on every page said the booking could not be completed and the
 * duplicate check stopped counting it - false whenever the airline did hold
 * it, and the record locator the desk had just been given was written
 * nowhere: nothing could ticket it, ticket sync could not find it, and a
 * second payment for the same trip was sent to the airline.
 *
 * For this flag the desk now says what the airline said: not held (today's
 * behaviour), or held under a record locator, which goes on the row as the
 * chain would have written it, so the booking reads, counts and is followed up
 * exactly like any paid reservation that was never ticketed.
 */

const REF = 'FLTUNK1';
const SECOND = 'FLTUNK2';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const UNTICKETED = 'PNR committed, never ticketed';
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

const checkoutRow = (ref = REF) => ({
  id: ref === REF ? 1 : 2,
  booking_reference: ref,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: new Date().toISOString(),
  booking_details: {
    order_id: ref,
    success_indicator: `SI-${ref}`,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: JANE } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const orderFor = (ref) => ({
  bookingReference: ref,
  orderId: ref,
  transactionId: `SI-${ref}`,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: JANE,
});

const send = vi.fn();
const createFlightOrder = vi.fn();

const as = (user) => ({ 'x-test-user': JSON.stringify(user) });
const desk = as({ id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' });
const customer = as({ id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', email: 'jane@example.com', role: 'user' });

const appWith = async (rows) => {
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return { app, table };
};

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

// The chain's claim is two minutes and nothing renews it once the commit has
// thrown; the desk gets to it later than that.
const claimLapsed = (table, ref = REF) => {
  const chain = table.row(ref).booking_details.gds_chain;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  Object.assign(chain, { startedAt: tenMinutesAgo, claimedAt: tenMinutesAgo });
};

/** The real order route, to the row a commit that never answered leaves. */
const commitNeverAnswered = async (otherRows = []) => {
  const { app, table } = await appWith([checkoutRow(), ...otherRows]);
  const res = await request(app).post('/api/flights/order').send(orderFor(REF));
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(res.status).toBe(202);
  expect(table.row(REF).booking_details.needs_review.reason).toBe(COMMIT_UNKNOWN);
  expect(table.row(REF).booking_details.pnr).toBeUndefined();
  claimLapsed(table);
  return { app, table };
};

// With the entry the desk page showed, as the page sends it (resolve-review
// refuses a press that does not say).
const resolve = async (app, body, id = 1, who = desk) => request(app)
  .post(`/api/flights/admin-bookings/${id}/resolve-review${await shownQueryFor(id)}`).set(who).send(body);

const snapshot = (row) => JSON.parse(JSON.stringify(row));

describe('the desk list', () => {
  it('says which booking is a commit that never answered, so the desk can ask for the airline\'s answer', async () => {
    const other = {
      ...checkoutRow(SECOND),
      status: 'pending_ticketing',
      booking_details: {
        ...checkoutRow(SECOND).booking_details,
        customer_email: 'someone.else@example.com',
        pnr: 'XYZ789',
        gds: { ticketed: false },
        needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: new Date().toISOString() },
      },
    };
    const { app } = await commitNeverAnswered([other]);

    const res = await request(app).get('/api/flights/admin-bookings-all?attention=open').set(desk);

    const byRef = Object.fromEntries(res.body.data.map((row) => [row.bookingReference, row]));
    expect(byRef[REF].commitUnknown).toBe(true);
    expect(byRef[SECOND].commitUnknown).toBe(false);
  });
});

describe('marking a commit that never answered as handled', () => {
  it('asks what the airline said: a note alone is not enough, and nothing is written', async () => {
    const { app, table } = await commitNeverAnswered();
    const before = snapshot(table.row(REF));

    for (const body of [{ note: 'Rang the airline.' }, { note: 'Rang the airline.', outcome: 'maybe' }]) {
      const res = await resolve(app, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('OUTCOME_REQUIRED');
    }
    expect(table.row(REF)).toEqual(before);
  });

  it('not held: resolved as today, with the answer recorded - the booking did not go through', async () => {
    const { app, table } = await commitNeverAnswered();

    const res = await resolve(app, { note: 'Airline has no record of it.', outcome: 'not_held' });

    expect(res.status).toBe(200);
    const row = table.row(REF);
    expect(row.booking_details.needs_review).toMatchObject({
      reason: COMMIT_UNKNOWN, resolved_by: 'desk@jetsetterss.com', resolution: 'Airline has no record of it.', outcome: 'not_held',
    });
    expect(row.booking_details.needs_review.resolved_at).toBeTruthy();
    expect(row.booking_details.pnr).toBeUndefined();
    expect(row.status).toBe('pending');

    const { commitUnknownOf, attentionOf } = await import('../../shared/reviewQueue.js');
    expect(commitUnknownOf(row)).toBeNull();
    // Its payment is still held: a refund to make, not settled
    // (commitNotHeldRefundOwed.test.js).
    expect(attentionOf(row)).toMatchObject({ kind: 'refund_not_made' });
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus.js');
    expect(attentionMessage(toClientBooking(row))).toMatch(/could not be completed/);
  });

  describe('held, under the record locator the airline gave', () => {
    const heldByDesk = async (otherRows = []) => {
      const ctx = await commitNeverAnswered(otherRows);
      const res = await resolve(ctx.app, { note: 'Airline confirms it holds the booking.', outcome: 'held', pnr: ' abc123 ' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, outcome: 'held', pnr: 'ABC123' });
      return ctx;
    };

    it('goes on the row as the chain records a commit: the locator, not ticketed, the chain finished, pending ticketing', async () => {
      const { table } = await heldByDesk();

      const row = table.row(REF);
      expect(row.status).toBe('pending_ticketing');
      expect(row.booking_details.pnr).toBe('ABC123');
      expect(row.booking_details.amadeus_order_id).toBe('ABC123');
      expect(row.booking_details.gds.ticketed).toBe(false);
      expect(row.booking_details.gds_chain.state).toBe('finished');
      // What the desk found is kept, under the flag every paid, unticketed
      // reservation carries.
      const review = row.booking_details.needs_review;
      expect(review).toMatchObject({ reason: UNTICKETED, ticketed: false });
      expect(review.resolved_at).toBeUndefined();
      expect(review.previous).toMatchObject({
        reason: COMMIT_UNKNOWN, resolved_by: 'desk@jetsetterss.com', resolution: 'Airline confirms it holds the booking.', outcome: 'held', pnr: 'ABC123',
      });
      expect(review.previous.resolved_at).toBeTruthy();
      // Nothing about the money changed.
      expect(row.payment_status).toBe('paid');
    });

    it('reads as held on the customer\'s pages, and a reload of the order says it is booked', async () => {
      const { app, table } = await heldByDesk();
      const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
      const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus.js');

      const client = toClientBooking(table.row(REF));
      expect(client.pnr).toBe('ABC123');
      expect(client.needs_review.commit_unknown).toBe(false);
      expect(attentionMessage(client)).toBe('Your seats are reserved, but your ticket has not been issued yet. '
        + 'Our team is working on it and will email you.');

      const retry = await request(app).post('/api/flights/order').send(orderFor(REF));
      expect(retry.body).toMatchObject({ success: true, mode: 'ALREADY_BOOKED', pnr: 'ABC123' });
      expect(createFlightOrder).toHaveBeenCalledTimes(1);
    });

    it('stays counted as booked: a second payment for the same trip is held, not sent to the airline', async () => {
      const { app, table } = await heldByDesk([checkoutRow(SECOND)]);

      const res = await request(app).post('/api/flights/order').send(orderFor(SECOND));

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DUPLICATE_PAYMENT');
      expect(createFlightOrder).toHaveBeenCalledTimes(1);
      expect(table.row(SECOND).booking_details.needs_review.duplicate_of).toBe(REF);
    });

    it('is the desk\'s and the alarm\'s paid-but-not-ticketed booking, until ticket sync finds the ticket', async () => {
      const { table } = await heldByDesk();
      const row = table.row(REF);
      const { attentionOf } = await import('../../shared/reviewQueue.js');
      const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');

      expect(attentionOf(row)).toMatchObject({ kind: 'review', reason: UNTICKETED });
      expect(selectUnannounced([row])).toHaveLength(1);
      const message = buildMessage([row]);
      expect(message).toMatch(/paid but not ticketed/);
      expect(message).toMatch(/PNR ABC123 · ticketed: NO/);

      // Ticket sync's own selection, on the real query (the double learns
      // `.in` and `.not(..., 'in', ...)` here).
      const supabase = (await import('../../backend/config/supabase.js')).default;
      supabase.from.mockImplementation((name) => {
        const chain = table.from(name);
        const not = chain.not;
        chain.in = (column, list) => chain.or(list.map((value) => `${column}.eq.${value}`).join(','));
        chain.not = (column, op, value) => {
          if (op !== 'in') return not(column, op, value);
          for (const listed of String(value).replace(/^\(|\)$/g, '').split(',')) chain.neq(column, listed);
          return chain;
        };
        return chain;
      });
      const sync = await import('../../backend/jobs/ticketSync.job.js');
      expect((await sync.findUnticketed()).map((r) => r.booking_reference)).toEqual([REF]);

      // Ticketed by hand; ticket sync reads it, records it and sends the e-ticket.
      const sendTicketIssuedEmail = vi.fn().mockResolvedValue({ success: true });
      const provider = {
        getFlightOrderDetails: vi.fn().mockResolvedValue({
          data: { tickets: [{ number: '220-7491175310', travelerId: '1' }], travelers: [{ id: '1', name: { firstName: 'JANE', lastName: 'DOE' } }] },
        }),
      };
      const outcome = await sync.syncOne(snapshot(table.row(REF)), { provider, sendEmail: sendTicketIssuedEmail });
      expect(outcome).toMatchObject({ outcome: 'recorded', emailed: true });
      expect(provider.getFlightOrderDetails).toHaveBeenCalledWith('ABC123');
      expect(attentionOf(table.row(REF))).toBeNull();
    });
  });

  describe('what "held" is refused for', () => {
    it('a record locator that is not 6 letters and digits', async () => {
      const { app, table } = await commitNeverAnswered();
      const before = snapshot(table.row(REF));

      for (const pnr of [undefined, '', 'ABC12', 'ABC1234', 'ABC-12']) {
        const res = await resolve(app, { note: 'Held.', outcome: 'held', ...(pnr === undefined ? {} : { pnr }) });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PNR_INVALID');
      }
      expect(table.row(REF)).toEqual(before);
    });

    it('a booking that has been cancelled or refunded since - "not held" is still recorded', async () => {
      for (const change of [{ status: 'cancelled' }, { payment_status: 'refunded' }]) {
        const { app, table } = await commitNeverAnswered();
        Object.assign(table.row(REF), change);
        const before = snapshot(table.row(REF));

        const held = await resolve(app, { note: 'Held.', outcome: 'held', pnr: 'ABC123' });
        expect(held.status).toBe(409);
        expect(held.body.code).toBe('HELD_NOT_ALLOWED');
        expect(table.row(REF)).toEqual(before);

        const notHeld = await resolve(app, { note: 'Cancelled at the airline by phone.', outcome: 'not_held' });
        expect(notHeld.status).toBe(200);
        expect(table.row(REF).booking_details.needs_review.outcome).toBe('not_held');
      }
    });

    it('a booking that already has a record locator', async () => {
      const flagged = {
        ...checkoutRow(SECOND),
        status: 'pending_ticketing',
        booking_details: {
          ...checkoutRow(SECOND).booking_details,
          pnr: 'XYZ789',
          gds: { ticketed: false },
          needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: new Date().toISOString() },
        },
      };
      const { app, table } = await appWith([flagged]);
      const before = snapshot(table.row(SECOND));

      const res = await resolve(app, { note: 'Held.', outcome: 'held', pnr: 'ABC123' }, 2);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('HELD_NOT_ALLOWED');
      expect(res.body.error).toMatch(/XYZ789/);
      expect(table.row(SECOND)).toEqual(before);
    });

    it('a record locator already on another booking', async () => {
      // Another customer's booking.
      const other = {
        ...checkoutRow(SECOND),
        booking_details: { ...checkoutRow(SECOND).booking_details, customer_email: 'someone.else@example.com', pnr: 'ABC123' },
      };
      const { app, table } = await commitNeverAnswered([other]);
      const before = snapshot(table.row(REF));

      const res = await resolve(app, { note: 'Held.', outcome: 'held', pnr: 'abc123' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PNR_IN_USE');
      expect(res.body.error).toMatch(SECOND);
      expect(table.row(REF)).toEqual(before);
    });

    it('a booking the chain still holds', async () => {
      const { app, table } = await commitNeverAnswered();
      const chain = table.row(REF).booking_details.gds_chain;
      chain.startedAt = new Date().toISOString();
      const before = snapshot(table.row(REF));

      const res = await resolve(app, { note: 'Held.', outcome: 'held', pnr: 'ABC123' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_BUSY');
      expect(table.row(REF)).toEqual(before);
    });

    it('a customer', async () => {
      const { app, table } = await commitNeverAnswered();
      const before = snapshot(table.row(REF));

      const res = await resolve(app, { note: 'Held.', outcome: 'held', pnr: 'ABC123' }, 1, customer);

      expect(res.status).toBe(403);
      expect(table.row(REF)).toEqual(before);
    });
  });
});

// Fences: every other flag resolves exactly as today.
describe('other flags', () => {
  const heldForReview = () => ({
    ...checkoutRow(SECOND),
    status: 'pending_ticketing',
    booking_details: {
      ...checkoutRow(SECOND).booking_details,
      pnr: 'XYZ789',
      gds: { ticketed: false },
      needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-17T10:01:00Z' },
    },
  });

  it('a note alone resolves them, and nothing else on the row changes', async () => {
    const { app, table } = await appWith([heldForReview()]);
    const before = snapshot(table.row(SECOND));

    const res = await resolve(app, { note: 'Ticketed by hand, 220-7491175310.' }, 2);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Marked as handled');
    const row = table.row(SECOND);
    expect(row.booking_details.needs_review).toEqual({
      ...before.booking_details.needs_review,
      resolved_at: expect.any(String),
      resolved_by: 'desk@jetsetterss.com',
      resolution: 'Ticketed by hand, 220-7491175310.',
    });
    expect(row.status).toBe(before.status);
    expect(row.booking_details.pnr).toBe('XYZ789');
  });

  it('a booking that really failed (no PNR, another flag): a note alone, as before', async () => {
    const failed = {
      ...checkoutRow(SECOND),
      booking_details: {
        ...checkoutRow(SECOND).booking_details,
        needs_review: { reason: 'charge not reversed after the booking failed', ticketed: false, at: '2026-09-17T10:01:00Z' },
      },
    };
    const { app, table } = await appWith([failed]);

    const res = await resolve(app, { note: 'Refunded by hand.' }, 2);

    expect(res.status).toBe(200);
    expect(table.row(SECOND).booking_details.needs_review.resolution).toBe('Refunded by hand.');
    expect(table.row(SECOND).booking_details.needs_review.outcome).toBeUndefined();
  });
});
