/**
 * The airline's cancel and change-date rules as table rows, for the website
 * and the app. A figure appears only when MiniRules gave one agreed amount;
 * an allowed situation without one says a fee applies, never "free".
 */

export const PENALTY_SITUATIONS = Object.freeze([
  { key: 'before', label: 'Before departure' },
  { key: 'noShowBefore', label: 'If you miss the flight' },
  { key: 'after', label: 'After departure' },
]);

const describeCell = (cell, refusal) => {
  if (!cell || cell.allowed === null || cell.allowed === undefined) return { tone: 'unknown', text: 'See fare rules', amount: null };
  if (cell.allowed === false) return { tone: 'notAllowed', text: refusal, amount: null };
  if (Number.isFinite(cell.amount) && !cell.varies) return { tone: 'allowed', text: 'Allowed', amount: cell.amount };
  return { tone: 'allowed', text: 'Allowed, fee applies', amount: null };
};

export function penaltyRows(penalties) {
  if (!penalties?.change || !penalties?.refund) return null;
  return PENALTY_SITUATIONS.map(({ key, label }) => ({
    key,
    label,
    cancel: describeCell(penalties.refund[key], 'Not refundable'),
    change: describeCell(penalties.change[key], 'Not allowed'),
  }));
}
