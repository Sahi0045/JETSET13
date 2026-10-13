import { coinsToUsd } from '../../shared/jetCoins.js';

export class WalletError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'WalletError';
    this.code = code;
  }
}

const KNOWN_CODES = [
  'INSUFFICIENT_COINS', 'HOLD_CONFLICT', 'BAD_COINS', 'BAD_REFERENCE', 'BOOKING_HAS_REWARD',
  'VOUCHER_NOT_FOUND', 'VOUCHER_INACTIVE', 'VOUCHER_NOT_STARTED', 'VOUCHER_EXPIRED',
  'VOUCHER_USED_UP', 'VOUCHER_ALREADY_REDEEMED', 'VOUCHER_WRONG_KIND', 'VOUCHER_FIRST_TIME_ONLY',
];

export const VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

export const normalizeVoucherCode = (code) => String(code ?? '').trim().toUpperCase();

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

async function pendingRewardRows(client, userId) {
  try {
    const { data, error } = await client.from('voucher_redemptions')
      .select('booking_reference, coins, due_at, vouchers(code)')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('due_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('⚠️ Wallet: the trip rewards to come could not be read; the wallet loads without them', { code: error?.code, error: error?.message });
    return [];
  }
}

// Only a voucher entry's note (its code) is the customer's to read: staff returns store "staff <id>: <reason>" on the customer's own rows.
export async function walletSummary(client, userId) {
  const [wallet, holds, entries, rewards] = await Promise.all([
    client.from('wallets').select('balance').eq('user_id', userId).maybeSingle(),
    client.from('wallet_holds').select('coins').eq('user_id', userId).eq('status', 'held'),
    client.from('wallet_entries')
      .select('id, kind, coins, balance_after, booking_reference, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    pendingRewardRows(client, userId),
  ]);
  const error = wallet.error || holds.error || entries.error;
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  const balance = Number(wallet.data?.balance) || 0;
  const held = (holds.data || []).reduce((sum, hold) => sum + (Number(hold.coins) || 0), 0);
  const customerEntries = (entries.data || []).map((entry) => ({ ...entry, note: entry.kind === 'voucher' ? entry.note : null }));
  const pending = rewards.map((row) => ({
    bookingReference: row.booking_reference,
    code: row.vouchers?.code || null,
    coins: Number(row.coins) || 0,
    dueAt: row.due_at || null,
  }));
  return { balance, balanceUsd: coinsToUsd(balance), held, entries: customerEntries, pending };
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

export const checkTripVoucher = (client, { userId, code, bookingReference = null }) =>
  call(client, 'check_trip_voucher', { p_user: userId, p_code: normalizeVoucherCode(code), p_ref: bookingReference });

export const reserveTripVoucher = (client, { userId, code, bookingReference, dueAt = null }) =>
  call(client, 'reserve_trip_voucher', {
    p_user: userId, p_code: normalizeVoucherCode(code), p_ref: bookingReference, p_due_at: dueAt ?? null,
  });

export const payTripVoucher = (client, bookingReference) => call(client, 'pay_trip_voucher', { p_ref: bookingReference });

/** Never throws: a reward left pending on a cancelled booking is voided by the payout job instead. */
export async function voidTripReward(client, bookingReference) {
  if (!bookingReference) return { ok: true, status: 'none' };
  try {
    const result = await call(client, 'void_trip_voucher', { p_ref: bookingReference });
    return { ok: true, status: result.status || 'none' };
  } catch (error) {
    console.error('⚠️ A trip reward could not be voided', { bookingReference, code: error.code });
    return { ok: false, status: 'error' };
  }
}

export const tripVoucherOf = (verifiedCharge) => (verifiedCharge?.voucher?.code ? verifiedCharge.voucher : null);

export async function isVoucherCode(client, code) {
  const { data, error } = await client.from('vouchers').select('id').eq('code', normalizeVoucherCode(code)).limit(1).maybeSingle();
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  return Boolean(data);
}

export const VOUCHER_MESSAGES = {
  VOUCHER_NOT_FOUND: 'That voucher code was not found. Please check it and try again.',
  VOUCHER_INACTIVE: 'This voucher is no longer active.',
  VOUCHER_NOT_STARTED: 'This voucher cannot be used yet.',
  VOUCHER_EXPIRED: 'This voucher has expired.',
  VOUCHER_USED_UP: 'This voucher has been fully redeemed.',
  VOUCHER_ALREADY_REDEEMED: 'You have already redeemed this voucher.',
  VOUCHER_WRONG_KIND: 'Use this code at checkout when you book a flight.',
  VOUCHER_FIRST_TIME_ONLY: 'This voucher is for first-time customers only.',
};

export const CHECKOUT_VOUCHER_MESSAGES = {
  ...VOUCHER_MESSAGES,
  VOUCHER_NOT_FOUND: 'That code was not found. Please check it and try again.',
  VOUCHER_USED_UP: 'This voucher has been fully used.',
  VOUCHER_ALREADY_REDEEMED: 'You have already used this voucher.',
  VOUCHER_WRONG_KIND: 'Redeem this code in Profile → Jet Wallet.',
};
