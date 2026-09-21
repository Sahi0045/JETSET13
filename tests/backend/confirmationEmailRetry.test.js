import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// The payment handlers take their Supabase client from arcpay.config.js; see
// amadeusSoap/bookingGate.test.js for why it is mocked here too.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A retried order still gets its confirmation email - once.
 *
 * POST /order answers a booking that already holds a PNR with ALREADY_BOOKED,
 * and that answer sent no email. So a booking whose first confirmation was
 * skipped for want of an address, or failed, never got one: not on the
 * customer's retry, not on a queue replay.
 */

const REF = 'FLTMAIL1';
const INDICATOR = 'SI-MAIL-1';

const bookableOffer = {
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

/** A paid checkout, verified for this offer, not yet booked. */
const checkoutRow = (over = {}) => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  ...over,
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: bookableOffer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01' }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...(over.booking_details || {}),
  },
});

/** The same checkout once the airline holds the booking. */
const bookedRow = (over = {}) => checkoutRow({
  status: 'pending_ticketing',
  ...over,
  booking_details: { pnr: 'CHOY42', gds: { ticketed: false }, origin: 'JFK', destination: 'LHR', currency: 'USD', ...(over.booking_details || {}) },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

const send = vi.fn();
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const emailRecord = (table) => table.row(REF).booking_details.confirmation_email;

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
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('which bookings are still owed their confirmation email', () => {
  const owed = async (row) => (await import('../../backend/routes/flight.routes.js')).confirmationEmailOwed(row);

  it('owes a booked flight with no record of the email, or a failed one', async () => {
    expect(await owed(bookedRow())).toBe(true);
    expect(await owed(bookedRow({ booking_details: { confirmation_email: { state: 'failed' } } }))).toBe(true);
  });

  it('owes nothing once the email went out', async () => {
    expect(await owed(bookedRow({ booking_details: { confirmation_email: { state: 'sent' } } }))).toBe(false);
  });

  it('owes nothing to a booking that was cancelled, or whose money went back', async () => {
    expect(await owed(bookedRow({ status: 'cancelled' }))).toBe(false);
    expect(await owed(bookedRow({ payment_status: 'refunded' }))).toBe(false);
    expect(await owed(bookedRow({ payment_status: 'partially_refunded' }))).toBe(false);
  });

  // A booking a person is sorting out for some other reason - a cancellation the
  // airline refused, say - is owed nothing. One the order route held for staff
  // after committing its PNR is owed the "held" email: see
  // heldForReviewEmail.test.js.
  it('owes a booking flagged for review nothing, unless the flag describes the booking as confirmed or held', async () => {
    const { UNTICKETED_REVIEW_REASON } = await import('../../backend/jobs/needsReviewAlert.job.js');

    expect(await owed(bookedRow({ booking_details: { needs_review: { reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking' } } }))).toBe(false);
    expect(await owed(bookedRow({ booking_details: { needs_review: { reason: 'chain failed after commit at issueTicket' } } }))).toBe(true);
    expect(await owed(bookedRow({ booking_details: { needs_review: { reason: 'ticket_numbers_not_retrieved' } } }))).toBe(true);
    expect(await owed(bookedRow({ booking_details: { needs_review: { reason: UNTICKETED_REVIEW_REASON, alerted_at: 'x' } } }))).toBe(true);
  });

  it('owes nothing before there is a booking', async () => {
    expect(await owed(checkoutRow())).toBe(false);
  });
});

describe('a retried order for a booking that is already made', () => {
  const retry = (app) => request(app).post('/api/flights/order').send(order);

  it('sends the confirmation the booking never got, and records it without the address', async () => {
    const { app, table } = await appWith([bookedRow()]);

    const res = await retry(app);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    await vi.waitFor(() => expect(emailRecord(table)?.state).toBe('sent'));
    expect(send).toHaveBeenCalledTimes(1);
    const [email] = send.mock.calls[0];
    expect(email).toMatchObject({ customerEmail: 'jane@example.com', customerName: 'Jane Doe', bookingReference: REF, bookingType: 'flight' });
    // The template decides "reservation" from the row, as on the success path.
    expect(email.bookingDetails).toMatchObject({ pnr: 'CHOY42', gds: { ticketed: false } });
    expect(email.bookingDetails).not.toHaveProperty('success_indicator');
    expect(JSON.stringify(emailRecord(table))).not.toContain('@');
  });

  it('answers without waiting for the email', async () => {
    send.mockReturnValue(new Promise(() => {}));
    const { app } = await appWith([bookedRow()]);

    const res = await retry(app);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
  });

  it('still answers when the email fails, and a later retry sends it', async () => {
    send.mockRejectedValueOnce(new Error('mail provider down'));
    const { app, table } = await appWith([bookedRow()]);

    const first = await retry(app);
    expect(first.status).toBe(200);
    await vi.waitFor(() => expect(emailRecord(table)?.state).toBe('failed'));

    await retry(app);
    await vi.waitFor(() => expect(emailRecord(table)?.state).toBe('sent'));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends nothing again once the email went out', async () => {
    const sentAt = '2026-09-15T10:00:00.000Z';
    const { app } = await appWith([bookedRow({ booking_details: { confirmation_email: { state: 'sent', sent_at: sentAt, claimed_at: sentAt } } })]);

    await retry(app);
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it('sends one email for two retries at once', async () => {
    send.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 30)));
    const { app, table } = await appWith([bookedRow()]);

    const answers = await Promise.all([retry(app), retry(app)]);

    expect(answers.map((res) => res.body.mode)).toEqual(['ALREADY_BOOKED', 'ALREADY_BOOKED']);
    await vi.waitFor(() => expect(emailRecord(table)?.state).toBe('sent'));
    await settle(50);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('lets the database decide between two claims read at the same moment', async () => {
    send.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 10)));
    const { table } = await appWith([bookedRow()]);
    const { sendConfirmationOnce } = await import('../../backend/routes/flight.routes.js');

    const results = await Promise.all([
      sendConfirmationOnce(REF, { customerEmail: 'jane@example.com' }),
      sendConfirmationOnce(REF, { customerEmail: 'jane@example.com' }),
    ]);

    expect(results.filter((result) => result.sent)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    // Both read an unclaimed row; the second conditional write matched nothing.
    const claims = table.writes.filter((write) => write.patch.booking_details?.confirmation_email?.state === 'sending');
    expect(claims.map((write) => write.matched)).toEqual([1, 0]);
  });

  // The email went out, and recording it matched nothing: a whole-column write
  // of booking_details landed while it was sending, from a copy read before the
  // claim. The write was not checked, so the booking was left owed - and every
  // later retry sent the confirmation again.
  it('records a sent email even when a stale copy of the booking landed while it was sending', async () => {
    const { table } = await appWith([bookedRow()]);
    send.mockImplementation(async () => {
      delete table.row(REF).booking_details.confirmation_email;
      return { success: true };
    });
    const { sendConfirmationOnce } = await import('../../backend/routes/flight.routes.js');

    const first = await sendConfirmationOnce(REF, { customerEmail: 'jane@example.com' });
    expect(first.sent).toBe(true);
    expect(emailRecord(table)?.state).toBe('sent');

    const again = await sendConfirmationOnce(REF, { customerEmail: 'jane@example.com' });
    expect(again.sent).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  // Another sender claimed it after this one's claim expired: that claim is
  // theirs to record, and is not overwritten.
  it("does not overwrite a newer claim with this one's outcome", async () => {
    const { table } = await appWith([bookedRow()]);
    const theirs = new Date(Date.now() + 60_000).toISOString();
    send.mockImplementation(async () => {
      table.row(REF).booking_details.confirmation_email = { state: 'sending', claimed_at: theirs, attempt: 2 };
      return { success: true };
    });
    const { sendConfirmationOnce } = await import('../../backend/routes/flight.routes.js');

    await sendConfirmationOnce(REF, { customerEmail: 'jane@example.com' });

    expect(emailRecord(table)).toMatchObject({ state: 'sending', claimed_at: theirs });
  });

  it('sends nothing for a booking a human is sorting out', async () => {
    const { app } = await appWith([bookedRow({ booking_details: { needs_review: { reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking' } } })]);

    const res = await retry(app);
    await settle();

    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing for a booking whose money went back', async () => {
    const { app } = await appWith([bookedRow({ payment_status: 'refunded' })]);

    await retry(app);
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it('sends and records nothing without an address', async () => {
    const { app, table } = await appWith([bookedRow({ booking_details: { customer_email: null } })]);

    await request(app).post('/api/flights/order').send({ ...order, contactInfo: { email: '' } });
    await settle();

    expect(send).not.toHaveBeenCalled();
    expect(emailRecord(table)).toBeUndefined();
  });
});

describe("the booking's first confirmation email", () => {
  const bookWith = (createFlightOrder) => {
    vi.doMock('../../backend/services/flightProvider.js', () => ({
      default: {
        priceFlightOffer: vi.fn(async (offer) => ({
          success: true,
          data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
        })),
        createFlightOrder: vi.fn(createFlightOrder),
      },
      providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
    }));
  };

  const booked = async (_orderData, options) => {
    await options.onCommitted({ pnr: 'ABC123', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
    return { success: true, pnr: 'ABC123', orderId: 'ABC123', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' };
  };

  const place = (app, body = order) => request(app).post('/api/flights/order').send(body);

  it('is recorded as sent, so a retry sends nothing more', async () => {
    bookWith(booked);
    const { app, table } = await appWith([checkoutRow()]);

    const res = await place(app);

    expect(res.body.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(emailRecord(table).state).toBe('sent');

    const again = await place(app);
    await settle();

    expect(again.body.mode).toBe('ALREADY_BOOKED');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is recorded as failed when it did not go out, and the retry sends it', async () => {
    send.mockResolvedValueOnce({ success: false, error: 'customer email not sent' });
    bookWith(booked);
    const { app, table } = await appWith([checkoutRow()]);

    await place(app);
    expect(emailRecord(table).state).toBe('failed');

    const again = await place(app);

    expect(again.body.mode).toBe('ALREADY_BOOKED');
    await vi.waitFor(() => expect(emailRecord(table)?.state).toBe('sent'));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('still tells the office when there is no address, and leaves the email owed', async () => {
    bookWith(booked);
    const { app, table } = await appWith([checkoutRow({ booking_details: { customer_email: null } })]);

    const res = await place(app, { ...order, contactInfo: { email: '' } });

    expect(res.body.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].customerEmail).toBe('');
    expect(emailRecord(table)).toBeUndefined();
  });
});
