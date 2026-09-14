import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A cross-site write cannot ride a customer's session through optionalProtect.
 *
 * `protect` has required the double-submit token on cookie-authenticated writes
 * since the cookie cutover; `optionalProtect` checked nothing. It guards writes
 * that act as the signed-in user - the payments router (checkout, cancel, the
 * admin actions that read the cookie themselves), POST /flights/order,
 * inquiries, visa applications, the chatbot - so only the cookie's
 * SameSite=lax stood between a cross-site form and those.
 *
 * The site's own pages mostly send plain same-origin fetches without the token,
 * so the browser's own headers (Sec-Fetch-Site, Origin) are accepted as proof
 * too. Everything without a cookie - guests, the mobile app's bearer token, the
 * booking queue's replay - is untouched.
 */

process.env.JWT_SECRET ||= 'test-jwt-secret-optional-protect-csrf';

const USER_ID = '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

const { cancel } = vi.hoisted(() => ({ cancel: vi.fn() }));

vi.mock('../../backend/models/user.model.js', async (importOriginal) => ({
  ...(await importOriginal()),
  default: {
    findById: vi.fn(async (id) => (id === USER_ID ? { id: USER_ID, email: 'customer@example.com', role: 'user', password: 'hash' } : null)),
    findByEmail: vi.fn(async () => null),
    create: vi.fn(),
  },
}));

vi.mock('../../backend/routes/payment/operations.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleCancelBookingAction: (req, res) => cancel(req, res),
}));

const token = () => jwt.sign({ id: USER_ID }, process.env.JWT_SECRET);
const sessionCookie = () => `jt_access=${token()}; jt_csrf=csrf-123`;

const makeProbeApp = async () => {
  const { optionalProtect } = await import('../../backend/middleware/auth.middleware.js');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const probe = (req, res) => res.json({ userId: req.user?.id ?? null, sawCookie: Boolean(req.cookies?.jt_access) });
  app.post('/probe', optionalProtect, probe);
  app.get('/probe', optionalProtect, probe);
  return app;
};

const send = (app, { method = 'post', cookie = true, headers = {} } = {}) => {
  let req = request(app)[method]('/probe');
  if (cookie) req = req.set('Cookie', sessionCookie());
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return method === 'post' ? req.send({}) : req;
};

const actsAs = async (app, options) => (await send(app, options)).body;

beforeEach(() => {
  vi.resetModules();
});

describe('a write carrying the session cookie', () => {
  it('acts as the customer when the page echoes the CSRF token', async () => {
    const app = await makeProbeApp();
    const body = await actsAs(app, { headers: { 'x-csrf-token': 'csrf-123', Origin: 'https://evil.example' } });
    expect(body.userId).toBe(USER_ID);
  });

  // PaymentCallback's reconcile, payment links, the request form, visa and the
  // chatbot all post without the token.
  it("acts as the customer on the site's own fetch that does not echo the token", async () => {
    const app = await makeProbeApp();
    const body = await actsAs(app, { headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://www.jetsetterss.com' } });
    expect(body.userId).toBe(USER_ID);
  });

  it('is a guest when it comes from another site, and handlers never see the cookie', async () => {
    const app = await makeProbeApp();
    const body = await actsAs(app, { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } });
    expect(body).toEqual({ userId: null, sawCookie: false });

    const guessed = await actsAs(app, { headers: { 'Sec-Fetch-Site': 'cross-site', 'x-csrf-token': 'guessed' } });
    expect(guessed.userId).toBeNull();
  });

  // Firefox before 90 and Safari before 16.4 send no Sec-Fetch-Site.
  it('is judged by its Origin when the browser sends no Fetch Metadata', async () => {
    const app = await makeProbeApp();
    expect((await actsAs(app, { headers: { Origin: 'https://evil.example' } })).userId).toBeNull();
    expect((await actsAs(app, { headers: { Origin: 'https://www.jetsetterss.com.evil.example' } })).userId).toBeNull();
    // A sandboxed frame or a no-referrer page.
    expect((await actsAs(app, { headers: { Origin: 'null' } })).userId).toBeNull();

    expect((await actsAs(app, { headers: { Origin: 'https://www.jetsetterss.com' } })).userId).toBe(USER_ID);
    expect((await actsAs(app, { headers: { Origin: 'https://jetsetterss.com' } })).userId).toBe(USER_ID);
  });

  it("accepts this host's own origin, as a preview deployment calls itself", async () => {
    const app = await makeProbeApp();
    const body = await actsAs(app, { headers: { Host: 'jetset-13-preview.vercel.app', Origin: 'http://jetset-13-preview.vercel.app' } });
    expect(body.userId).toBe(USER_ID);
  });

  it('checks a same-site subdomain by its Origin', async () => {
    const app = await makeProbeApp();
    expect((await actsAs(app, { headers: { 'Sec-Fetch-Site': 'same-site', Origin: 'https://blog.jetsetterss.com' } })).userId).toBeNull();
    expect((await actsAs(app, { headers: { 'Sec-Fetch-Site': 'same-site', Origin: 'https://jetsetterss.com' } })).userId).toBe(USER_ID);
  });

  // Every browser attaches Origin to a cross-site write and a page cannot remove
  // it, so a request with neither header is a native client or a server.
  it('acts as the customer when no browser sent it', async () => {
    const app = await makeProbeApp();
    expect((await actsAs(app)).userId).toBe(USER_ID);
  });

  it('still honours a bearer token when the cookie is set aside', async () => {
    const app = await makeProbeApp();
    const body = await actsAs(app, { headers: { 'Sec-Fetch-Site': 'cross-site', Authorization: `Bearer ${token()}` } });
    expect(body.userId).toBe(USER_ID);
  });

  it('never checks a read', async () => {
    const app = await makeProbeApp();
    const body = await actsAs(app, { method: 'get', headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } });
    expect(body.userId).toBe(USER_ID);
  });
});

describe('requests without a session cookie', () => {
  it('let a guest through, whatever site they come from', async () => {
    const app = await makeProbeApp();
    const res = await send(app, { cookie: false, headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });

  it("let the mobile app's bearer token through", async () => {
    const app = await makeProbeApp();
    const body = await actsAs(app, { cookie: false, headers: { Authorization: `Bearer ${token()}` } });
    expect(body.userId).toBe(USER_ID);
  });

  // The booking queue and the abandoned-checkout job POST /api/flights/order
  // from inside the API process with no cookie.
  it('let a server-to-server replay through', async () => {
    const app = await makeProbeApp();
    const res = await send(app, { cookie: false, headers: { 'x-booking-queue-replay': '1' } });
    expect(res.status).toBe(200);
  });
});

describe('the payments router', () => {
  const makePaymentApp = async () => {
    cancel.mockReset().mockImplementation((req, res) => res.json({
      userId: req.user?.id ?? null,
      sawCookie: Boolean(req.cookies?.jt_access),
    }));
    const routes = (await import('../../backend/routes/payment.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/payments', routes);
    return app;
  };

  const cancelFrom = (app, headers) => {
    let req = request(app).post('/api/payments?action=cancel-booking').set('Cookie', sessionCookie());
    for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
    return req.send({ bookingReference: 'FLT123' });
  };

  // getCaller and getCallerInfo read jt_access themselves, so ignoring the
  // session in req.user alone would not be enough.
  it("hands a cross-site cancel to the handler with neither the customer nor their cookie", async () => {
    const app = await makePaymentApp();
    const res = await cancelFrom(app, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' });
    expect(res.body).toEqual({ userId: null, sawCookie: false });
  });

  it('hands the customer through when the cancel comes from the site', async () => {
    const app = await makePaymentApp();
    const res = await cancelFrom(app, { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://www.jetsetterss.com' });
    expect(res.body).toEqual({ userId: USER_ID, sawCookie: true });
  });
});
