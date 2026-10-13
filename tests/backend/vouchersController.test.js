import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { createVoucher, updateVoucher, voucherInput } from '../../backend/controllers/vouchers.controller.js';

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
    return chain;
  });
  return writes;
};

describe('admin vouchers', () => {
  beforeEach(() => supabaseMock.from.mockReset());

  it('reads the form into coins, an uppercase code and dates', () => {
    expect(voucherInput({ code: ' shubham ', valueUsd: '50', maxRedemptions: '', validUntil: '2026-12-31' })).toEqual({
      ok: true,
      row: { code: 'SHUBHAM', coins: 5000, max_redemptions: null, valid_from: null, valid_until: '2026-12-31T23:59:59.999Z', note: null },
    });
  });

  it('refuses a bad code or value in words', () => {
    expect(voucherInput({ code: 'a b', valueUsd: 50 }).ok).toBe(false);
    expect(voucherInput({ code: 'GOOD', valueUsd: 0 }).ok).toBe(false);
    expect(voucherInput({ code: 'GOOD', valueUsd: 20000 }).ok).toBe(false);
  });

  it('creates a voucher and records who made it', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000 }, error: null } });
    const res = await run(createVoucher, { body: { code: 'shubham', valueUsd: 50 } });
    expect(res.statusCode).toBe(201);
    expect(writes[0][2]).toMatchObject({ code: 'SHUBHAM', coins: 5000, created_by: 'a1' });
  });

  it('says a taken code is taken', async () => {
    tables({ vouchers: { data: null, error: { code: '23505', message: 'duplicate key' } } });
    const res = await run(createVoucher, { body: { code: 'TAKEN', valueUsd: 10 } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CODE_TAKEN');
  });

  it('will not change the code or the value of a voucher already redeemed', async () => {
    tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 1 }, error: null } });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { valueUsd: 80 } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('VOUCHER_LOCKED');
  });
});
