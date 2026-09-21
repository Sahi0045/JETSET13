import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// See confirmationEmailRetry.test.js: the payment handlers take their Supabase
// client from arcpay.config.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A booking held for staff gets an email.
 *
 * POST /order answers 202 "needs review" when the airline took the booking and
 * a later step - ticketing, the final save - failed. Neither answer sent any
 * email, and confirmationEmailOwed ruled them out on every retry, while the
 * order page said "We'll email your e-ticket" and the confirmation page "A
 * confirmation email has been sent".
 */

const REF = 'FLTHELD1';
const INDICATOR = 'SI-HELD-1';

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

const checkoutRow = (over = {}) => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-15T10:00:00Z',
  ...over,
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01' }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...(over.booking_details || {}),
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

const send = vi.fn();
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

/** The provider, booking the PNR and then doing whatever `after` does. */
const bookThen = (after) => {
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (priced) => ({
        success: true,
        data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: 'HELD42', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        return after();
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
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

describe('which email a booking is owed', () => {
  const kind = async (row) => (await import('../../backend/routes/flight.routes.js')).confirmationEmailKind(row);
  const booked = (details = {}, over = {}) => checkoutRow({ status: 'pending_ticketing', ...over, booking_details: { pnr: 'HELD42', ...details } });

  it('owes the held email to a booking the order route held after its PNR', async () => {
    expect(await kind(booked({ needs_review: { reason: 'chain failed after commit at issueTicket' } }))).toBe('held');
    expect(await kind(booked({ needs_review: { reason: 'order route failed after commit: boom' } }))).toBe('held');
  });

  it('owes the confirmation to an ordinary booking', async () => {
    expect(await kind(booked())).toBe('confirmation');
    expect(await kind(booked({ needs_review: { reason: 'ticket_numbers_not_retrieved' } }))).toBe('confirmation');
  });

  it('owes nothing for another review, once sent, once cancelled or refunded, or before a PNR', async () => {
    expect(await kind(booked({ needs_review: { reason: 'fallback cancel could not reach the GDS; booking may still be live' } }))).toBeNull();
    expect(await kind(booked({ needs_review: { reason: 'chain failed after commit at issueTicket' }, confirmation_email: { state: 'sent' } }))).toBeNull();
    expect(await kind(booked({ needs_review: { reason: 'chain failed after commit at issueTicket' } }, { status: 'cancelled' }))).toBeNull();
    expect(await kind(booked({ needs_review: { reason: 'chain failed after commit at issueTicket' } }, { payment_status: 'refunded' }))).toBeNull();
    expect(await kind(checkoutRow())).toBeNull();
    expect(await kind(null)).toBeNull();
  });
});

describe('a booking held for staff', () => {
  it('is emailed once when ticketing fails after the PNR, and not again on a retry', async () => {
    bookThen(() => {
      throw Object.assign(new Error('ticketing refused'), { committed: true, pnr: 'HELD42', step: 'issueTicket', ticketed: false });
    });
    const { app, table } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.status).toBe(202);
    expect(res.body.needsReview).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const [email] = send.mock.calls[0];
    expect(email).toMatchObject({ customerEmail: 'jane@example.com', bookingReference: REF, heldForReview: true });
    expect(email.bookingDetails).toMatchObject({ pnr: 'HELD42' });
    expect(email.bookingDetails).not.toHaveProperty('pending_booking_data');
    expect(emailRecord(table).state).toBe('sent');

    const again = await request(app).post('/api/flights/order').send(order);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(again.body.mode).toBe('ALREADY_BOOKED');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is emailed when the order route fails after the commit', async () => {
    // The PNR is committed and the chain answers, then reading its answer fails.
    bookThen(() => ({
      success: true, pnr: 'HELD42', orderId: 'HELD42', ticketed: false, mode: 'LIVE_GDS_BOOKING',
      get tickets() { throw new Error('boom'); },
    }));
    const { app, table } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.status).toBe(202);
    expect(res.body.needsReview).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].heldForReview).toBe(true);
    expect(emailRecord(table).state).toBe('sent');
  });

  it('still answers 202 when the email fails, and a retry sends it', async () => {
    send.mockResolvedValueOnce({ success: false, error: 'mail provider down' });
    bookThen(() => {
      throw Object.assign(new Error('ticketing refused'), { committed: true, pnr: 'HELD42', step: 'issueTicket', ticketed: false });
    });
    const { app, table } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);
    expect(res.status).toBe(202);
    expect(emailRecord(table).state).toBe('failed');

    await request(app).post('/api/flights/order').send(order);
    await vi.waitFor(() => expect(emailRecord(table)?.state).toBe('sent'));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].heldForReview).toBe(true);
  });
});

describe('the held email', () => {
  it('says the seats are held and a person is finishing the ticket, and claims no confirmation', async () => {
    const T = await import('../../backend/services/email/templates.js');
    const html = T.generateReservationHeldTemplate({
      customerName: 'Jane Doe', bookingReference: REF, paymentAmount: 291, currency: 'USD', travelDate: '2026-11-15', passengers: 1,
      bookingDetails: { pnr: 'HELD42', flight_offer: offer },
    });

    expect(html).toContain('Reservation Held');
    expect(html).toMatch(/our team is finishing your ticket/i);
    expect(html).toContain('HELD42');
    expect(html).toContain('FI614');
    expect(html).toContain('$291.00');
    expect(html).toContain(`/manage-booking/${REF}`);
    expect(html).toMatch(/do not travel on this email/);
    expect(html).not.toMatch(/Booking Confirmed|is confirmed/);
  });
});

/**
 * A commit whose answer never arrived.
 *
 * The commit step was marked `committed: false` — the default — so a 25s
 * timeout on the end transact told the route "nothing was sold" and it reversed
 * the payment. Amadeus may well have processed it and be holding the
 * reservation, and this layer has no PNR search to find the orphan afterwards.
 *
 * `committed: 'unknown'` is truthy, so the route's "a committed PNR needs a
 * human, not an automatic reversal" branch takes it.
 */
describe('a commit we never got an answer to', () => {
  it('is held for a human rather than refunded', async () => {
    bookThen(() => {
      throw Object.assign(new Error('We could not confirm your booking'), {
        committed: 'unknown', step: 'commit', technicalError: 'timeout of 25000ms exceeded',
      });
    });
    const { app } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.status).toBe(202);
    expect(res.body.needsReview).toBe(true);
  });

  /**
   * And it must not claim seats it cannot see. With no record locator we do not
   * know whether the airline holds anything.
   */
  it('does not tell the customer their seats are reserved', async () => {
    bookThen(() => {
      throw Object.assign(new Error('We could not confirm your booking'), {
        committed: 'unknown', step: 'commit',
      });
    });
    const { app } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.message).not.toMatch(/seats are reserved/i);
    expect(res.body.message).toMatch(/checking with the airline/i);
    expect(res.body.message).toMatch(/do not book again/i);
  });

  // The ordinary held case, which DOES have a locator, still says so.
  it('still says the seats are reserved when a locator came back', async () => {
    bookThen(() => {
      throw Object.assign(new Error('ticketing refused'), {
        committed: true, pnr: 'HELD42', step: 'issueTicket', ticketed: false,
      });
    });
    const { app } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.message).toMatch(/seats are reserved/i);
  });
});

/**
 * A PNR whose airline confirmed no seat.
 *
 * The chain stops with step 'segmentStatus' when a segment comes back from
 * commit waitlisted, requested, unable or cancelled (bookingChain.js
 * NOT_A_SEAT_AT_COMMIT). It went to the generic committed branch, which
 * answered "Your seats are reserved with the airline ... We will email you as
 * soon as it is issued" and sent the Reservation Held email - "the airline is
 * holding your seats ... You do not need to do anything". Neither is true, and
 * the server will not issue that ticket. No honest email for this case exists,
 * so none is sent: the needs_review flag pages a person, who contacts them.
 */
describe('a booking the airline confirmed no seat on', () => {
  const NO_SEAT = 'The airline has not confirmed a seat on every flight - our team will contact you';
  const noSeat = () => {
    throw Object.assign(new Error(NO_SEAT), {
      name: 'BookingChainError',
      committed: true,
      pnr: 'HELD42',
      step: 'segmentStatus',
      ticketed: false,
      code: 502,
      error: NO_SEAT,
      technicalError: 'segment status TL at commit: TL is not a confirmed seat (waitlisted, requested, unable or cancelled); not accepted or ticketed',
    });
  };

  it('answers with the chain\'s own words, promises no seat, and sends no email', async () => {
    bookThen(noSeat);
    const { app, table } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe(NO_SEAT);
    expect(res.body.message).toBe(NO_SEAT);
    expect(res.body.needsReview).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/seats are reserved|holding your seats|email you as soon as it is issued/i);
    expect(send).not.toHaveBeenCalled();
    // A person is paged instead: the flag the alarm and the desk read.
    expect(table.row(REF).booking_details.needs_review).toMatchObject({ reason: 'chain failed after commit at segmentStatus', ticketed: false });
    expect(table.row(REF).booking_details.confirmation_email?.state).not.toBe('sent');
  });

  it('is not sent the held email, or told its seats are reserved, on a retry either', async () => {
    bookThen(noSeat);
    const { app } = await appWith([checkoutRow()]);
    await request(app).post('/api/flights/order').send(order);

    const again = await request(app).post('/api/flights/order').send(order);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(again.body.success).toBe(false);
    expect(again.body.code).toBe('BOOKING_NEEDS_REVIEW');
    expect(JSON.stringify(again.body)).not.toMatch(/seats are reserved|already exists/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('is owed no email of either kind', async () => {
    const { confirmationEmailKind } = await import('../../backend/routes/flight.routes.js');
    const row = checkoutRow({ status: 'pending_ticketing', booking_details: { pnr: 'HELD42', needs_review: { reason: 'chain failed after commit at segmentStatus' } } });
    expect(confirmationEmailKind(row)).toBeNull();
  });

  // My Trips reads the same flag (frontend/src/utils/bookingStatus.js), and
  // must not say "your seats are reserved" either.
  it('is the reason My Trips knows as "no confirmed seat"', async () => {
    const routes = await import('../../backend/routes/flight.routes.js');
    const myTrips = await import('../../frontend/src/utils/bookingStatus.js');
    expect(myTrips.NO_CONFIRMED_SEAT_REVIEW_REASON).toBe(routes.NO_CONFIRMED_SEAT_REVIEW_REASON);
  });

  // A queued booking replayed into this answer is a final failure to the
  // booking queue, which keeps the flag and emails its own "we could not
  // confirm your booking ... our team will contact you" - true of this case.
  it('gets the booking queue\'s honest not-confirmed email when it was queued', async () => {
    const { failureCopy } = await import('../../backend/jobs/bookingQueue.job.js');
    const copy = failureCopy({ success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, error: NO_SEAT }, { alerted: true });
    expect(copy).toMatch(/^We could not confirm your booking\. Our team has been alerted and will contact you/);
    expect(copy).not.toMatch(/reserved|holding|refund/i);
  });
});
