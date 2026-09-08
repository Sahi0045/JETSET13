import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Pentest #2 — PR-A: coupon writes and the price-settings write are admin-only.
 *
 * These routers reach Supabase with the service-role key (RLS bypassed), and
 * their handlers were commented "ADMIN:" but carried no middleware — so anyone
 * could mint a 100%-off coupon, dump/rewrite every coupon, or overwrite the
 * global pricing markup. `protect` (401 when there is no session) + `admin`
 * (403 for a non-admin) now guard them.
 *
 * The customer-facing reads/paths must STAY OPEN or the site breaks:
 *   - coupon `/validate` + `/use` (checkout), and
 *   - `GET /admin/price-settings` (PricingService computes every displayed price
 *     from it, unauthenticated).
 */

let app;

beforeAll(async () => {
  const couponRoutes = (await import('../../backend/routes/coupon.routes.js')).default;
  const adminRoutes = (await import('../../backend/routes/admin.routes.js')).default;
  const emailRoutes = (await import('../../backend/routes/email.routes.js')).default;
  const templateRoutes = (await import('../../backend/routes/template.routes.js')).default;
  app = express();
  app.use(express.json());
  app.use('/api/coupons', couponRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/email', emailRoutes);
  app.use('/api/templates', templateRoutes);
});

describe('coupon admin routes are gated (was unauthenticated)', () => {
  it('GET /api/coupons (list) rejects an anonymous caller', async () => {
    const res = await request(app).get('/api/coupons');
    expect(res.status).toBe(401);
  });

  it('POST /api/coupons (create) rejects an anonymous caller', async () => {
    const res = await request(app)
      .post('/api/coupons')
      .send({ code: 'FREE100', discountType: 'percentage', discountValue: 100 });
    expect(res.status).toBe(401);
  });

  it('PUT /api/coupons/:id (update) rejects an anonymous caller', async () => {
    const res = await request(app).put('/api/coupons/abc').send({ discountValue: 100 });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/coupons/:id rejects an anonymous caller', async () => {
    const res = await request(app).delete('/api/coupons/abc');
    expect(res.status).toBe(401);
  });
});

describe('coupon customer paths stay public', () => {
  it('POST /api/coupons/validate is reachable without auth (400 on empty body, not 401)', async () => {
    const res = await request(app).post('/api/coupons/validate').send({});
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400);
  });

  it('POST /api/coupons/use is reachable without auth (400 on empty body, not 401)', async () => {
    const res = await request(app).post('/api/coupons/use').send({});
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400);
  });
});

describe('admin price-settings: only the write is gated', () => {
  it('PUT /api/admin/price-settings rejects an anonymous caller', async () => {
    const res = await request(app).put('/api/admin/price-settings').send({ flight_taxes_fees: 0 });
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/price-settings stays public (PricingService reads it) — never 401', async () => {
    const res = await request(app).get('/api/admin/price-settings');
    expect(res.status).not.toBe(401);
  });
});

describe('email /send is no longer an open relay', () => {
  it('POST /api/email/send rejects an anonymous caller', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .send({ type: 'quote_reminder', to: 'victim@example.com', data: {} });
    expect(res.status).toBe(401);
  });

  it('POST /api/email (contact/subscription forms) stays public — never 401', async () => {
    const res = await request(app)
      .post('/api/email')
      .send({ type: 'subscription', email: 'someone@example.com', source: 'test' });
    expect(res.status).not.toBe(401);
  });
});

describe('inquiry-response templates are admin-only (whole router)', () => {
  it.each([
    ['get', '/api/templates'],
    ['post', '/api/templates'],
    ['put', '/api/templates/abc'],
    ['delete', '/api/templates/abc'],
    ['post', '/api/templates/send'],
  ])('%s %s rejects an anonymous caller', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });
});
