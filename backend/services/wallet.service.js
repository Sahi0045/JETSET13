import { coinsToUsd } from '../../shared/jetCoins.js';

export class WalletError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'WalletError';
    this.code = code;
  }
}

const KNOWN_CODES = [
  'INSUFFICIENT_COINS', 'HOLD_CONFLICT', 'BAD_COINS',
  'VOUCHER_NOT_FOUND', 'VOUCHER_INACTIVE', 'VOUCHER_NOT_STARTED', 'VOUCHER_EXPIRED',
  'VOUCHER_USED_UP', 'VOUCHER_ALREADY_REDEEMED',
];

// wallet_return never gives back more than a hold has left, so "everything" is
// asked for with a number larger than any hold.
const ALL_COINS = 1e15;

async function call(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const code = KNOWN_CODES.find((known) => String(error.message || '').includes(known));
    throw new WalletError(code || 'WALLET_UNAVAILABLE', error.message);
  }
  return data || {};
}

export async function readBalance(client, userId) {
  const { data, error } = await client.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  return Number(data?.balance) || 0;
}

export async function walletSummary(client, userId) {
  const [wallet, holds, entries] = await Promise.all([
    client.from('wallets').select('balance').eq('user_id', userId).maybeSingle(),
    client.from('wallet_holds').select('coins').eq('user_id', userId).eq('status', 'held'),
    client.from('wallet_entries')
      .select('id, kind, coins, balance_after, booking_reference, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const error = wallet.error || holds.error || entries.error;
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  const balance = Number(wallet.data?.balance) || 0;
  const held = (holds.data || []).reduce((sum, hold) => sum + (Number(hold.coins) || 0), 0);
  return { balance, balanceUsd: coinsToUsd(balance), held, entries: entries.data || [] };
}

export const holdCoins = (client, { userId, bookingReference, coins }) =>
  call(client, 'wallet_hold', { p_user: userId, p_ref: bookingReference, p_coins: Math.floor(coins) });

export const captureCoins = (client, bookingReference) => call(client, 'wallet_capture', { p_ref: bookingReference });

export const releaseCoins = (client, bookingReference) => call(client, 'wallet_release', { p_ref: bookingReference });

export async function returnCoins(client, { bookingReference, coins, reason, note }) {
  const result = await call(client, 'wallet_return', {
    p_ref: bookingReference,
    p_coins: Math.floor(coins),
    p_reason: reason ?? null,
    p_note: note ?? null,
  });
  return Number(result.coins) || 0;
}

export async function returnAllCoins(client, bookingReference, reason) {
  try {
    return { ok: true, coins: await returnCoins(client, { bookingReference, coins: ALL_COINS, reason }) };
  } catch (error) {
    console.error('⚠️ Jet Coins could not be returned', { bookingReference, reason, code: error.code });
    return { ok: false, coins: 0, error };
  }
}

export const earnCoins = (client, { userId, bookingReference, coins }) =>
  call(client, 'wallet_earn', { p_user: userId, p_ref: bookingReference, p_coins: Math.floor(coins) });

export async function reverseEarnedCoins(client, bookingReference) {
  const result = await call(client, 'wallet_reverse_earn', { p_ref: bookingReference });
  return Number(result.coins) || 0;
}

export const redeemVoucher = (client, { userId, code }) =>
  call(client, 'redeem_voucher', { p_user: userId, p_code: String(code || '') });

export const VOUCHER_MESSAGES = {
  VOUCHER_NOT_FOUND: 'That voucher code was not found. Please check it and try again.',
  VOUCHER_INACTIVE: 'This voucher is no longer active.',
  VOUCHER_NOT_STARTED: 'This voucher cannot be used yet.',
  VOUCHER_EXPIRED: 'This voucher has expired.',
  VOUCHER_USED_UP: 'This voucher has been fully redeemed.',
  VOUCHER_ALREADY_REDEEMED: 'You have already redeemed this voucher.',
};
