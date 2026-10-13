import supabase from '../config/supabase.js';
import {
  VOUCHER_MESSAGES, captureCoins, redeemVoucher, returnCoins, reverseEarnedCoins, walletSummary,
} from '../services/wallet.service.js';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const STATUS = { VOUCHER_NOT_FOUND: 404, VOUCHER_ALREADY_REDEEMED: 409, VOUCHER_USED_UP: 409 };
const DESK_REASON = 'Returned by the support desk';
const MAX_REASON_LENGTH = 200;

export async function getWallet(req, res) {
  try {
    return res.json({ success: true, data: await walletSummary(supabase, req.user.id) });
  } catch (error) {
    console.error('⚠️ Wallet could not be read:', error.message);
    return res.status(503).json({ success: false, code: 'WALLET_UNAVAILABLE', error: 'Your Jet Wallet could not be loaded just now. Please try again.' });
  }
}

export async function redeem(req, res) {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    return res.status(404).json({ success: false, code: 'VOUCHER_NOT_FOUND', error: VOUCHER_MESSAGES.VOUCHER_NOT_FOUND });
  }
  try {
    const result = await redeemVoucher(supabase, { userId: req.user.id, code });
    return res.json({ success: true, data: { coins: Number(result.coins), balance: Number(result.balance), code: result.code } });
  } catch (error) {
    if (VOUCHER_MESSAGES[error.code]) {
      return res.status(STATUS[error.code] || 400).json({ success: false, code: error.code, error: VOUCHER_MESSAGES[error.code] });
    }
    console.error('⚠️ Voucher could not be redeemed:', error.message);
    return res.status(503).json({ success: false, code: 'WALLET_UNAVAILABLE', error: 'The voucher could not be redeemed just now. Please try again.' });
  }
}

export async function staffReturn(req, res) {
  const bookingReference = String(req.body?.bookingReference || '').trim();
  const coins = Math.floor(Number(req.body?.coins));
  if (!bookingReference || !Number.isFinite(coins) || coins <= 0) {
    return res.status(400).json({ success: false, error: 'A booking reference and a number of coins are needed.' });
  }
  const typedReason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, MAX_REASON_LENGTH).trim() : '';
  const note = `staff ${req.user.id}: ${typedReason || DESK_REASON}`;
  let given;
  try {
    // wallet_return on a hold still `held` releases every coin in it, whatever was typed.
    await captureCoins(supabase, bookingReference);
    given = await returnCoins(supabase, { bookingReference, coins, reason: `desk-${Date.now()}`, note });
    console.log('Staff coin return', { bookingReference, coins, given, staffId: req.user.id });
  } catch (error) {
    console.error('⚠️ Staff coin return failed:', error.message);
    return res.status(503).json({ success: false, error: 'The coins could not be returned just now. Nothing changed; try again.' });
  }
  const returned = `${given.toLocaleString('en-US')} Jet Coins returned`;
  if (given <= 0) return res.json({ success: true, data: { coins: given }, message: returned });
  try {
    await reverseEarnedCoins(supabase, bookingReference);
  } catch (error) {
    // A retry cannot reach this step: the coins are already back, so it would return 0 and skip the reversal.
    console.error('⚠️ Coins returned but the coins earned on the booking were not reversed', { bookingReference, code: error.code });
    return res.json({
      success: true,
      data: { coins: given, earnedReversed: false },
      message: `${returned}, but the coins earned on this booking could not be taken back. Check the booking before telling the customer.`,
    });
  }
  return res.json({ success: true, data: { coins: given }, message: returned });
}
