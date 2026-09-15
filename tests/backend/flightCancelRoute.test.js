import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Manage Booking's cancel runs where the airline answers.
 *
 * It went through POST /api/payments?action=cancel-booking, and the payments
 * router runs on Vercel, which Amadeus does not allow-list. Every cancel of a
 * booking with a PNR failed at the airline step: a 502 "could not cancel with
 * the airline", the booking flagged for review, and Slack paged about a failure
 * that was only ever where the code ran. For a guest it was the only way to
 * cancel.
 *
 * POST /api/flights/order/:ref/cancel is under /api/flights, which vercel.json
 * forwards to Lightsail, and runs the same orchestrated handler. The payments
 * router, on Vercel, now refuses such a booking before touching anything.
 */

const { orchestrator, real } = vi.hoisted(() => ({ orchestrator: vi.fn(), real: { on: false } }));

let table = fakeBookingsTable([]);
const cancelFlightOrder = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

// The route under test in front of either a stand-in orchestrator, so only the
// route and its limiter are tested, or the real one.
vi.mock('../../backend/routes/payment/operations.handlers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    handleCancelBookingAction: (req, res) => (real.on ? actual.handleCancelBookingAction(req, res) : orchestrator(req, res)),
  };
});

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? (...args) => cancelFlightOrder(...args) : target[key]),
    }),
  };
});

// A signed-in request carries its user in a header, as in flightStaffAccess.test.js.
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

const BOOKER = 'booker@example.com';

const guestFlight = (details = {}, over = {}) => ({
  id: 'bk-1',
  booking_reference: 'FLTGUEST1',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe', email: 'traveller@example.com' }],
  ...over,
  booking_details: { pnr: 'ABC123', order_id: 'FLTGUEST1', customer_email: BOOKER, gds: { ticketed: false }, ...details },
});

const captured = () => ({
  status: 200,
  data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
});

const flightsApp = async () => {
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return app;
};

const paymentsApp = async () => {
  const routes = (await import('../../backend/routes/payment.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/payments', routes);
  return app;
};

const cancelOnFlights = (app, reference, body = {}, headers = {}) => {
  let req = request(app).post(`/api/flights/order/${reference}/cancel`);
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return req.send(body);
};

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '');
  real.on = false;
  table = fakeBookingsTable([]);
  orchestrator.mockReset();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(captured());
  delete process.env.RATE_LIMIT_GUEST_BOOKING_MAX;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/flights/order/:ref/cancel', () => {
  it("runs the orchestrated cancel with the guest's email and reason, and answers with what it said", async () => {
    const answer = { success: true, message: 'Your booking is cancelled.', cancellation: { paymentAction: 'VOID', refundAmount: 291 }, booking: { reference: 'FLTGUEST1', status: 'cancelled' } };
    orchestrator.mockImplementation(async (_req, res) => res.status(200).json(answer));

    const res = await cancelOnFlights(await flightsApp(), 'FLTGUEST1', { email: BOOKER, reason: 'Change of plans' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(answer);
    const [req] = orchestrator.mock.calls[0];
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ bookingReference: 'FLTGUEST1', reason: 'Change of plans', email: BOOKER });
    expect(req.user).toBeNull();
  });

  it('carries a signed-in owner to the handler, with no email needed', async () => {
    orchestrator.mockImplementation(async (_req, res) => res.json({ success: true }));
    const owner = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };

    await cancelOnFlights(await flightsApp(), 'FLTOWNED1', {}, { 'x-test-user': JSON.stringify(owner) });

    const [req] = orchestrator.mock.calls[0];
    expect(req.user).toEqual(owner);
    expect(req.body).toEqual({ bookingReference: 'FLTOWNED1', reason: 'Customer request' });
  });

  it("keeps the handler's refusal: its status and its body", async () => {
    const refusal = { success: false, code: 'CANCEL_IN_PROGRESS', error: 'This booking is already being cancelled.', message: 'This booking is already being cancelled.' };
    orchestrator.mockImplementation(async (_req, res) => res.status(409).json(refusal));

    const res = await cancelOnFlights(await flightsApp(), 'FLTGUEST1', { email: BOOKER });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(refusal);
  });

  it('caps wrong emails for one reference, and refuses the eleventh before reaching the cancel', async () => {
    orchestrator.mockImplementation(async (req, res) => (req.body.email === BOOKER
      ? res.json({ success: true })
      : res.status(404).json({ success: false, code: 'BOOKING_NOT_FOUND' })));
    const app = await flightsApp();

    for (let i = 0; i < 10; i += 1) {
      expect((await cancelOnFlights(app, 'FLTGUEST1', { email: `guess${i}@example.com` })).status).toBe(404);
    }
    const limited = await cancelOnFlights(app, 'FLTGUEST1', { email: BOOKER });

    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/wait 15 minutes/i);
    expect(orchestrator).toHaveBeenCalledTimes(10);
  });

  it('never counts a cancel that offers no email', async () => {
    orchestrator.mockImplementation(async (_req, res) => res.status(403).json({ success: false }));
    const app = await flightsApp();

    for (let i = 0; i < 15; i += 1) {
      expect((await cancelOnFlights(app, 'FLTGUEST1', {})).status).toBe(403);
    }
    expect(orchestrator).toHaveBeenCalledTimes(15);
  });

  describe('with the real handler', () => {
    beforeEach(() => { real.on = true; });

    it('cancels a guest booking at the airline and returns the payment, with the booker\'s email', async () => {
      table = fakeBookingsTable([guestFlight()]);

      const res = await cancelOnFlights(await flightsApp(), 'FLTGUEST1', { email: BOOKER, reason: 'Change of plans' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cancellation.amadeusCancelled).toBe(true);
      expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
      expect(table.row('FLTGUEST1').status).toBe('cancelled');
      expect(table.row('FLTGUEST1').booking_details.needs_review).toBeUndefined();
    });

    it('gives a stranger one answer, whether or not the booking exists', async () => {
      table = fakeBookingsTable([guestFlight()]);
      const app = await flightsApp();

      const wrongEmail = await cancelOnFlights(app, 'FLTGUEST1', { email: 'traveller@example.com' });
      const noSuchBooking = await cancelOnFlights(app, 'FLTNOSUCH1', { email: BOOKER });

      expect(wrongEmail.status).toBe(404);
      expect(noSuchBooking.status).toBe(404);
      expect(wrongEmail.body).toEqual(noSuchBooking.body);
      expect(wrongEmail.body.code).toBe('BOOKING_NOT_FOUND');
      expect(cancelFlightOrder).not.toHaveBeenCalled();
      expect(table.writes).toEqual([]);
    });
  });
});

describe('the payments router cancel, running on Vercel', () => {
  beforeEach(() => {
    real.on = true;
    vi.stubEnv('VERCEL', '1');
  });

  const cancelOnPayments = (app, body) => request(app).post('/api/payments?action=cancel-booking').send(body);

  it('refuses a flight with a PNR before claiming or writing anything, and names the endpoint that can', async () => {
    table = fakeBookingsTable([guestFlight()]);

    const res = await cancelOnPayments(await paymentsApp(), { bookingReference: 'FLTGUEST1', email: BOOKER });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CANCEL_VIA_FLIGHTS_API');
    expect(res.body.cancelEndpoint).toBe('/api/flights/order/FLTGUEST1/cancel');
    expect(res.body.error).toMatch(/Nothing has been cancelled or refunded/);
    expect(res.body.message).toBe(res.body.error);
    expect(res.body.needsReview).toBeUndefined();
    expect(cancelFlightOrder).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    // No claim, no needs_review: nothing for the alarm to page about.
    expect(table.writes).toEqual([]);
  });

  it('still gives a stranger the one signed-out answer first', async () => {
    table = fakeBookingsTable([guestFlight()]);

    const res = await cancelOnPayments(await paymentsApp(), { bookingReference: 'FLTGUEST1', email: 'stranger@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOOKING_NOT_FOUND');
  });

  it('still cancels a flight checkout that never reached the airline', async () => {
    table = fakeBookingsTable([guestFlight({ pnr: undefined }, { status: 'pending', payment_status: 'unpaid' })]);
    axios.get.mockResolvedValue({ status: 404, data: { error: { cause: 'INVALID_REQUEST' } } });

    const res = await cancelOnPayments(await paymentsApp(), { bookingReference: 'FLTGUEST1', email: BOOKER });

    expect(res.status).toBe(200);
    expect(res.body.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    expect(cancelFlightOrder).not.toHaveBeenCalled();
  });

  it('runs where Amadeus is reachable', async () => {
    vi.stubEnv('VERCEL', '');
    table = fakeBookingsTable([guestFlight()]);

    const res = await cancelOnPayments(await paymentsApp(), { bookingReference: 'FLTGUEST1', email: BOOKER });

    expect(res.status).toBe(200);
    expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
  });
});
