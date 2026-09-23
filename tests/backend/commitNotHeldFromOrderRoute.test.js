import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';

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
 * A commit the airline never answered, marked "not held" by the desk before
 * anything returned the money, from the real order route on.
 *
 * Every customer surface promised: "Your payment is safe and our team is
 * checking with the airline whether your booking went through. We will email
 * you either way". After "not held" the customer reads "Our team is looking
 * after your payment and will email you" - and the booking, paid 291 at ARC
 * with no PNR, was on no list and in no job: the desk and the Slack alarm read
 * attentionOf (null once resolved), the failed-refund alarm needs a
 * cancellation record, the abandoned-checkout job skips any row with a flag,
 * and ticket sync / paid-not-ticketed need a PNR. No email was sent either.
 *
 * Now the desk and the needs-review alarm keep it as a refund to make, and the
 * customer is emailed that it did not go through (commitNotHeldRefundOwed.test.js
 * has the rest of its lifecycle).
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

describe('not held, with the money still at ARC', () => {
  it('stays in front of the desk and the alarm as a refund to make, and the customer is emailed', async () => {
    const { app, table } = await commitNeverAnswered();
    send.mockClear();
    const res = await resolve(app, { note: 'Airline has no record of it.', outcome: 'not_held' });
    expect(res.status).toBe(200);

    const row = table.row(REF);
    const { attentionOf } = await import('../../shared/reviewQueue.js');
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    const { selectUnrefunded } = await import('../../backend/jobs/paymentFailureAlert.job.js');
    const { selectCandidates, checkoutSite } = await import('../../backend/jobs/abandonedCheckout.job.js');
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus.js');
    const mailer = await import('../../backend/services/emailService.js');

    const seen = {
      row: { status: row.status, payment_status: row.payment_status, pnr: row.booking_details.pnr ?? null, cancellation: row.booking_details.cancellation ?? null },
      desk: attentionOf(row),
      slackNeedsReview: selectUnannounced([row]).length,
      slackFailedRefund: selectUnrefunded([row]).length,
      abandonedCheckoutJob: selectCandidates([row], { now: Date.parse(row.created_at) + 60 * 60_000, site: checkoutSite(row) }).length,
      customerEmails: send.mock.calls.length + mailer.sendEmail.mock.calls.length + mailer.sendCancellationNotificationEmails.mock.calls.length,
      customerReads: attentionMessage(toClientBooking(row)),
    };

    expect(seen.row).toEqual({ status: 'pending', payment_status: 'paid', pnr: null, cancellation: null });
    expect(seen.desk, 'a paid booking the airline does not hold was on no list').toMatchObject({ kind: 'refund_not_made' });
    expect(seen.slackNeedsReview, 'nor in the alarm').toBe(1);
    // The other jobs keep out of it: no cancellation for the failed-refund
    // alarm to read, and nothing to book again.
    expect(seen.slackFailedRefund).toBe(0);
    expect(seen.abandonedCheckoutJob).toBe(0);
    expect(seen.customerEmails, 'and the customer promised an email either way was sent none').toBe(1);
    expect(mailer.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'jane@example.com', subject: 'Your flight booking did not go through' });
    // The customer's page already says this much, and now it is true.
    expect(seen.customerReads).toMatch(/could not be completed/);
  });
});
