import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hosted checkout checks a trip voucher's code before pricing, and an instant
 * voucher's code answers VOUCHER_WRONG_KIND - so checkout told a signed-in
 * customer which codes exist, at the general rate limit. A checkout carrying a
 * voucher code now counts its refusals against the voucher limit, per
 * customer; a checkout without one never does.
 */

const { checkout } = vi.hoisted(() => ({ checkout: vi.fn() }));

vi.mock('../../backend/routes/payment/checkout.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleHostedCheckout: (req, res) => checkout(req, res),
}));

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => ({
  ...(await importOriginal()),
  optionalProtect: (req, _res, next) => {
    const userId = req.get('x-test-user');
    if (userId) req.user = { id: userId };
    next();
  },
}));

const WAS = process.env.RATE_LIMIT_VOUCHER_MAX;

const paymentApp = async () => {
  const routes = (await import('../../backend/routes/payment.routes.js')).default;
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/payments', routes);
  return app;
};

const pay = (app, user, body) => request(app)
  .post('/api/payments?action=hosted-checkout')
  .set('X-Forwarded-For', '203.0.113.7')
  .set('x-test-user', user)
  .send({ orderId: 'FLT1', bookingReference: 'FLT1', amount: 291, ...body });

beforeEach(() => {
  vi.resetModules();
  process.env.RATE_LIMIT_VOUCHER_MAX = '3';
  checkout.mockReset().mockImplementation((req, res) => (req.body.voucherCode === 'SHUBHAM'
    ? res.json({ success: true, checkoutUrl: 'https://pay.test.invalid/1' })
    : res.status(409).json({ success: false, code: 'VOUCHER_NOT_FOUND', error: 'That code was not found.' })));
});

afterEach(() => {
  if (WAS === undefined) delete process.env.RATE_LIMIT_VOUCHER_MAX;
  else process.env.RATE_LIMIT_VOUCHER_MAX = WAS;
});

describe('a checkout carrying a voucher code', () => {
  it('counts wrong codes against the voucher limit, and refuses the next one before checkout runs', async () => {
    const app = await paymentApp();
    for (let i = 0; i < 3; i += 1) expect((await pay(app, 'u1', { voucherCode: `GUESS${i}` })).status).toBe(409);

    const limited = await pay(app, 'u1', { voucherCode: 'GUESS3' });

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(checkout).toHaveBeenCalledTimes(3);
  });

  it('counts per customer', async () => {
    const app = await paymentApp();
    for (let i = 0; i < 4; i += 1) await pay(app, 'u1', { voucherCode: `GUESS${i}` });

    expect((await pay(app, 'u2', { voucherCode: 'GUESS9' })).status).toBe(409);
  });

  it('does not count a checkout that opened a payment page', async () => {
    const app = await paymentApp();
    for (let i = 0; i < 6; i += 1) expect((await pay(app, 'u1', { voucherCode: 'SHUBHAM' })).status).toBe(200);

    expect((await pay(app, 'u1', { voucherCode: 'GUESS1' })).status).toBe(409);
  });
});

describe('a checkout without a voucher code', () => {
  it('is never throttled by the voucher limit, however often it fails', async () => {
    const app = await paymentApp();
    for (let i = 0; i < 10; i += 1) expect((await pay(app, 'u1', {})).status).toBe(409);
    for (const voucherCode of ['', '   ', null]) expect((await pay(app, 'u1', { voucherCode })).status).toBe(409);
    expect(checkout).toHaveBeenCalledTimes(13);
  });

  it('still goes through after the same customer used up their voucher tries', async () => {
    const app = await paymentApp();
    for (let i = 0; i < 4; i += 1) await pay(app, 'u1', { voucherCode: `GUESS${i}` });

    expect((await pay(app, 'u1', {})).status).toBe(409);
    expect(checkout).toHaveBeenCalledTimes(4);
  });
});
