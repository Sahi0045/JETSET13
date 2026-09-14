/**
 * What the customer's card is charged, and roughly what that is in the
 * currency they browse in.
 *
 * The merchant settles only in US dollars (ARC_SETTLEMENT_CURRENCY in
 * backend/routes/payment/arcpay.config.js), so a flight is charged in USD
 * whatever the site displays. The review page used to convert its whole fare
 * summary with the browser's rates - the hardcoded table whenever the live
 * fetch failed - and never said so: the page read ₹41,820, ARC charged
 * USD 501.75, and the bank billed ₹42,900 with its own rate and fee.
 */

export const CHARGE_CURRENCY = 'USD';

/** "US$1,234.56". A bare "$" reads as any dollar - Singapore, Australian, Canadian. */
export function formatUsd(amount) {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  return `US$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The charge in the visitor's display currency, or null when there is nothing
 * honest to show: they browse in US dollars already, or the rate is not a live
 * one. A hardcoded rate printed beside a charge reads as a quote, so the dollar
 * amount alone is the truthful fallback.
 *
 * @param {number} amountUsd
 * @param {{ currency?: string, rate?: number, ratesLive?: boolean }} options
 * @returns {{ currency: string, amount: number } | null}
 */
export function approximateCharge(amountUsd, { currency, rate, ratesLive } = {}) {
  if (ratesLive !== true || !currency || currency === CHARGE_CURRENCY) return null;
  const usd = Number(amountUsd);
  const perDollar = Number(rate);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(perDollar) || perDollar <= 0) return null;
  // A rate of exactly 1 for another currency is the rate lookup's default for
  // one it does not know, not a rate.
  if (perDollar === 1) return null;
  return { currency, amount: usd * perDollar };
}
