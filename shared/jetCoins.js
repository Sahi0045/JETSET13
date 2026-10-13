/**
 * Jet Coins: 1 coin = $0.01. Pure, dependency-free: the browser, the Vercel
 * function and the Lightsail server all load this file.
 */
import { MIN_CARD_CHARGE, roundMoney } from './flightCharge.js';

export const coinsToUsd = (coins) => roundMoney(Math.floor(Number(coins) || 0) / 100);

/** The most coins a checkout can use: never below $1 left on the card. */
export function maxWalletCoinsFor(afterCoupon, balance) {
  const room = Math.round((roundMoney(afterCoupon) - MIN_CARD_CHARGE) * 100);
  const have = Math.floor(Number(balance) || 0);
  return Math.max(0, Math.min(have, room));
}

/** The whole price the customer paid: the card amount plus the coins. */
export const grossPaidOf = (charge) => roundMoney((Number(charge?.total) || 0) + (Number(charge?.walletAmount) || 0));

export const earnedCoinsFor = (cardTotal) => Math.max(0, Math.floor(Number(cardTotal) || 0));

/**
 * Coins a cancel gives back. The card part is decided by decideFlightRefund on
 * what ARC holds; coins cover the rest of what is owed, never more than used.
 */
export function coinsBackOnCancel({ action, heldAmount, kept, coins }) {
  const all = Math.max(0, Math.floor(Number(coins) || 0));
  if (action === 'refund_all' || action === 'refund_less_fee') return all;
  if (action === 'fee_covers') {
    const owedCents = Math.round(((Number(heldAmount) || 0) - (Number(kept) || 0)) * 100) + all;
    return Math.max(0, Math.min(all, owedCents));
  }
  return 0;
}

export const formatCoins = (coins) => new Intl.NumberFormat('en-US').format(Math.floor(Number(coins) || 0));
