/**
 * What a customer gets back when they cancel a flight, and the words for it.
 *
 * The owner's rule of 2026-10-11: before the ticket is issued, or until the
 * ticket can no longer be voided, the airline price comes back and our service
 * fee is kept; after that the airline's fare rules decide, and our team
 * settles it. The free window ends when the ticketing office's day ends,
 * because that is when a ticket stops being voidable: a free window of 24
 * hours promised refunds the airline would not give back, and auto-ticketing
 * issues the ticket at booking. One implementation for the cancel route that
 * moves the money, the quote shown before a cancel, the review page and the
 * app. Dependency-free: the browser, Vercel, Lightsail and the app all load it.
 */

export const FREE_CANCEL_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export const CUSTOMER_REVIEW_POLICIES = Object.freeze(['not_voided', 'refundable', 'non_refundable', 'rules_unknown']);

const known = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const timeOf = (value) => (value instanceof Date ? value.getTime() : Date.parse(value ?? ''));

const usd = (amount, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toFixed(2)}`.trim();
  }
};
const clock = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

const zoneOffsetMs = (instant, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]));
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - (instant - (instant % 1000));
};

const nextMidnightIn = (instant, timeZone) => {
  const wallNow = instant + zoneOffsetMs(instant, timeZone);
  const day = new Date(wallNow);
  const wallMidnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
  const guess = wallMidnight - zoneOffsetMs(instant, timeZone);
  return wallMidnight - zoneOffsetMs(guess, timeZone);
};

/**
 * The service fee a customer cancel keeps: what checkout charged as the fee,
 * less the coupon, which comes off the fee first so nobody gets back more than
 * they paid. Null when checkout recorded no fee.
 */
export function serviceFeeKeptOf(charge) {
  if (!charge || !known(charge.serviceFee)) return null;
  const discount = known(charge.discount) ? Math.max(0, Number(charge.discount)) : 0;
  return cents(Math.max(0, Number(charge.serviceFee) - discount));
}

/**
 * When the free window ends: the end of the booking day in the ticketing
 * office's time zone (AMADEUS_WS_OFFICE_TIME_ZONE, the zone the cancel's void
 * uses), never more than 24 hours. Null - a closed window - when the booking
 * time or the zone cannot be read, so a doubt goes to our team, not to an
 * automatic refund.
 */
export function freeUntilOf(paidAt, timeZone) {
  const start = timeOf(paidAt);
  if (!Number.isFinite(start) || !timeZone) return null;
  try {
    return new Date(Math.min(start + FREE_CANCEL_HOURS * HOUR_MS, nextMidnightIn(start, timeZone))).toISOString();
  } catch {
    return null;
  }
}

export function isWithinFreeWindow(paidAt, now = new Date(), timeZone) {
  const until = freeUntilOf(paidAt, timeZone);
  const at = timeOf(now);
  return until !== null && Number.isFinite(at) && at < Date.parse(until);
}

export function fareRuleOf(penalties) {
  const cell = penalties?.refund?.before;
  const refundable = cell?.allowed === true ? true : cell?.allowed === false ? false : null;
  const penalty = refundable === true && known(cell?.amount) ? cents(cell.amount) : null;
  return { refundable, penalty, currency: penalty === null ? null : (penalties?.currency || null) };
}

/**
 * What cancelling now returns. `paidAt` is the booking's `created_at`; `now` is
 * when the customer asked; `timeZone` is the ticketing office's. A booking
 * whose service fee was never recorded keeps nothing.
 */
export function customerCancelTerms({ charge, paidAt, now = new Date(), timeZone, hasReservation, ticketed, fareRule = null, cancellationFee = null } = {}) {
  // Same sum as jetCoins.grossPaidOf, inline so the app's copy of this file has no imports.
  const paid = known(charge?.total) ? cents((Number(charge.total) || 0) + (Number(charge.walletAmount) || 0)) : null;
  const serviceFeeKept = Math.min(serviceFeeKeptOf(charge) ?? 0, paid ?? Infinity);
  const airlinePrice = paid === null ? null : cents(Math.max(0, paid - serviceFeeKept));
  const walletCoins = Math.max(0, Math.floor(Number(charge?.walletCoins) || 0));
  const splitRefund = (amount) => {
    if (amount === null) return { coinsBack: 0, cardBack: null };
    const coinsBack = Math.min(walletCoins, Math.round(amount * 100));
    return { coinsBack, cardBack: cents(amount - coinsBack / 100) };
  };
  const undecided = { coinsBack: 0, cardBack: null };
  const base = { paid, serviceFeeKept, airlinePrice, ...splitRefund(airlinePrice), penalty: null, penaltyCurrency: null, cancellationFee: null, freeUntil: freeUntilOf(paidAt, timeZone) };

  if (!hasReservation) return { ...base, policy: 'never_booked', automatic: true, serviceFeeKept: 0, airlinePrice: paid, refundAmount: paid, ...splitRefund(paid) };
  if (!ticketed) return { ...base, policy: 'not_ticketed', automatic: true, refundAmount: airlinePrice };
  if (isWithinFreeWindow(paidAt, now, timeZone)) return { ...base, policy: 'free_window', automatic: true, refundAmount: airlinePrice };
  if (fareRule?.refundable === false) return { ...base, policy: 'non_refundable', automatic: false, refundAmount: null, ...undecided };
  if (fareRule?.refundable === true) {
    return {
      ...base,
      policy: 'refundable',
      automatic: false,
      refundAmount: null,
      ...undecided,
      penalty: fareRule.penalty ?? null,
      penaltyCurrency: fareRule.currency ?? null,
      cancellationFee: known(cancellationFee) ? cents(cancellationFee) : null,
    };
  }
  return { ...base, policy: 'rules_unknown', automatic: false, refundAmount: null, ...undecided };
}

export function cancelTermsLines(terms, { money = usd, time = clock } = {}) {
  if (!terms?.policy) return [];
  const lines = policyLines(terms, { money, time });
  if (terms.coinsBack > 0) {
    const rest = known(terms.cardBack) && Number(terms.cardBack) <= 0 ? '.' : ', and the rest to your card.';
    lines.push(`${money(terms.coinsBack / 100)} goes back to your Jet Wallet as ${terms.coinsBack.toLocaleString('en-US')} Jet Coins${rest}`);
  }
  return lines;
}

function policyLines(terms, { money, time }) {
  const back = known(terms.airlinePrice) ? money(terms.airlinePrice) : 'what you paid';
  const kept = Number(terms.serviceFeeKept) > 0 ? money(terms.serviceFeeKept) : null;
  const youGetBack = `You get back ${back}${kept ? `; the ${kept} service fee is not refundable.` : '.'}`;
  switch (terms.policy) {
    case 'never_booked':
      return ['This booking was never confirmed with the airline, so everything you paid is returned.'];
    case 'not_ticketed':
      return [`No ticket has been issued yet. ${youGetBack}`];
    case 'free_window':
      return [`${terms.freeUntil ? `Free cancellation until ${time(terms.freeUntil)}` : 'Free cancellation applies'}. ${youGetBack}`];
    case 'refundable': {
      const penalty = known(terms.penalty) ? ` of ${money(terms.penalty, terms.penaltyCurrency || 'USD')} per adult` : '';
      const fee = Number(terms.cancellationFee) > 0 ? ` and our ${money(terms.cancellationFee)} cancellation fee` : '';
      return [
        `This fare is refundable. You get back ${back} less the airline's cancellation penalty${penalty}${fee}.`,
        ...(kept ? [`The ${kept} service fee is not refundable.`] : []),
        'Our team confirms the amount with the airline and emails you within 2 business days.',
      ];
    }
    case 'non_refundable':
      return [
        'This fare is non-refundable, so the fare is not returned.',
        'Our team checks with the airline for any unused taxes and emails you within 2 business days.',
      ];
    default:
      return ["We could not read this fare's rules just now. Our team checks them with the airline and emails you within 2 business days to confirm what is returned."];
  }
}

/**
 * Our cancellation fee in words: "$50.00 plus 10% of what you paid", "10% of
 * what you paid" or "$50.00"; null when both parts are 0.
 */
export function cancellationFeeWords({ flat = null, percent = null, money = usd, whoPaid = 'what you paid' } = {}) {
  const flatPart = Number(flat) > 0 ? money(flat) : '';
  const percentPart = known(percent) && Number(percent) > 0 ? `${Number(percent)}% of ${whoPaid}` : '';
  if (flatPart && percentPart) return `${flatPart} plus ${percentPart}`;
  return flatPart || percentPart || null;
}

/** `freeUntil`: when a booking made now stops being free to cancel, when known. */
export function cancelPolicyLines({ cancellationFee = null, cancellationFeePercent = null, freeUntil = null, money = usd, time = clock } = {}) {
  const words = cancellationFeeWords({ flat: cancellationFee, percent: cancellationFeePercent, money });
  const hasPercent = known(cancellationFeePercent) && Number(cancellationFeePercent) > 0;
  const fee = !words ? '' : (hasPercent ? ` and our cancellation fee of ${words}` : ` and our ${words} cancellation fee`);
  return [
    freeUntil
      ? `Book now and you can cancel free until ${time(freeUntil)}: you get back the airline price. The service fee is not refundable.`
      : "You can cancel free until 11:59 PM on the day you book (our ticketing office's time): you get back the airline price. The service fee is not refundable.",
    `After that the airline's fare rules apply: a refundable fare returns the airline price less the airline's penalty${fee}; a non-refundable fare returns only unused taxes.`,
    'If the airline cancels or changes your flight, you get back everything you paid.',
  ];
}
