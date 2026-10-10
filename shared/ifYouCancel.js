/**
 * "If you cancel", in plain words, for Manage Booking and the app's booking
 * detail: what cancelling does now, by ticket state, in the cancel dialog's
 * words, and the airline's rules for the fare when its fee table is known.
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

export function ifYouCancel({ ticketState, ticketsVoided = false, ticketComing = true, penalties = null, airline = '', fee }) {
  if (ticketState === 'cancelled') return [];
  const rules = airlineRuleWords(penalties, fee);
  if (ticketState === 'issued' || ticketState === 'pending') {
    return [
      'Your ticket has been issued, so a cancellation fee may apply.',
      ...(rules ? [`${capitalised(whose(airline))} rules for this fare: ${rules}.`] : []),
      "What is refunded depends on your fare's rules; some fares need our team to review the refund first.",
    ];
  }
  if (ticketsVoided) {
    return ['Your ticket has been voided, so a cancellation fee may apply.', 'Some refunds need our team to review them first.'];
  }
  return [
    'No ticket has been issued yet, so no cancellation fee applies and what you paid is returned.',
    ...(rules && ticketComing ? [`Once the ticket is issued, ${whose(airline)} rules apply: ${rules}.`] : []),
  ];
}
