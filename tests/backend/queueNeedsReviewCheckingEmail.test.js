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

/**
 * What a customer whose booking went through the queue hears when the route
 * answers that a person already has it.
 *
 * A queued customer left the order page on "Booking Received"; email is all
 * they get. When the replay is answered 409 BOOKING_NEEDS_REVIEW - a commit
 * our team is checking with the airline, a PNR the airline confirmed no seat
 * on - the queue rightly stopped sending "We could not confirm your flight
 * booking", and then sent nothing at all: the customer heard nothing until the
 * desk got to them, and nothing told them not to book the trip again. They are
 * now sent one neutral email: our team is checking the booking with the
 * airline and will contact them, and please do not book this trip again.
 *
 * And the queue's email about a second payment for one trip said "a trip you
 * had already booked" whatever the first booking was. When the first is a
 * commit the airline never answered, nobody knows yet whether it was booked:
 * the route's own answer says "already paid for" (duplicatePaymentAnswer, from
 * commitUnknownOf) and now tells the queue so, and the queue's email says the
 * same.
 */

const REF = 'FLTQREV1';
const minuteAgo = () => new Date(Date.now() - 60_000).toISOString();
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

const queuedOrder = {
  bookingReference: REF,
  transactionId: 'SI-QREV',
  contactInfo: { email: 'jane@example.com' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe' }],
};

const queuedRow = (details = {}) => ({
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date().toISOString(),
  booking_details: {
    queued_order: queuedOrder,
    queued_env: 'production',
    customer_email: 'jane@example.com',
    gds_chain: { state: 'queued', startedAt: minuteAgo(), queueAttempts: 1 },
    ...details,
  },
});

// The row once another run of the same order had sent it to the airline and
// the commit never answered (see queueNeedsReviewNoFailureEmail.test.js).
const commitUnknownRow = () => queuedRow({
  gds_chain: { state: 'in_progress', startedAt: tenMinutesAgo(), claimedAt: tenMinutesAgo(), attempt: 1 },
  needs_review: { reason: 'chain failed after commit at commit', ticketed: false, at: tenMinutesAgo() },
});

const CHECKING = 'Our team is checking your booking with the airline and will contact you. '
  + 'Please do not book this trip again in the meantime. If you have not heard from us within 2 business days, '
  + 'call (877) 538-7380 with your booking reference.';

const answering = (status, body) => vi.fn().mockResolvedValue({ status, json: async () => body });

let table = null;
let sendEmail = null;

beforeEach(() => {
  vi.resetModules();
  sendEmail = vi.fn().mockResolvedValue({ id: 'email-mock-id' });
  const mailer = { sendEmail, sendBookingNotificationEmails: vi.fn().mockResolvedValue({ success: true }), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

const load = async (rows) => {
  table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  return import('../../backend/jobs/bookingQueue.job.js');
};

describe('a queued booking the route answered "a person is on this one"', () => {
  const needsReview = { success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: REF, paymentState: 'held' };

  it('is sent one email: our team is checking with the airline, do not book again', async () => {
    const { replay } = await load([commitUnknownRow()]);

    const outcome = await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: answering(409, needsReview) });

    expect(outcome).toBe('needs-review');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('jane@example.com');
    expect(mail.subject).toBe('We are checking your flight booking');
    expect(mail.data).toEqual({ bookingReference: REF, status: 'Being checked', whatHappensNext: CHECKING });
    expect(JSON.stringify(mail)).not.toMatch(/could not confirm|not confirmed|refund/i);
  });

  it('once: the worker\'s next tick only drops what is left, and emails nothing more', async () => {
    const { replay, findRunnable, runQueued } = await load([commitUnknownRow()]);
    await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: answering(409, needsReview) });
    const fetchImpl = answering(409, needsReview);

    for (const row of await findRunnable({ env: 'production' })) await runQueued(row, { baseUrl: 'http://x', fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

// Fences: every other outcome is emailed exactly as before.
describe('the other outcomes', () => {
  it('a real failure: "We could not confirm your flight booking", once', async () => {
    const { replay } = await load([queuedRow()]);

    const outcome = await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: answering(403, { success: false, code: 'PAYER_NOT_VERIFIED' }) });

    expect(outcome).toBe('failed');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toBe('We could not confirm your flight booking');
    expect(sendEmail.mock.calls[0][0].data.status).toBe('Not confirmed');
  });

  it('booked: nothing from the queue - the route sends the confirmation', async () => {
    const { replay } = await load([queuedRow()]);

    const outcome = await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: answering(200, { success: true, pnr: 'ABC123' }) });

    expect(outcome).toBe('confirmed');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('still being worked on, or cancelled meanwhile: nothing', async () => {
    const { replay } = await load([queuedRow()]);

    expect(await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: answering(409, { success: false, code: 'BOOKING_IN_PROGRESS' }) })).toBe('in-progress');
    expect(await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: answering(409, { success: false, code: 'BOOKING_CANCELLED' }) })).toBe('already-finished');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// A second payment for one trip, against a first whose commit never answered:
// the route's real answer, then the queue's email from it.
describe('a queued second payment for a trip whose first booking is still being checked', () => {
  const FIRST = 'FLTUNK1';
  const SECOND = 'FLTUNK2';
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
  const checkoutRow = (ref) => ({
    id: ref === FIRST ? 1 : 2,
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
  const createFlightOrder = vi.fn();

  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
    vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
    vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
    vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
    vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
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

  /** The route's answer to the second payment, and the queue's email from it. */
  const queueEmailForSecond = async ({ firstHasPnr = false } = {}) => {
    table = fakeBookingsTable([checkoutRow(FIRST), checkoutRow(SECOND)]);
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(table.from);
    const routes = (await import('../../backend/routes/flight.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/flights', routes);
    app.use(errorHandler);

    const first = await request(app).post('/api/flights/order').send(orderFor(FIRST));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(first.status).toBe(202);
    const chain = table.row(FIRST).booking_details.gds_chain;
    Object.assign(chain, { startedAt: tenMinutesAgo(), claimedAt: tenMinutesAgo() });
    if (firstHasPnr) table.row(FIRST).booking_details.pnr = 'ABC123';

    const second = await request(app).post('/api/flights/order').send(orderFor(SECOND));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_PAYMENT');

    const { replay } = await import('../../backend/jobs/bookingQueue.job.js');
    const queued = { ...table.row(SECOND), booking_details: { ...table.row(SECOND).booking_details, queued_order: orderFor(SECOND) } };
    sendEmail.mockClear();
    const outcome = await replay(queued, { baseUrl: 'http://x', fetchImpl: answering(409, second.body) });
    expect(outcome).toBe('failed');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    return sendEmail.mock.calls[0][0].data.whatHappensNext;
  };

  it('says the first is paid for and still being checked, not "already booked"', async () => {
    const copy = await queueEmailForSecond();

    expect(copy).toBe('This payment looks like a second payment for a trip you have already paid for, for the same travellers, '
      + 'so we did not book it again. Your first payment is not affected, and our team is still checking with the airline '
      + 'whether that booking went through. Our team will check it and refund this payment. If you did mean to book the '
      + 'trip twice, or have not heard from us within 2 business days, call (877) 538-7380 with your booking reference.');
    expect(copy).not.toMatch(/already booked/);
  });

  // Fence: a first booking the airline holds is "already booked", as before.
  it('once the first has a record locator, "a trip you had already booked" as before', async () => {
    const copy = await queueEmailForSecond({ firstHasPnr: true });

    expect(copy).toBe('This payment looks like a second payment for a trip you had already booked for the same travellers, '
      + 'so we did not book it again. Your first booking is not affected. Our team will check it and refund '
      + 'this payment. If you did mean to book the trip twice, or have not heard from us within 2 business days, '
      + 'call (877) 538-7380 with your booking reference.');
  });
});
