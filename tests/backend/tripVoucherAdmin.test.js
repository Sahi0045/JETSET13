import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { createVoucher, listRedemptions, updateVoucher, voucherInput } from '../../backend/controllers/vouchers.controller.js';

vi.mock('../../backend/middleware/auth.middleware.js', () => ({
  protect: (req, _res, next) => { req.user = { id: 'a1', role: 'admin' }; next(); },
  admin: (_req, _res, next) => next(),
}));

const ADMIN = { id: 'a1', role: 'admin' };
const run = async (handler, { body = {}, params = {} } = {}) => {
  const res = createResponse();
  await handler(createRequest({ user: ADMIN, body, params }), res);
  return res;
};

const tables = (rows) => {
  const writes = [];
  supabaseMock.from.mockImplementation((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.insert = vi.fn((row) => { writes.push(['insert', table, row]); return chain; });
    chain.update = vi.fn((row) => { writes.push(['update', table, row]); return chain; });
    chain.single = vi.fn(async () => rows[table] ?? { data: null, error: null });
    chain.maybeSingle = chain.single;
    chain.then = (resolve) => resolve(rows[table] ?? { data: [], error: null });
    return chain;
  });
  return writes;
};

describe('voucher kinds in the admin form', () => {
  beforeEach(() => supabaseMock.from.mockReset());

  it('reads the kind and the first-time tick box', () => {
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50, kind: 'trip', firstTimeOnly: true }).row)
      .toMatchObject({ kind: 'trip', first_time_only: true });
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50 }).row).toMatchObject({ kind: 'instant', first_time_only: false });
  });

  it('keeps first-time only to trip rewards', () => {
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50, kind: 'instant', firstTimeOnly: true }).row.first_time_only).toBe(false);
  });

  it('refuses a kind it does not know', () => {
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50, kind: 'cash' })).toEqual({ ok: false, error: 'The kind must be Instant or Trip reward.' });
  });

  it('creates a trip reward for first-time customers', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM' }, error: null } });
    const res = await run(createVoucher, { body: { code: 'shubham', valueUsd: 50, kind: 'trip', firstTimeOnly: true } });
    expect(res.statusCode).toBe(201);
    expect(writes.find(([op]) => op === 'insert')[2]).toMatchObject({ code: 'SHUBHAM', coins: 5000, kind: 'trip', first_time_only: true });
  });

  it('refuses a code a coupon already uses, and saves nothing', async () => {
    const writes = tables({ coupons: { data: { id: 'c1' }, error: null } });
    const res = await run(createVoucher, { body: { code: 'SAVE20', valueUsd: 50 } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'CODE_TAKEN', error: 'A coupon already uses this code. Pick another code.' });
    expect(writes.filter(([op]) => op === 'insert')).toHaveLength(0);
  });

  it('will not change the kind of a voucher customers have used', async () => {
    tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'instant', redemptions_count: 1 }, error: null } });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { kind: 'trip' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('VOUCHER_LOCKED');
  });

  it('changes the kind of a voucher nobody has used yet', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'instant', redemptions_count: 0 }, error: null } });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { kind: 'trip', firstTimeOnly: true } });
    expect(res.statusCode).toBe(200);
    expect(writes.find(([op]) => op === 'update')[2]).toMatchObject({ kind: 'trip', first_time_only: true });
  });

  it('reads an empty or null kind as not sent, never as a switch to instant', async () => {
    for (const kind of [null, '']) {
      const writes = tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip', first_time_only: true, redemptions_count: 3 }, error: null } });
      const res = await run(updateVoucher, { params: { id: 'v1' }, body: { kind, maxRedemptions: 50 } });
      expect(res.statusCode).toBe(200);
      expect(writes.find(([op]) => op === 'update')[2]).toMatchObject({ kind: 'trip', first_time_only: true, max_redemptions: 50 });
    }
  });

  it('logs why the coupon codes could not be checked, and answers without the database\'s words', async () => {
    supabaseMock.from.mockImplementation(() => {
      const chain = {};
      for (const op of ['select', 'eq', 'limit']) chain[op] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }));
      return chain;
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await run(createVoucher, { body: { code: 'SHUBHAM', valueUsd: 50 } });

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/JWT/);
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).toMatch(/PGRST301/);
    expect(JSON.stringify(logged.mock.calls)).toMatch(/JWT expired/);
    logged.mockRestore();
  });

  it('refuses renaming a voucher to a coupon code', async () => {
    const writes = tables({
      vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip', redemptions_count: 0 }, error: null },
      coupons: { data: { id: 'c1' }, error: null },
    });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { code: 'SAVE20' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CODE_TAKEN');
    expect(writes.filter(([op]) => op === 'update')).toHaveLength(0);
  });

  it('lists who used a voucher with the reward status, booking and payout date', async () => {
    tables({
      voucher_redemptions: {
        data: [{
          id: 7, coins: 5000, created_at: '2026-10-13T10:00:00Z', user_id: 'u1', status: 'pending',
          booking_reference: 'FLT1', due_at: '2026-11-18T00:00:00+00:00', paid_at: null, users: { email: 'ada@example.com' },
        }],
        error: null,
      },
    });
    const res = await run(listRedemptions, { params: { id: 'v1' } });
    expect(res.body.data).toEqual([{
      id: 7, coins: 5000, createdAt: '2026-10-13T10:00:00Z', userId: 'u1', email: 'ada@example.com',
      status: 'pending', bookingReference: 'FLT1', dueAt: '2026-11-18T00:00:00+00:00', paidAt: null,
    }]);
  });
});

describe('one code, one meaning', () => {
  beforeEach(() => supabaseMock.from.mockReset());
  const couponApp = async () => {
    const { default: routes } = await import('../../backend/routes/coupon.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/coupons', routes);
    return app;
  };

  it('refuses a coupon whose code a voucher already uses', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1' }, error: null } });
    const res = await request(await couponApp()).post('/api/coupons').send({ code: 'shubham', discountType: 'percentage', discountValue: 10 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'A voucher already uses this code. Pick another code.' });
    expect(writes.filter(([op]) => op === 'insert')).toHaveLength(0);
  });

  it('still creates a coupon whose code no voucher uses', async () => {
    const writes = tables({ coupons: { data: { id: 'c9', code: 'SAVE10' }, error: null } });
    const res = await request(await couponApp()).post('/api/coupons').send({ code: 'save10', discountType: 'percentage', discountValue: 10 });
    expect(res.status).toBe(200);
    expect(writes.find(([op, table]) => op === 'insert' && table === 'coupons')[2][0]).toMatchObject({ code: 'SAVE10' });
  });

  it('answers a fixed message, never the database\'s words, when voucher codes cannot be checked', async () => {
    supabaseMock.from.mockImplementation((table) => {
      const chain = {};
      for (const op of ['select', 'eq', 'limit', 'insert', 'update', 'order']) chain[op] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => (table === 'vouchers'
        ? { data: null, error: { code: 'PGRST301', message: 'JWT expired for role service_role' } }
        : { data: null, error: null }));
      chain.single = chain.maybeSingle;
      return chain;
    });
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = await couponApp();

    const created = await request(app).post('/api/coupons').send({ code: 'shubham', discountType: 'percentage', discountValue: 10 });
    const renamed = await request(app).put('/api/coupons/c1').send({ code: 'shubham' });

    for (const res of [created, renamed]) {
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ success: false, message: 'Voucher codes could not be checked just now. Please try again.' });
    }
    silence.mockRestore();
  });

  it('refuses renaming a coupon to a voucher code', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1' }, error: null } });
    const res = await request(await couponApp()).put('/api/coupons/c1').send({ code: 'shubham' });
    expect(res.status).toBe(409);
    expect(writes.filter(([op]) => op === 'update')).toHaveLength(0);
  });
});
