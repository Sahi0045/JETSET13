/**
 * Jet Coins: 1 coin = $0.01. Pure, dependency-free: the browser, the Vercel
 * function and the Lightsail server all load this file.
 */
import { MIN_CARD_CHARGE, roundMoney } from './flightCharge.js';

/** What checkout answers when the coins the page asked for are no longer there. */
export const WALLET_CHANGED_MESSAGE = 'Your Jet Coins changed while you were checking out. Please review the total and try again. Nothing has been charged.';

export const coinsToUsd = (coins) => roundMoney(Math.floor(Number(coins) || 0) / 100);

/**
 * The dollars of coins one flight booking may use, by its base fare for all
 * travellers - the airline's fare before taxes, our fee and any coupon: the
 * last band whose `from` is at or below that base fare.
 */
export const DEFAULT_COIN_BANDS = Object.freeze([
  Object.freeze({ from: 0, usd: 1 }),
  Object.freeze({ from: 50, usd: 2 }),
  Object.freeze({ from: 100, usd: 3 }),
  Object.freeze({ from: 150, usd: 4 }),
  Object.freeze({ from: 250, usd: 5 }),
]);

export const MAX_COIN_BANDS = 10;

const toCents = (amount) => Math.round(Number(amount) * 100);
const isDollarsAndCents = (amount) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
  && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;

/** Why a list of coin bands cannot be used, in words for the admin, or null. */
export function coinBandsProblem(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return 'Add at least one band.';
  if (bands.length > MAX_COIN_BANDS) return `Use ${MAX_COIN_BANDS} bands or fewer.`;
  const unreadable = bands.findIndex((band) => !isDollarsAndCents(band?.from) || !isDollarsAndCents(band?.usd));
  if (unreadable >= 0) return `Band ${unreadable + 1}: the price and the coins must be dollars and cents, zero or more.`;
  if (toCents(bands[0].from) !== 0) return 'The first band must start at $0.';
  const outOfOrder = bands.findIndex((band, i) => i > 0 && toCents(band.from) <= toCents(bands[i - 1].from));
  if (outOfOrder > 0) return `Band ${outOfOrder + 1} must start at a higher price than band ${outOfOrder}.`;
  return null;
}

export const usableCoinBands = (bands) => (coinBandsProblem(bands) ? DEFAULT_COIN_BANDS : bands);

/**
 * The price a booking's band is read from: the base fare, or the whole airline
 * fare when the base is unknown. Checkout refuses a card amount that differs
 * from its own, so the page and checkout must both read the band this way.
 */
export function coinBandFareOf(fareTotal, baseFare) {
  const total = roundMoney(fareTotal);
  const base = roundMoney(baseFare);
  return base > 0 && base <= total ? base : total;
}

/** The coins one flight booking may use, from its base fare (coinBandFareOf). */
export function coinLimitFor(fare, bands) {
  const price = toCents(fare);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const reached = usableCoinBands(bands).filter((each) => toCents(each.from) <= price);
  return reached.length ? toCents(reached[reached.length - 1].usd) : 0;
}

/** The most coins any one booking may use. */
export const maxCoinLimitOf = (bands) => Math.max(0, ...usableCoinBands(bands).map((band) => toCents(band.usd)));

/** The most coins a checkout can use: the booking's limit, and never below $1 left on the card. */
export function maxWalletCoinsFor(afterCoupon, balance, limit) {
  const room = Math.round((roundMoney(afterCoupon) - MIN_CARD_CHARGE) * 100);
  const have = Math.floor(Number(balance) || 0);
  const allowed = Math.floor(Number(limit) || 0);
  return Math.max(0, Math.min(have, room, allowed));
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
