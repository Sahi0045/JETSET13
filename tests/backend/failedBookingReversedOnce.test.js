import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// The payment handlers take their Supabase client from arcpay.config.js; see
// orderRetriesAndRefunds.test.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A payment is reversed once, however many requests find the booking unusable.
 *
 * Every refusal before the booking chain is claimed - no verified fare, an
 * offer that cannot be read, travellers that do not match - reverses the
 * payment. Two requests for one order at once (a double "Try again", or the
 * customer's order racing the abandoned-checkout job or the queue) both got
 * there, and both reversed it: the failure marker written before the gateway
 * was asked was checked, and the reversal sent anyway.
 */

const REF = 'FLTTWICE1';

const offer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{ duration: 'PT7H45M', segments: [{ id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614', aircraft: { code: '7M9' }, numberOfStops: 0 }] }],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{ travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT', price: { currency: 'USD', total: '291.00', base: '110.00' }, fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' }] }],
};

/** Paid, but checkout kept no verified fare: refused, and reversed, before any claim. */
const unverifiedCheckout = (details = {}) => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-15T10:00:00Z',
  booking_details: {
    order_id: REF,
    success_indicator: 'SI-1',
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01' }] } },
    ...details,
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: 'SI-1',
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

const reverse = vi.fn();

const appWith = async (rows) => {
  vi.doMock('../../backend/routes/payment/operations.handlers.js', async () => {
    const actual = await vi.importActual('../../backend/routes/payment/operations.handlers.js');
    return { ...actual, reverseArcPaymentForOrder: reverse };
  });
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
  reverse.mockReset();
  // The gateway takes a moment, so the second request arrives while the first
  // is still reversing.
  reverse.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { reversed: true, action: 'VOID', transactionId: `void-fail-${REF}` };
  });
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { priceFlightOffer: vi.fn(), createFlightOrder: vi.fn() },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
});

afterEach(() => {
  vi.doUnmock('../../backend/routes/payment/operations.handlers.js');
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

/** An Express response that keeps what it was sent. */
const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const failure = { orderId: REF, bookingReference: REF, amount: 291, errorMsg: 'checkout kept no verified fare for this offer', status: 400, code: 'OFFER_NOT_VERIFIED' };

describe('two requests that both find the booking unusable', () => {
  // Both past the route's early checks, both reading a row with no marker:
  // only the one whose marker lands reverses.
  it('reverse the payment once', async () => {
    const { table } = await appWith([unverifiedCheckout()]);
    const { refundOnFulfillmentFailure } = await import('../../backend/routes/flight.routes.js');

    const [first, second] = [response(), response()];
    await Promise.all([refundOnFulfillmentFailure(first, failure), refundOnFulfillmentFailure(second, failure)]);

    expect(reverse).toHaveBeenCalledTimes(1);
    expect(first.body.bookingFailed).toBe(true);
    expect(second.body.bookingFailed).toBe(true);
    // The row says what the one reversal did, not "charge not reversed".
    const row = table.row(REF);
    expect(row.booking_details.fulfillment_failed.reversal).toMatchObject({ action: 'VOID', reversed: true });
    expect(row.booking_details.needs_review).toBeUndefined();
    expect(row.payment_status).toBe('refunded');
  });

  it('tells the one that did not reverse that the payment is on its way back, not that it could not be reversed', async () => {
    await appWith([unverifiedCheckout({
      fulfillment_failed: { at: new Date().toISOString(), error: 'earlier', reversal: { action: 'IN_PROGRESS' } },
    })]);
    const { refundOnFulfillmentFailure } = await import('../../backend/routes/flight.routes.js');

    const res = response();
    await refundOnFulfillmentFailure(res, failure);

    expect(reverse).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ bookingFailed: true, refunded: false, refundAction: 'IN_PROGRESS' });
    expect(res.body.error).toMatch(/being returned to your original payment method/);
    expect(res.body.error).not.toMatch(/could not be reversed/);
  });

  it('reverses a payment whose earlier reversal was abandoned', async () => {
    await appWith([unverifiedCheckout({
      fulfillment_failed: { at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), error: 'earlier', reversal: { action: 'IN_PROGRESS' } },
    })]);
    const { refundOnFulfillmentFailure } = await import('../../backend/routes/flight.routes.js');

    await refundOnFulfillmentFailure(response(), failure);

    expect(reverse).toHaveBeenCalledTimes(1);
  });
});

describe('a reversal left IN_PROGRESS', () => {
  it('is taken over only once it is older than any reversal takes', async () => {
    const { reversalAbandoned, REVERSAL_CLAIM_TTL_MS } = await import('../../backend/routes/flight.routes.js');
    const now = Date.parse('2026-09-30T12:00:00Z');
    const at = (msAgo) => new Date(now - msAgo).toISOString();

    expect(reversalAbandoned({ at: at(REVERSAL_CLAIM_TTL_MS + 1), reversal: { action: 'IN_PROGRESS' } }, now)).toBe(true);
    expect(reversalAbandoned({ at: at(60_000), reversal: { action: 'IN_PROGRESS' } }, now)).toBe(false);
    // A finished reversal is never taken over, however old.
    expect(reversalAbandoned({ at: at(REVERSAL_CLAIM_TTL_MS * 10), reversal: { action: 'VOID', reversed: true } }, now)).toBe(false);
  });
});
