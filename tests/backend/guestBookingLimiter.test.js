import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wrong guesses at a guest booking's email are capped.
 *
 * A guest opens their booking with its reference and the email it was made
 * with, and cancels it the same way. Both were bounded only by the general
 * 300/min limiter, so anyone holding a reference - references sit in URLs and
 * emails - could try hundreds of addresses a minute until one opened it.
 *
 * On Lightsail every visitor behind one Vercel edge shares an address, which is
 * why the count is per address and reference, not per address.
 */

const EDGE = '203.0.113.7';
const OTHER_EDGE = '198.51.100.23';

// The payment router's cancel and checkout, stood in for so only the limiter in
// front of them is under test.
const { cancel, checkout } = vi.hoisted(() => ({ cancel: vi.fn(), checkout: vi.fn() }));

vi.mock('../../backend/routes/payment/operations.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleCancelBookingAction: (req, res) => cancel(req, res),
}));
vi.mock('../../backend/routes/payment/checkout.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleHostedCheckout: (req, res) => checkout(req, res),
}));

const guestRow = (reference, email) => ({
  id: `id-${reference}`,
  booking_reference: reference,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  user_id: null,
  created_at: '2026-09-12T10:00:00Z',
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe', email }],
  booking_details: { pnr: 'ABC123', customer_email: email },
});

const ROWS = {
  FLTGUEST1: guestRow('FLTGUEST1', 'jane.doe@example.com'),
  FLTGUEST2: guestRow('FLTGUEST2', 'sam.doe@example.com'),
};

// The reference each query asked for, so an unknown one finds nothing.
let supabase;
const makeFlightApp = async () => {
  supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => {
    let wanted = null;
    const chain = {};
    for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn(() => chain);
    chain.or = vi.fn((filter) => {
      wanted = /booking_reference\.eq\.([^,]+)/.exec(filter)?.[1] ?? null;
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => ({ data: ROWS[wanted] ?? null, error: null }));
    chain.single = chain.maybeSingle;
    return chain;
  });
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/flights', routes);
  // Vercel mounts the same router a second time without the prefix.
  app.use('/flights', routes);
  return app;
};

const open = (app, reference, { email, ip = EDGE, prefix = '/api/flights' } = {}) => {
  const req = request(app).get(`${prefix}/bookings/${reference}`).set('X-Forwarded-For', ip);
  return email === undefined ? req : req.set('x-booking-email', email);
};

beforeEach(() => {
  vi.resetModules();
  delete process.env.RATE_LIMIT_GUEST_BOOKING_MAX;
});

describe('opening a guest booking with an email', () => {
  it('allows ten wrong emails in a quarter of an hour, then asks the guest to wait', async () => {
    const app = await makeFlightApp();
    for (let i = 0; i < 10; i += 1) {
      const res = await open(app, 'FLTGUEST1', { email: `guess${i}@example.com` });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Booking not found');
    }

    const limited = await open(app, 'FLTGUEST1', { email: 'guess10@example.com' });
    expect(limited.status).toBe(429);
    expect(limited.body.success).toBe(false);
    expect(limited.body.error).toMatch(/wrong email for this booking.*wait 15 minutes/i);
  });

  it('lets a guest who mistypes a few times in', async () => {
    const app = await makeFlightApp();
    for (const typo of ['jane.do@example.com', 'jane.doe@exmple.com', 'janedoe@example.com']) {
      expect((await open(app, 'FLTGUEST1', { email: typo })).status).toBe(404);
    }
    const res = await open(app, 'FLTGUEST1', { email: 'Jane.Doe@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.bookingReference).toBe('FLTGUEST1');
  });

  it('never counts a booking that opened, however often it is reopened', async () => {
    const app = await makeFlightApp();
    for (let i = 0; i < 25; i += 1) {
      expect((await open(app, 'FLTGUEST1', { email: 'jane.doe@example.com' })).status).toBe(200);
    }
  });

  // The confirmation email's link asks without an email first, then shows the
  // email form. A request with no email cannot open anyone's booking.
  it('never counts a request that offers no email', async () => {
    const app = await makeFlightApp();
    for (let i = 0; i < 25; i += 1) {
      expect((await open(app, 'FLTGUEST1')).status).toBe(404);
    }
    expect((await open(app, 'FLTGUEST1', { email: 'jane.doe@example.com' })).status).toBe(200);
  });

  it('answers a real reference and an unknown one alike, and refuses both before looking', async () => {
    const app = await makeFlightApp();
    for (let i = 0; i < 5; i += 1) {
      expect((await open(app, 'FLTGUEST1', { email: `guess${i}@example.com` })).status).toBe(404);
      expect((await open(app, 'FLTNOSUCH', { email: `guess${i}@example.com` })).status).toBe(404);
    }
    for (let i = 5; i < 10; i += 1) {
      await open(app, 'FLTGUEST1', { email: `guess${i}@example.com` });
      await open(app, 'FLTNOSUCH', { email: `guess${i}@example.com` });
    }

    const lookups = supabase.from.mock.calls.length;
    const real = await open(app, 'FLTGUEST1', { email: 'jane.doe@example.com' });
    const unknown = await open(app, 'FLTNOSUCH', { email: 'jane.doe@example.com' });
    expect(real.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(real.body).toEqual(unknown.body);
    expect(supabase.from.mock.calls.length).toBe(lookups);
  });

  // Everyone behind one Vercel edge shares an address on Lightsail.
  it("does not lock one guest out because of another guest's attempts", async () => {
    const app = await makeFlightApp();
    for (let i = 0; i < 11; i += 1) await open(app, 'FLTGUEST1', { email: `guess${i}@example.com` });
    expect((await open(app, 'FLTGUEST1', { email: 'jane.doe@example.com' })).status).toBe(429);

    expect((await open(app, 'FLTGUEST2', { email: 'sam.doe@example.com' })).status).toBe(200);
    expect((await open(app, 'FLTGUEST1', { email: 'jane.doe@example.com', ip: OTHER_EDGE })).status).toBe(200);
  });

  it('counts the reference the same in any letter case, and on the unprefixed mount', async () => {
    const app = await makeFlightApp();
    for (let i = 0; i < 5; i += 1) await open(app, 'FLTGUEST1', { email: `guess${i}@example.com` });
    for (let i = 5; i < 10; i += 1) await open(app, 'fltguest1', { email: `guess${i}@example.com`, prefix: '/flights' });
    expect((await open(app, 'FLTGUEST1', { email: 'jane.doe@example.com' })).status).toBe(429);
  });

  it('can be tuned', async () => {
    process.env.RATE_LIMIT_GUEST_BOOKING_MAX = '2';
    const app = await makeFlightApp();
    await open(app, 'FLTGUEST1', { email: 'a@example.com' });
    await open(app, 'FLTGUEST1', { email: 'b@example.com' });
    expect((await open(app, 'FLTGUEST1', { email: 'c@example.com' })).status).toBe(429);
  });
});

describe('cancelling a guest booking with an email', () => {
  const makePaymentApp = async () => {
    cancel.mockReset().mockImplementation((req, res) => (req.body.email === 'booker@example.com'
      ? res.json({ success: true })
      : res.status(403).json({ success: false, code: 'NOT_AUTHORIZED' })));
    checkout.mockReset().mockImplementation((req, res) => res.status(400).json({ success: false, error: 'Price changed' }));
    const routes = (await import('../../backend/routes/payment.routes.js')).default;
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/payments', routes);
    return app;
  };

  const post = (app, action, body) => request(app)
    .post(`/api/payments?action=${action}`)
    .set('X-Forwarded-For', EDGE)
    .send(body);

  it('shares the limit, and refuses the eleventh wrong email without reaching the cancel', async () => {
    const app = await makePaymentApp();
    for (let i = 0; i < 10; i += 1) {
      expect((await post(app, 'cancel-booking', { bookingReference: 'FLTGUEST1', email: `guess${i}@example.com` })).status).toBe(403);
    }
    const limited = await post(app, 'cancel-booking', { bookingReference: 'FLTGUEST1', email: 'booker@example.com' });
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/wait 15 minutes/i);
    expect(cancel).toHaveBeenCalledTimes(10);
  });

  it('lets the booker cancel after a few typos', async () => {
    const app = await makePaymentApp();
    await post(app, 'cancel-booking', { bookingReference: 'FLTGUEST1', email: 'boker@example.com' });
    await post(app, 'cancel-booking', { bookingReference: 'FLTGUEST1', email: 'booker@exmple.com' });
    expect((await post(app, 'cancel-booking', { bookingReference: 'FLTGUEST1', email: 'booker@example.com' })).status).toBe(200);
  });

  // A signed-in owner cancels by session and sends no email.
  it('never counts a cancel that offers no email', async () => {
    const app = await makePaymentApp();
    for (let i = 0; i < 15; i += 1) {
      expect((await post(app, 'cancel-booking', { bookingReference: 'FLTGUEST1' })).status).toBe(403);
    }
  });

  it('never throttles a failing checkout, which carries an email too', async () => {
    const app = await makePaymentApp();
    for (let i = 0; i < 15; i += 1) {
      const res = await post(app, 'hosted-checkout', { orderId: 'FLTGUEST1', bookingReference: 'FLTGUEST1', email: 'payer@example.com' });
      expect(res.status).toBe(400);
    }
    expect(checkout).toHaveBeenCalledTimes(15);
  });
});
