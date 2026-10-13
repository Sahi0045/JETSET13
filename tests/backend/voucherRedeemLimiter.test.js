import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const WAS = process.env.RATE_LIMIT_VOUCHER_MAX;

const makeApp = async () => {
  process.env.RATE_LIMIT_VOUCHER_MAX = '3';
  vi.resetModules();
  const { voucherRedeemLimiter } = await import('../../backend/middleware/security.js');
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get('x-test-user');
    if (userId) req.user = { id: userId };
    next();
  });
  app.post('/redeem', voucherRedeemLimiter, (req, res) => {
    if (req.body?.code === 'GOOD') return res.json({ success: true });
    return res.status(400).json({ success: false });
  });
  return app;
};

const redeem = (app, user, code, ip = '203.0.113.9') =>
  request(app).post('/redeem').set('X-Forwarded-For', ip).set('x-test-user', user).send({ code });

afterEach(() => {
  if (WAS === undefined) delete process.env.RATE_LIMIT_VOUCHER_MAX;
  else process.env.RATE_LIMIT_VOUCHER_MAX = WAS;
});

describe('the voucher redeem limit', () => {
  it('refuses a customer after their wrong tries, with the RATE_LIMITED code', async () => {
    const app = await makeApp();
    for (let i = 0; i < 3; i += 1) expect((await redeem(app, 'u1', 'NOPE')).status).toBe(400);
    const refused = await redeem(app, 'u1', 'NOPE');
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
  });

  it('counts per customer, so others on the same address are not locked out', async () => {
    const app = await makeApp();
    for (let i = 0; i < 4; i += 1) await redeem(app, 'u1', 'NOPE');
    expect((await redeem(app, 'u1', 'NOPE')).status).toBe(429);
    expect((await redeem(app, 'u2', 'NOPE')).status).toBe(400);
  });

  it('does not count a redemption that worked', async () => {
    const app = await makeApp();
    for (let i = 0; i < 6; i += 1) expect((await redeem(app, 'u1', 'GOOD')).status).toBe(200);
    expect((await redeem(app, 'u1', 'NOPE')).status).toBe(400);
  });
});
