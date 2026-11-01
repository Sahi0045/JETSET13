/**
 * What a flight booking was charged, line by line.
 *
 * The confirmation page printed "Base Fare" as the total less taxes, so the
 * service fee and any coupon discount disappeared into the fare. Every line
 * here is a figure checkout recorded, and the lines are shown only when they add
 * up to the total charged; otherwise the total stands on its own.
 *
 * Money is USD: ARC Pay settles only in USD, and a receipt shows what was
 * charged, not a conversion into the visitor's currency.
 */

const cents = (value) => Math.round(Number(value) * 100);

/** 512.4 -> "$512.40". */
export function formatUsd(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
}

function chargeLines({ fare, serviceFee = 0, discount = 0, walletAmount = 0, walletCoins = 0, total, couponCode }) {
  const [f, s, d, w, t] = [fare, serviceFee, discount, walletAmount, total].map((value) => cents(value || 0));
  // A cent either way for rounding; anything more and the lines are not shown.
  if (![f, s, d, w, t].every(Number.isFinite) || f <= 0 || t <= 0 || Math.abs(f + s - d - w - t) > 1) return null;
  const coins = Math.round(Number(walletCoins) || w);
  return {
    total: t / 100,
    lines: [
      { label: 'Airline fare (incl. taxes)', amount: f / 100 },
      ...(s > 0 ? [{ label: 'Platform fee', amount: s / 100 }] : []),
      ...(d > 0 ? [{ label: couponCode ? `Discount (${couponCode})` : 'Discount', amount: -d / 100 }] : []),
      ...(w > 0 ? [{ label: `Jet Coins (${new Intl.NumberFormat('en-US').format(coins)})`, amount: -w / 100 }] : []),
    ],
  };
}

/**
 * @param {object} booking - `chargeBreakdown` from the bookings API (what checkout
 *   verified), or, for a booking just made, the order page's `fareBreakdown` (the
 *   review page's figures) and `amount` (what was paid)
 * @returns {null | { lines: Array<{label: string, amount: number}>, total: number }}
 */
export function bookingChargeLines(booking) {
  const verified = booking?.chargeBreakdown;
  if (verified && Number.isFinite(Number(verified.total))) {
    return chargeLines(verified);
  }

  const fare = booking?.fareBreakdown;
  const paid = Number(booking?.amount ?? booking?.totalAmount);
  if (!fare || !Number.isFinite(paid) || paid <= 0) return null;
  const fareTotal = Number(fare.baseFare || 0) + Number(fare.totalTax || 0);
  const serviceFee = Number(fare.serviceFee || 0);
  const beforeDiscount = Number(fare.totalAmount) > 0 ? Number(fare.totalAmount) : fareTotal + serviceFee;
  const walletAmount = Number(fare.walletAmount || 0);
  return chargeLines({
    fare: fareTotal,
    serviceFee,
    discount: Math.max(0, beforeDiscount - paid - walletAmount),
    walletAmount,
    walletCoins: fare.walletCoins,
    total: paid,
    couponCode: booking?.couponCode,
  });
}

/** Only a reward the server reserved counts: a voucher on the charge may still have been refused when the booking was made. */
export function tripRewardOf(booking) {
  const reward = booking?.tripReward;
  const code = String(reward?.code ?? '').trim();
  const coins = Math.floor(Number(reward?.coins) || 0);
  return code && coins > 0 ? { code, coins } : null;
}

export function tripRewardLine(booking) {
  const reward = tripRewardOf(booking);
  return reward ? `Voucher ${reward.code}: ${new Intl.NumberFormat('en-US').format(reward.coins)} Jet Coins after your trip` : null;
}
