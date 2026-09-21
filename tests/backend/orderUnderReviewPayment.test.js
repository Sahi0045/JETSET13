import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A retry of a booking under review says what its payment record says.
 *
 * The order route answers 409 BOOKING_NEEDS_REVIEW for any flagged booking that
 * is not cancelled - before the booking-disabled gate, so in production today -
 * and the order page rendered it as "Your payment is held with this booking
 * ... do not book this trip again", whatever the row said. A flagged row
 * refunded from the Payments tab (which writes payment_status and nothing else)
 * reads refunded, and a cancel that moved the money and could not record it
 * leaves the row reading paid with an unrecorded flag on it. The answer now
 * carries paymentState, read from the row, and its words follow it.
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

const REF = 'FLTPAYST1';

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

const ABANDONED = { reason: 'Paid, but the customer never came back to finish booking.', source: 'abandoned-checkout', ticketed: false, at: '2026-09-15T08:00:00Z' };

describe('a retry of a booking under review', () => {
  it('whose payment was refunded: says so, and does not claim it is held or under review', async () => {
    const place = await appWith([paidCheckout({ needs_review: ABANDONED }, { payment_status: 'refunded' })]);

    const res = await place();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_NEEDS_REVIEW');
    expect(res.body.paymentState).toBe('returned');
    expect(res.body.error).toMatch(/Your payment for it has been refunded/);
    expect(res.body.error).not.toMatch(/reviewing|Nothing more has been charged|heard from us/);
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('whose payment was partly refunded: says part of it was', async () => {
    const place = await appWith([paidCheckout({ needs_review: ABANDONED }, { payment_status: 'partially_refunded' })]);

    const res = await place();

    expect(res.body.paymentState).toBe('partly_returned');
    expect(res.body.error).toMatch(/Part of your payment for it has been refunded/);
  });

  it('whose payment is still held: says it is held (unchanged wording)', async () => {
    const place = await appWith([paidCheckout({ needs_review: ABANDONED })]);

    const res = await place();

    expect(res.body.paymentState).toBe('held');
    expect(res.body.error).toMatch(/our team is reviewing it/);
    expect(res.body.error).toMatch(/Nothing more has been charged/);
  });

  it('whose cancel moved the money and was not recorded: claims neither held nor refunded', async () => {
    const place = await appWith([paidCheckout({
      needs_review: {
        reason: 'cancellation carried out but not recorded: no airline reservation, payment VOID 291 USD; check the airline and ARC Pay and record it by hand',
        source: 'cancellation',
        unrecorded: true,
        paymentAction: 'VOID',
        refundAmount: 291,
        at: '2026-09-21T08:00:00Z',
      },
    })]);

    const res = await place();

    expect(res.status).toBe(409);
    expect(res.body.paymentState).toBe('unconfirmed');
    expect(res.body.error).not.toMatch(/refunded/);
  });

  it('that already failed says the same of its money', async () => {
    const place = await appWith([paidCheckout({
      fulfillment_failed: { at: '2026-09-15T08:00:00Z', error: 'step=sell', reversal: { reversed: false, action: 'FAILED' } },
      needs_review: { reason: 'charge not reversed after the booking failed', ticketed: false, at: '2026-09-15T08:00:00Z' },
    })]);

    const res = await place();

    expect(res.body.code).toBe('BOOKING_FAILED');
    expect(res.body.paymentState).toBe('held');
  });
});
