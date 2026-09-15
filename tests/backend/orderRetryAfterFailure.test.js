import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * POST /order never books a booking whose fulfilment already failed.
 *
 * After a failure whose reversal also failed, the row keeps its status and is
 * flagged "charge not reversed" with `fulfillment_failed`. A retry of the order
 * - the customer's "Try again" - checked only the duplicate-payment flag, so it
 * booked the trip on a payment a person was about to refund. And the failures
 * that gave no code answered with none, so a client could not tell that
 * "Try again" was the wrong thing to offer.
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

const REF = 'FLTRETRY1';

const bookableOffer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT7H45M',
    segments: [{ id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614', aircraft: { code: '7M9' }, numberOfStops: 0 }],
  }],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{ travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT', price: { currency: 'USD', total: '291.00', base: '110.00' }, fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' }] }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [] },
};

const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];

const paidCheckout = (details = {}, over = {}) => ({
  id: 'bk-r1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: bookableOffer, passengerData: JANE } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...details,
  },
});

const orderBody = () => ({
  bookingReference: REF,
  orderId: REF,
  transactionId: `SI-${REF}`,
  contactInfo: { email: 'jane@example.com' },
  travelers: JANE,
});

const createFlightOrder = vi.fn();

const appWith = async (rows) => {
  table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return () => request(app).post('/api/flights/order').send(orderBody());
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  createFlightOrder.mockReset();
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (offer) => ({
        success: true,
        data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder,
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.doUnmock('../../backend/services/emailService.js');
});

describe('a booking whose fulfilment already failed', () => {
  it('is not sent to the airline again, and nothing moves - not even a gateway call', async () => {
    const place = await appWith([paidCheckout({
      fulfillment_failed: { at: '2026-09-15T08:00:00Z', error: 'step=sell', reversal: { reversed: false, action: 'FAILED' } },
      needs_review: { reason: 'charge not reversed after the booking failed', ticketed: false, at: '2026-09-15T08:00:00Z' },
      gds_chain: { state: 'failed', failedStep: 'sell', finishedAt: '2026-09-15T08:00:00Z' },
    })]);

    const res = await place();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_FAILED');
    expect(res.body.needsReview).toBe(true);
    expect(res.body.error).toMatch(/not sent to the airline again/);
    expect(res.body.bookingFailed).toBeUndefined();
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(table.writes).toEqual([]);
  });

  it('is refused the same way when a human is sorting the booking out', async () => {
    const place = await appWith([paidCheckout({
      needs_review: { reason: 'Paid, but the customer never came back to finish booking.', source: 'abandoned-checkout', ticketed: false, at: '2026-09-15T08:00:00Z' },
    })]);

    const res = await place();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_NEEDS_REVIEW');
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('answers with a terminal code, and its "Try again" is refused', async () => {
    createFlightOrder.mockRejectedValue(Object.assign(new Error('no seats'), { step: 'sell', committed: false, code: 409 }));
    // The gateway refuses both the void and the refund.
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });
    const place = await appWith([paidCheckout()]);

    const failed = await place();

    expect(failed.status).toBe(502);
    expect(failed.body.bookingFailed).toBe(true);
    expect(failed.body.refunded).toBe(false);
    expect(failed.body.code).toBe('BOOKING_FAILED');
    expect(table.row(REF).booking_details.fulfillment_failed).toBeTruthy();

    const retry = await place();

    expect(retry.status).toBe(409);
    expect(retry.body.code).toBe('BOOKING_FAILED');
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
  });
});

describe('the review flags the success path writes itself', () => {
  it('do not stop a retry finding the booking it made', async () => {
    const place = await appWith([paidCheckout({
      pnr: 'ABC123',
      gds: { ticketed: true },
      needs_review: { reason: 'ticket_numbers_not_retrieved', ticketed: true, at: '2026-09-15T08:00:00Z' },
    }, { status: 'confirmed' })]);

    const res = await place();

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
  });
});
