import { cancelTermsLines } from './flightCancelPolicy.js';

/**
 * "If you cancel", in plain words, for Manage Booking and the app's booking
 * detail: what cancelling returns now, from the server's quote, and the
 * airline's rules for the fare when its fee table is known.
 */

const refundWords = (cell, fee) => {
  if (!cell || cell.allowed === null || cell.allowed === undefined) return null;
  if (cell.allowed === false) return 'not refundable';
  if (cell.amount === 0) return 'cancelling has no airline fee';
  if (cell.amount > 0) return `cancelling costs ${fee(cell.amount)} per adult`;
  return 'cancelling is allowed for a fee';
};

const changeWords = (cell, fee) => {
  if (!cell || cell.allowed === null || cell.allowed === undefined) return null;
  if (cell.allowed === false) return 'date changes are not allowed';
  if (cell.amount === 0) return 'a date change has no airline fee, only any fare difference';
  if (cell.amount > 0) return `a date change costs ${fee(cell.amount)} per adult plus any fare difference`;
  return 'date changes are allowed for a fee plus any fare difference';
};

export const airlineRuleWords = (penalties, fee) => {
  if (!penalties) return null;
  const parts = [refundWords(penalties.refund?.before, fee), changeWords(penalties.change?.before, fee)].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : null;
};

const whose = (airline) => (airline ? `${airline}'s` : "the airline's");
const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export const QUOTE_UNAVAILABLE = 'We could not work out your refund just now. You will see what happens to your payment as soon as the cancellation completes.';

/**
 * `quote` is the server's cancel quote (shared/flightCancelPolicy.js
 * customerCancelTerms); without one nothing is promised.
 */
export function ifYouCancel({ quote = null, ticketComing = true, penalties = null, airline = '', fee, money, time }) {
  const rules = airlineRuleWords(penalties, fee);
  if (!quote?.policy) {
    return [QUOTE_UNAVAILABLE, ...(rules ? [`${capitalised(whose(airline))} rules for this fare: ${rules}.`] : [])];
  }
  const lines = cancelTermsLines(quote, { ...(money ? { money } : {}), ...(time ? { time } : {}) });
  if (!rules || quote.policy === 'never_booked') return lines;
  if (quote.policy === 'not_ticketed') {
    return ticketComing ? [...lines, `Once the ticket is issued, ${whose(airline)} rules apply: ${rules}.`] : lines;
  }
  return [...lines, `${capitalised(whose(airline))} rules for this fare: ${rules}.`];
}
