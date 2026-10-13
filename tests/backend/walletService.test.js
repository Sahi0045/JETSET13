import { describe, expect, it, vi } from 'vitest';
import {
  WalletError, captureCoins, holdCoins, readBalance, redeemVoucher, returnAllCoins, returnCoins, walletSummary,
} from '../../backend/services/wallet.service.js';

const rpcClient = (answer) => ({ rpc: vi.fn(async () => answer) });

const tableClient = (tables) => ({
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => tables[table]);
    chain.then = (resolve) => resolve(tables[table]);
    return chain;
  }),
});

describe('the wallet service', () => {
  it('calls the hold function with the customer, the checkout and the coins', async () => {
    const client = rpcClient({ data: { status: 'held', coins: 500, balance: 4500 }, error: null });
    const result = await holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 500 });
    expect(client.rpc).toHaveBeenCalledWith('wallet_hold', { p_user: 'u1', p_ref: 'FLT1', p_coins: 500 });
    expect(result.status).toBe('held');
  });

  it('names a refused hold for what it is', async () => {
    const client = rpcClient({ data: null, error: { message: 'INSUFFICIENT_COINS' } });
    await expect(holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 500 }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
  });

  it('calls any other database failure WALLET_UNAVAILABLE, a missing customer row included', async () => {
    const client = rpcClient({ data: null, error: { message: 'insert or update on table "wallets" violates foreign key constraint' } });
    await expect(holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 5 }))
      .rejects.toBeInstanceOf(WalletError);
    await expect(holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 5 }))
      .rejects.toMatchObject({ code: 'WALLET_UNAVAILABLE' });
  });

  it('returns the coins given back', async () => {
    const client = rpcClient({ data: { status: 'captured', coins: 1500 }, error: null });
    expect(await returnCoins(client, { bookingReference: 'FLT1', coins: 1500, reason: 'cancel' })).toBe(1500);
  });

  it('sends the key reason and the note to the return function, with no argument left undefined', async () => {
    const client = rpcClient({ data: { status: 'captured', coins: 1500 }, error: null });
    await returnCoins(client, { bookingReference: 'FLT1', coins: 1500.9, reason: 'desk-1', note: 'staff s1: refund' });
    expect(client.rpc).toHaveBeenLastCalledWith('wallet_return', { p_ref: 'FLT1', p_coins: 1500, p_reason: 'desk-1', p_note: 'staff s1: refund' });
    await returnCoins(client, { bookingReference: 'FLT1', coins: 1500 });
    expect(client.rpc).toHaveBeenLastCalledWith('wallet_return', { p_ref: 'FLT1', p_coins: 1500, p_reason: null, p_note: null });
  });

  it('never throws when giving every coin back, and says when it could not', async () => {
    const client = rpcClient({ data: null, error: { message: 'connection reset' } });
    const result = await returnAllCoins(client, 'FLT1', 'reversal');
    expect(result.ok).toBe(false);
    expect(result.coins).toBe(0);
  });

  it('reads captures', async () => {
    const client = rpcClient({ data: { status: 'captured' }, error: null });
    expect((await captureCoins(client, 'FLT1')).status).toBe('captured');
  });

  it('maps voucher refusals', async () => {
    const client = rpcClient({ data: null, error: { message: 'VOUCHER_ALREADY_REDEEMED' } });
    await expect(redeemVoucher(client, { userId: 'u1', code: 'X' })).rejects.toMatchObject({ code: 'VOUCHER_ALREADY_REDEEMED' });
  });

  it('sums the balance, what is held and the history', async () => {
    const client = tableClient({
      wallets: { data: { balance: 4500 }, error: null },
      wallet_holds: { data: [{ coins: 500 }, { coins: 250 }], error: null },
      wallet_entries: { data: [{ id: 1, kind: 'voucher', coins: 5000 }], error: null },
    });
    const summary = await walletSummary(client, 'u1');
    expect(summary).toMatchObject({ balance: 4500, balanceUsd: 45, held: 750 });
    expect(summary.entries).toHaveLength(1);
  });

  it('sends a voucher entry its code but no other entry a note, so a staff note never reaches the customer', async () => {
    const client = tableClient({
      wallets: { data: { balance: 4500 }, error: null },
      wallet_holds: { data: [], error: null },
      wallet_entries: {
        data: [
          { id: 3, kind: 'return', coins: 800, note: 'staff 6f1c2d9e-0000-4000-8000-000000000001: customer rang, duplicate charge' },
          { id: 2, kind: 'release', coins: 500, note: 'staff 6f1c2d9e-0000-4000-8000-000000000001: asked for a refund' },
          { id: 1, kind: 'voucher', coins: 5000, note: 'SHUBHAM' },
        ],
        error: null,
      },
    });
    const { entries } = await walletSummary(client, 'u1');
    expect(entries.map((entry) => entry.note)).toEqual([null, null, 'SHUBHAM']);
    expect(JSON.stringify(entries)).not.toContain('staff');
    expect(entries[0]).toMatchObject({ id: 3, kind: 'return', coins: 800 });
  });

  it('reads no wallet as zero coins', async () => {
    const client = tableClient({ wallets: { data: null, error: null } });
    expect(await readBalance(client, 'u1')).toBe(0);
  });
});
