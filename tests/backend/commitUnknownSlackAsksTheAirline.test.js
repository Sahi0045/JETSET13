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

// The order route (optionalProtect) sees nobody.
vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, optionalProtect: (req, _res, next) => { req.user = null; next(); } };
});

/**
 * What Slack tells staff about a commit the airline never answered.
 *
 * The needs-review alarm put it under ":rotating_light: paid but not ticketed
 * - The customer has paid and no ticket was issued. Each one needs a human:
 * ticket it, or refund it", with "PNR none". There is nothing to ticket
 * without a PNR, and "refund it" done first is Cancel & refund, which decides
 * "never booked with the airline" and voids the payment - while the airline
 * may hold the booking, and the customer was told not to book again. The desk
 * asks something else of the same row: "The airline never answered this
 * booking. What did it tell you?". The issuance-unknown hold got its own
 * section for exactly this reason; the commit-unknown row now does too, in
 * the desk's words: ask the airline whether the booking exists, record held
 * (with its record locator) or not held on the desk, and do not ticket or
 * refund it before that.
 *
 * The row is the one the real order route leaves.
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

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  const mailer = { sendBookingNotificationEmails: vi.fn().mockResolvedValue({ success: true }), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));

  // The chain as it stops when the commit's answer never arrives.
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (priced) => ({
        success: true,
        data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        if (options?.beforeCommit) await options.beforeCommit();
        throw Object.assign(new Error('We could not confirm your booking'), {
          name: 'BookingChainError',
          step: 'commit',
          committed: 'unknown',
          code: 504,
          operation: 'PNR_AddMultiElements',
          technicalError: 'timeout of 25000ms exceeded',
        });
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

/** The real order route, to the row a commit that never answered leaves. */
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
  expect(table.row(REF).booking_details.pnr).toBeUndefined();
  return table.row(REF);
};

/** An ordinary paid reservation nobody ticketed, with no flag. */
const ordinaryUnticketed = () => ({
  booking_reference: 'FLTPNR2',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 412,
  created_at: new Date().toISOString(),
  booking_details: { pnr: 'XYZ789', gds: { ticketed: false } },
});

describe('Slack on a paid commit that never answered', () => {
  it('asks staff to find out from the airline and record it on the desk - not "ticket it, or refund it"', async () => {
    const row = await commitNeverAnswered();
    const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');

    const picked = selectUnannounced([row]);
    expect(picked).toHaveLength(1);
    const message = buildMessage(picked);

    expect(message).not.toMatch(/ticket it, or refund it/);
    expect(message).not.toMatch(/paid but not ticketed/);
    expect(message).toMatch(/^:question: \*1 booking paid, the airline never answered when it was booked\*/);
    expect(message).toMatch(/Check with the airline whether it holds this booking/);
    expect(message).toMatch(/record what it said on the desk: held, with its record locator, or not held/);
    expect(message).toMatch(/Do NOT ticket, rebook or refund it before that/);
    // The booking's own line: no PNR, and the call that never answered.
    expect(message).toMatch(/\*FLTUNK1\* — pending\/paid, 291 USD\nPNR none · ticketed: NO/);
    expect(message).toMatch(/Amadeus PNR_AddMultiElements: timeout of 25000ms exceeded/);
  });

  it('beside an ordinary reservation never ticketed: each under its own heading, that one as before', async () => {
    const row = await commitNeverAnswered();
    const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');

    const message = buildMessage(selectUnannounced([row, ordinaryUnticketed()]));

    const [commitPart, unticketedPart] = message.split(':rotating_light:');
    expect(commitPart).toMatch(/the airline never answered/);
    expect(commitPart).toMatch(/\*FLTUNK1\*/);
    expect(commitPart).not.toMatch(/FLTPNR2/);
    expect(unticketedPart).toMatch(/^ \*1 booking paid but not ticketed\*/);
    expect(unticketedPart).toMatch(/ticket it, or refund it/);
    expect(unticketedPart).toMatch(/\*FLTPNR2\*[^\n]*\nPNR XYZ789 · ticketed: NO/);
    expect(unticketedPart).not.toMatch(/FLTUNK1/);
  });
});

// Fences: the commit's other states keep their own sections.
describe('the same commit, later', () => {
  it('under a cancel carried out and not recorded: that section, as before', async () => {
    const row = await commitNeverAnswered();
    row.booking_details.needs_review = {
      reason: 'cancellation carried out but not recorded: no airline reservation, payment VOID 291 USD; '
        + 'check the airline and ARC Pay and record it by hand',
      source: 'cancellation', unrecorded: true, amadeusCancelled: false, at: new Date().toISOString(), paymentAction: 'VOID', refundAmount: 291,
      previous: row.booking_details.needs_review,
    };
    const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');

    const message = buildMessage(selectUnannounced([row]));

    expect(message).toMatch(/^:warning: \*1 cancellation carried out but not recorded\*/);
    expect(message).not.toMatch(/never answered when it was booked/);
  });

  it('cancelled and refunded by staff before anyone knew: not announced, as before', async () => {
    const row = { ...(await commitNeverAnswered()), status: 'cancelled', payment_status: 'refunded' };
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');

    expect(selectUnannounced([row])).toHaveLength(0);
  });
});
