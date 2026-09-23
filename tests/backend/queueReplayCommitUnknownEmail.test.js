import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    supabase: { from: vi.fn(() => chain) },
  };
});

/**
 * A queued (or abandoned-checkout) booking whose own replay ends with an
 * airline commit that never answered.
 *
 * The queued customer was told (respondQueued): "Your payment is received and
 * your booking is being confirmed with the airline. You will receive your
 * confirmation by email within a few minutes." The abandoned-checkout
 * customer closed the tab after paying. Email is all either gets.
 *
 * The replay runs the real order route. The chain's commit times out, so the
 * route writes the commit-unknown flag and answers 202 success with no PNR
 * ("We will email you either way - please do not book again"), and sends
 * nothing: there is no booking to confirm (confirmationEmailKind needs a PNR).
 * The queue read success as "confirmed", dropped the order and sent nothing
 * either - while the airline may or may not hold the booking, and nothing
 * told the customer not to book again.
 *
 * It is the state the queue already sends CHECKING_EMAIL for when the route
 * answers 409 BOOKING_NEEDS_REVIEW, and now gets it too, once.
 */

const REF = 'FLTQCU01';
const INDICATOR = 'SI-QCU-1';
const minuteAgo = () => new Date(Date.now() - 60_000).toISOString();

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

const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];

const queuedOrder = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: JANE,
};

// The checkout row: paid, no PNR.
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
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: JANE }, returnUrl: 'https://www.jetsetterss.com/payment/callback' },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

// As the queue holds it, after a slot timeout.
const queuedRow = () => {
  const row = checkoutRow();
  row.booking_details = {
    ...row.booking_details,
    queued_order: queuedOrder,
    queued_env: 'production',
    gds_chain: { state: 'queued', startedAt: minuteAgo(), queuedAt: minuteAgo(), queueAttempts: 1 },
  };
  return row;
};

const CHECKING = {
  subject: 'We are checking your flight booking',
  data: {
    bookingReference: REF,
    status: 'Being checked',
    whatHappensNext: 'Our team is checking your booking with the airline and will contact you. '
      + 'Please do not book this trip again in the meantime. If you have not heard from us within 2 business days, '
      + 'call (877) 538-7380 with your booking reference.',
  },
};

let sendEmail;
let sendBookingNotificationEmails;
let createFlightOrder;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  // ARC answers the replay's fresh reconcile: 291 captured.
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset?.();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  sendEmail = vi.fn().mockResolvedValue({ id: 'email-mock-id' });
  sendBookingNotificationEmails = vi.fn().mockResolvedValue({ success: true });
  const mailer = { sendEmail, sendBookingNotificationEmails, sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  // The chain as it stops when the commit's answer never arrives (bookingChain.js step 6).
  createFlightOrder = vi.fn(async (_orderData, options) => {
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
  vi.unstubAllEnvs();
});

/** The table, and the worker's POST through the real order route. */
const routeFor = async (rows) => {
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  const fetchImpl = vi.fn(async (_url, init) => {
    const res = await request(app).post('/api/flights/order')
      .set('x-booking-queue-replay', '1')
      .send(JSON.parse(init.body));
    return { status: res.status, json: async () => res.body };
  });
  return { table, fetchImpl };
};

const emailsTo = () => [
  ...sendEmail.mock.calls.map((c) => c[0]?.to),
  ...sendBookingNotificationEmails.mock.calls.map((c) => c[0]?.customerEmail),
].filter(Boolean);

describe('a queued booking whose own replay ends with a commit that never answered', () => {
  it('is sent the checking email once: our team is checking with the airline, do not book again', async () => {
    const { table, fetchImpl } = await routeFor([queuedRow()]);
    const { replay } = await import('../../backend/jobs/bookingQueue.job.js');

    const outcome = await replay(table.row(REF), { baseUrl: 'http://x', fetchImpl });
    await new Promise((resolve) => setTimeout(resolve, 30));

    // The route's answer, and the state CHECKING_EMAIL is for.
    const answered = await fetchImpl.mock.results[0].value;
    expect(answered.status).toBe(202);
    expect(await answered.json()).toMatchObject({ success: true, needsReview: true });
    const stored = table.row(REF);
    expect(stored.booking_details.needs_review?.reason).toBe('chain failed after commit at commit');
    expect(stored.booking_details.pnr ?? null).toBeNull();

    expect(outcome, 'a commit nobody knows the answer to is not a confirmed booking').toBe('needs-review');
    expect(emailsTo(), 'promised a confirmation "within a few minutes", told nothing').toEqual(['jane@example.com']);
    expect(sendEmail.mock.calls[0][0]).toMatchObject(CHECKING);
    expect(JSON.stringify(sendEmail.mock.calls[0][0])).not.toMatch(/could not confirm|not confirmed|refund/i);
    // The stored order (passports, dates of birth) is dropped, as for any outcome.
    expect(stored.booking_details.queued_order).toBeUndefined();
  });

  it('once: the worker\'s next tick sends nothing more, and nothing goes to the airline again', async () => {
    const { table, fetchImpl } = await routeFor([queuedRow()]);
    const { replay, findRunnable, runQueued } = await import('../../backend/jobs/bookingQueue.job.js');
    await replay(table.row(REF), { baseUrl: 'http://x', fetchImpl });
    await new Promise((resolve) => setTimeout(resolve, 30));

    for (const row of await findRunnable({ env: 'production' })) await runQueued(row, { baseUrl: 'http://x', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('an abandoned checkout the job books, whose commit never answers', () => {
  it('is sent the checking email once, and the job is done with it', async () => {
    const { table, fetchImpl } = await routeFor([checkoutRow()]);
    const { replay } = await import('../../backend/jobs/bookingQueue.job.js');
    const { settle } = await import('../../backend/jobs/abandonedCheckout.job.js');
    // The job's own sender (runOnce): the rebuilt order, through the queue's replay.
    const send = (row, body) => replay(
      { booking_reference: row.booking_reference, status: row.status, booking_details: { ...row.booking_details, queued_order: body } },
      { baseUrl: 'http://x', fetchImpl },
    );

    const result = await settle(table.row(REF), {
      now: Date.now() + 40 * 60_000,
      reconcile: async () => ({ paid: true }),
      send,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(table.row(REF).booking_details.needs_review?.reason).toBe('chain failed after commit at commit');
    expect(result).toEqual({ outcome: 'needs-review', final: true });
    expect(emailsTo()).toEqual(['jane@example.com']);
    expect(sendEmail.mock.calls[0][0]).toMatchObject(CHECKING);
  });
});

// Fences: a replay the airline answered is emailed exactly as before.
describe('a replay the airline answered', () => {
  const answering = (status, body) => vi.fn().mockResolvedValue({ status, json: async () => body });

  it('held for staff under a record locator (202, needsReview): nothing from the queue - the route sends the held email', async () => {
    const { table } = await routeFor([queuedRow()]);
    const { replay } = await import('../../backend/jobs/bookingQueue.job.js');

    const outcome = await replay(table.row(REF), {
      baseUrl: 'http://x',
      fetchImpl: answering(202, { success: true, needsReview: true, pnr: 'ABC123', data: { pnr: 'ABC123' } }),
    });

    expect(outcome).toBe('confirmed');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('ticketed, held after issuance (202, ticketed): nothing from the queue - ticket sync sends the e-ticket', async () => {
    const { table } = await routeFor([queuedRow()]);
    const { replay } = await import('../../backend/jobs/bookingQueue.job.js');

    const outcome = await replay(table.row(REF), {
      baseUrl: 'http://x',
      fetchImpl: answering(202, { success: true, needsReview: true, ticketed: true, pnr: 'ABC123' }),
    });

    expect(outcome).toBe('confirmed');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
