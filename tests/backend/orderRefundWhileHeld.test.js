import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * POST /order does not reverse a payment another request is still acting on.
 *
 * The checks before the chain claim - booking disabled, offer not verified,
 * offer not bookable, travellers incomplete or mismatched - each reverse the
 * payment. None asked whether the booking was held: a retry that failed one of
 * them refunded a payment a running chain went on to commit a PNR against, or
 * refunded in full what a cancellation was returning less its fee.
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

const REF = 'FLTHELD1';

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

// No gender: the travellers gate refunds this order.
const INCOMPLETE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01' }];

const paidCheckout = (chain, over = {}) => ({
  id: 'bk-h1',
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
    pending_booking_data: { bookingData: { originalOffer: bookableOffer } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...(chain ? { gds_chain: chain } : {}),
    ...(over.booking_details || {}),
  },
});

const orderBody = (travelers = INCOMPLETE) => ({
  bookingReference: REF,
  orderId: REF,
  transactionId: `SI-${REF}`,
  contactInfo: { email: 'jane@example.com' },
  travelers,
});

const now = () => new Date().toISOString();
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

const flags = { bookingEnabled: true };
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
  return (body, headers = {}) => {
    let req = request(app).post('/api/flights/order');
    for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
    return req.send(body);
  };
};

const expectNoRefund = (res) => {
  expect(res.body.bookingFailed).toBeUndefined();
  expect(res.body.refundAction).toBeUndefined();
  expect(axios.put).not.toHaveBeenCalled();
  expect(table.row(REF).booking_details.fulfillment_failed).toBeUndefined();
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  flags.bookingEnabled = true;
  createFlightOrder.mockReset();
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { priceFlightOffer: vi.fn().mockRejectedValue(new Error('pricing unavailable')), createFlightOrder },
    providerStatus: () => ({ bookingEnabled: flags.bookingEnabled, wsap: '1ASIWTEST' }),
  }));
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('a refusal before the chain claim', () => {
  it("does not refund while another request's chain is running", async () => {
    const place = await appWith([paidCheckout({ state: 'in_progress', startedAt: now(), claimedAt: now(), attempt: 1 })]);

    const res = await place(orderBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    expectNoRefund(res);
    expect(table.row(REF).booking_details.gds_chain.state).toBe('in_progress');
  });

  it('does not refund while a cancellation holds the booking, even with booking switched off', async () => {
    flags.bookingEnabled = false;
    const place = await appWith([paidCheckout({ state: 'cancelling', startedAt: now(), stateBeforeCancel: null })]);

    const res = await place(orderBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    expect(res.body.error).toMatch(/being cancelled/);
    expectNoRefund(res);
  });

  it('does not refund while a committed chain is still finishing', async () => {
    const place = await appWith([paidCheckout({ state: 'committed', committedAt: now() })]);

    const res = await place(orderBody());

    expect(res.status).toBe(409);
    expectNoRefund(res);
  });

  it("does not refund a booking waiting in the queue - unless this is the queue's own run", async () => {
    const place = await appWith([paidCheckout({ state: 'queued', startedAt: minutesAgo(1), queuedAt: minutesAgo(1), queueAttempts: 1 })]);

    const customer = await place(orderBody());
    expect(customer.status).toBe(409);
    expect(customer.body.code).toBe('BOOKING_IN_PROGRESS');
    expectNoRefund(customer);

    // The worker replays from this process, on the loopback address.
    const replay = await place(orderBody(), { 'x-booking-queue-replay': '1' });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('PASSENGERS_INCOMPLETE');
    expect(replay.body.bookingFailed).toBe(true);
  });

  it('refunds as before once a dead claim has expired', async () => {
    const place = await appWith([paidCheckout({ state: 'in_progress', startedAt: minutesAgo(10), attempt: 1 })]);

    const res = await place(orderBody());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSENGERS_INCOMPLETE');
    expect(res.body.bookingFailed).toBe(true);
  });

  it('refunds as before when nothing holds the booking', async () => {
    const place = await appWith([paidCheckout(null)]);

    const res = await place(orderBody());

    expect(res.status).toBe(400);
    expect(res.body.bookingFailed).toBe(true);
    expect(createFlightOrder).not.toHaveBeenCalled();
  });
});

describe('isQueueReplay', () => {
  it("is the worker's header, from this machine only", async () => {
    const { isQueueReplay } = await import('../../backend/routes/flight.routes.js');
    const req = (headers, remoteAddress) => ({ headers, socket: { remoteAddress } });

    expect(isQueueReplay(req({ 'x-booking-queue-replay': '1' }, '127.0.0.1'))).toBe(true);
    expect(isQueueReplay(req({ 'x-booking-queue-replay': '1' }, '::ffff:127.0.0.1'))).toBe(true);
    // The header is anyone's to send.
    expect(isQueueReplay(req({ 'x-booking-queue-replay': '1' }, '203.0.113.7'))).toBe(false);
    expect(isQueueReplay(req({}, '127.0.0.1'))).toBe(false);
  });
});
