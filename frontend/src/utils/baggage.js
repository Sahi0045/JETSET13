/**
 * Baggage allowances come from Amadeus in two mutually exclusive shapes:
 * a weight (`{weight: 15, weightUnit: 'KG'}`) or a piece count
 * (`{quantity: 1}`). Which one an airline files varies by market — Indian
 * domestic fares are usually piece-based, long-haul often weight-based.
 *
 * Every display site that only looked at `.weight` therefore told the
 * customer a piece-based fare carried NO checked bag: the search card read
 * "Cabin only" and the fare selector "Cabin only" on a DEL-BOM fare that
 * actually includes one piece, while the review page — which handled
 * `quantity` — said "1 Piece" on the very next screen.
 *
 * The mirror of that mistake is just as bad: reading a weight as a count
 * rendered a 15 KG allowance as "15 Pieces".
 *
 * One helper so no surface can drift from another again.
 */

/**
 * @param {{weight?: number, weightUnit?: string, quantity?: number}|null} bag
 * @returns {string|null} e.g. "15 KG", "1 Piece", "2 Pieces" — or null when
 *   the fare genuinely carries no checked allowance.
 */
export const formatCheckedBag = (bag) => {
  if (!bag) return null;
  if (typeof bag === 'string') return bag.trim() || null;
  if (bag.weight) return `${bag.weight} ${bag.weightUnit || 'KG'}`;
  if (bag.quantity) return `${bag.quantity} ${bag.quantity === 1 ? 'Piece' : 'Pieces'}`;
  return null;
};

/** True when the fare includes any checked allowance at all. */
export const hasCheckedBag = (bag) => formatCheckedBag(bag) !== null;

/**
 * Recover a structured allowance from the backend's display string, for the
 * fallback path where `baggageDetails` is absent. `parseInt("1 Piece")` is 1,
 * which the old fallback then labelled as one KILOGRAM.
 *
 * @param {string|null} label e.g. "15 KG", "1 Piece"
 * @returns {{weight: number, weightUnit: string}|{quantity: number}|null}
 */
export const parseCheckedBagLabel = (label) => {
  if (!label || typeof label !== 'string') return null;
  const pieces = label.match(/^\s*(\d+)\s*(?:Piece|Pieces|PC|PCS)\b/i);
  if (pieces) return { quantity: parseInt(pieces[1], 10) };
  const weight = label.match(/^\s*(\d+(?:\.\d+)?)\s*(KG|LB|K|L)\b/i);
  if (weight) {
    const unit = weight[2].toUpperCase();
    return { weight: parseFloat(weight[1]), weightUnit: unit === 'K' ? 'KG' : unit === 'L' ? 'LB' : unit };
  }
  return null;
};
