import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import {
  CHECKOUT_VOUCHER_MESSAGES, VOUCHER_MESSAGES, checkTripVoucher, holdCoins, isVoucherCode, payTripVoucher, reserveTripVoucher,
  tripVoucherOf, voidTripReward, walletSummary,
} from '../../backend/services/wallet.service.js';
import { redeem, voucherCheck } from '../../backend/controllers/wallet.controller.js';

const USER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };
const rpcClient = (answer) => ({ rpc: vi.fn(async () => answer) });
const run = async (handler, body) => {
  const res = createResponse();
  await handler(createRequest({ user: USER, body }), res);
  return res;
};

describe('the trip-voucher service', () => {
  it('checks a code for the customer, uppercased, with no booking yet', async () => {
    const client = rpcClient({ data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip' }, error: null });
    const voucher = await checkTripVoucher(client, { userId: 'u1', code: ' shubham ' });
    expect(client.rpc).toHaveBeenCalledWith('check_trip_voucher', { p_user: 'u1', p_code: 'SHUBHAM', p_ref: null });
    expect(voucher).toMatchObject({ code: 'SHUBHAM', coins: 5000 });
  });

  it('names the new refusals for what they are', async () => {
    for (const code of ['VOUCHER_WRONG_KIND', 'VOUCHER_FIRST_TIME_ONLY', 'BAD_REFERENCE']) {
      const client = rpcClient({ data: null, error: { message: code } });
      await expect(checkTripVoucher(client, { userId: 'u1', code: 'SHUBHAM' })).rejects.toMatchObject({ code });
    }
  });

  it('reserves under the booking with its payout date', async () => {
    const client = rpcClient({ data: { status: 'pending', coins: 5000 }, error: null });
    await reserveTripVoucher(client, { userId: 'u1', code: 'shubham', bookingReference: 'FLT1', dueAt: '2026-11-18T00:00:00.000Z' });
    expect(client.rpc).toHaveBeenCalledWith('reserve_trip_voucher', {
      p_user: 'u1', p_code: 'SHUBHAM', p_ref: 'FLT1', p_due_at: '2026-11-18T00:00:00.000Z',
    });
  });

  it('sends a missing payout date as null, never undefined', async () => {
    const client = rpcClient({ data: { status: 'pending' }, error: null });
    await reserveTripVoucher(client, { userId: 'u1', code: 'SHUBHAM', bookingReference: 'FLT1' });
    expect(client.rpc.mock.calls[0][1].p_due_at).toBeNull();
  });

  it('pays by booking', async () => {
    const client = rpcClient({ data: { status: 'paid', applied: true, coins: 5000 }, error: null });
    expect(await payTripVoucher(client, 'FLT1')).toMatchObject({ status: 'paid', applied: true });
    expect(client.rpc).toHaveBeenCalledWith('pay_trip_voucher', { p_ref: 'FLT1' });
  });

  it('voids by booking and never throws', async () => {
    const ok = rpcClient({ data: { status: 'void', voided: true }, error: null });
    expect(await voidTripReward(ok, 'FLT1')).toEqual({ ok: true, status: 'void' });
    expect(ok.rpc).toHaveBeenCalledWith('void_trip_voucher', { p_ref: 'FLT1' });
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await voidTripReward(rpcClient({ data: null, error: { message: 'connection reset' } }), 'FLT1')).toEqual({ ok: false, status: 'error' });
    silence.mockRestore();
  });

  it('calls a reward that vanished before the void nothing to void, not a failure', async () => {
    const gone = rpcClient({ data: { status: 'none', voided: false }, error: null });
    expect(await voidTripReward(gone, 'FLT1')).toEqual({ ok: true, status: 'none' });
  });

  it('passes on that the wallet already had a payout', async () => {
    const client = rpcClient({ data: { status: 'paid', applied: false, coins: 5000 }, error: null });
    expect(await payTripVoucher(client, 'FLT1')).toMatchObject({ status: 'paid', applied: false });
  });

  it('asks nothing without a booking reference', async () => {
    const client = rpcClient({ data: {}, error: null });
    expect(await voidTripReward(client, '')).toEqual({ ok: true, status: 'none' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('reads the voucher off a verified charge', () => {
    expect(tripVoucherOf({ voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } })).toEqual({ id: 'v1', code: 'SHUBHAM', coins: 5000 });
    expect(tripVoucherOf({ voucher: null })).toBeNull();
    expect(tripVoucherOf({ voucher: { coins: 5 } })).toBeNull();
    expect(tripVoucherOf(null)).toBeNull();
  });

  it('tells whether a voucher already uses a code', async () => {
    const lookup = (row) => {
      const chain = {};
      for (const op of ['select', 'eq', 'limit']) chain[op] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
      return { from: vi.fn(() => chain), chain };
    };
    const taken = lookup({ id: 'v1' });
    expect(await isVoucherCode(taken, ' shubham ')).toBe(true);
    expect(taken.chain.eq).toHaveBeenCalledWith('code', 'SHUBHAM');
    expect(await isVoucherCode(lookup(null), 'SHUBHAM')).toBe(false);
  });

  it('lists the trip rewards still to come in the wallet summary', async () => {
    const tables = {
      wallets: { data: { balance: 0 }, error: null },
      wallet_holds: { data: [], error: null },
      wallet_entries: { data: [], error: null },
      voucher_redemptions: { data: [{ booking_reference: 'FLT1', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', vouchers: { code: 'SHUBHAM' } }], error: null },
    };
    const client = {
      from: vi.fn((table) => {
        const chain = {};
        for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => tables[table]);
        chain.then = (resolve) => resolve(tables[table]);
        return chain;
      }),
    };
    const summary = await walletSummary(client, 'u1');
    expect(summary.pending).toEqual([{ bookingReference: 'FLT1', code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00+00:00' }]);
  });

  it('still loads the wallet when the trip rewards to come cannot be read, and logs why', async () => {
    const summaryWith = async (rewards) => {
      const tables = {
        wallets: { data: { balance: 1200 }, error: null },
        wallet_holds: { data: [{ coins: 200 }], error: null },
        wallet_entries: { data: [{ id: 1, kind: 'earn', coins: 1200, note: null }], error: null },
      };
      const client = {
        from: vi.fn((table) => {
          const chain = {};
          for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
          chain.maybeSingle = vi.fn(async () => tables[table]);
          chain.then = (resolve, reject) => (table === 'voucher_redemptions' ? rewards() : Promise.resolve(tables[table])).then(resolve, reject);
          return chain;
        }),
      };
      return walletSummary(client, 'u1');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const rewards of [
      () => Promise.resolve({ data: null, error: { code: '42703', message: 'column voucher_redemptions.due_at does not exist' } }),
      () => Promise.reject(new Error('fetch failed')),
    ]) {
      const summary = await summaryWith(rewards);
      expect(summary).toMatchObject({ balance: 1200, held: 200, pending: [] });
      expect(summary.entries).toHaveLength(1);
    }
    expect(logged).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logged.mock.calls[0])).toMatch(/42703.*due_at does not exist/);
    expect(JSON.stringify(logged.mock.calls[1])).toMatch(/fetch failed/);
    logged.mockRestore();
  });

  it('names every refusal the wallet functions raise, none hidden behind another code', async () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');
    const raised = new Set();
    for (const file of ['20261013120000_jet_wallet.sql', '20261013150000_trip_reward_vouchers.sql']) {
      for (const match of readFileSync(path.join(dir, file), 'utf8').matchAll(/raise exception '([A-Z_]+)'/g)) raised.add(match[1]);
    }
    expect(raised).toContain('BOOKING_HAS_REWARD');
    for (const code of raised) {
      const client = rpcClient({ data: null, error: { message: code } });
      await expect(holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 5 })).rejects.toMatchObject({ code });
    }
  });

  it('words the pointers exactly as the owner asked', () => {
    expect(CHECKOUT_VOUCHER_MESSAGES.VOUCHER_WRONG_KIND).toBe('Redeem this code in Profile → Jet Wallet.');
    expect(VOUCHER_MESSAGES.VOUCHER_WRONG_KIND).toBe('Use this code at checkout when you book a flight.');
  });
});

describe('POST /wallet/voucher-check', () => {
  beforeEach(() => { supabaseMock.rpc = vi.fn(); });

  it('checks a trip voucher for the signed-in customer, never one named in the body', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip' }, error: null });
    const res = await run(voucherCheck, { code: ' shubham ', userId: 'someone-else' });
    expect(supabaseMock.rpc).toHaveBeenCalledWith('check_trip_voucher', { p_user: USER.id, p_code: 'SHUBHAM', p_ref: null });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { kind: 'trip', code: 'SHUBHAM', coins: 5000 } });
  });

  it('points an instant voucher to the wallet', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_WRONG_KIND' } });
    const res = await run(voucherCheck, { code: 'WELCOME50' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_WRONG_KIND', error: 'Redeem this code in Profile → Jet Wallet.' });
  });

  it('says first-time only in words', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_FIRST_TIME_ONLY' } });
    const res = await run(voucherCheck, { code: 'SHUBHAM' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_FIRST_TIME_ONLY', error: 'This voucher is for first-time customers only.' });
  });

  it('refuses a malformed code without asking the database', async () => {
    const res = await run(voucherCheck, { code: 'a b' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'VOUCHER_NOT_FOUND', error: 'That code was not found. Please check it and try again.' });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('says the voucher could not be checked when the database cannot answer', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await run(voucherCheck, { code: 'SHUBHAM' });
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WALLET_UNAVAILABLE');
    silence.mockRestore();
  });

  it('is only for a signed-in customer', async () => {
    const { default: walletRoutes } = await import('../../backend/routes/wallet.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/wallet', walletRoutes);
    const res = await request(app).post('/api/wallet/voucher-check').send({ code: 'SHUBHAM' });
    expect(res.status).toBe(401);
  });
});

describe('the wallet redeem box', () => {
  beforeEach(() => { supabaseMock.rpc = vi.fn(); });

  it('points a trip voucher to checkout', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_WRONG_KIND' } });
    const res = await run(redeem, { code: 'SHUBHAM' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_WRONG_KIND', error: 'Use this code at checkout when you book a flight.' });
  });
});
