import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The flight review page shows what the card is charged, in the currency it is
 * charged in.
 *
 * It converted every figure with the browser's exchange rates - the hardcoded
 * table when the live fetch failed - and never said the merchant settles only
 * in US dollars: the page read ₹41,820, ARC charged USD 501.75, and the bank
 * billed ₹42,900. Read from source, like the other review page checks
 * (customerSurfaces.test.js explains why).
 */
const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
const review = read('frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

describe('the review page quotes the charge in US dollars', () => {
  it('no longer converts its amounts silently', () => {
    expect(review).not.toMatch(/<Price\b/);
    expect(review).not.toMatch(/import Price from/);
  });

  it('shows every amount through the charge display', () => {
    expect(review).toMatch(/<ChargeAmount amount=\{calculatedFare\.baseFare\} \/>/);
    expect(review).toMatch(/<ChargeAmount amount=\{calculatedFare\.totalTax\} \/>/);
    expect(review).toMatch(/<ChargeAmount amount=\{appliedCoupon\.discountAmount\} \/>/);
    expect(review).toMatch(/formatAmount=\{formatUsd\}/);
  });

  it('adds an estimate only beside the totals, and says the card is charged in dollars', () => {
    expect(review.match(/<ChargeAmount amount=\{amountDue\} approximate/g)).toHaveLength(2);
    expect(review).toMatch(/Your card is charged in US dollars \(USD\)\. An amount shown in another currency is an estimate/);
    expect(review).toMatch(/Total, charged in USD/);
  });

  it('puts the dollar amount on the Pay button', () => {
    expect(review).toMatch(/`Pay \$\{formatUsd\(amountDue\)\}`/);
  });

  it('names one currency for both figures when the fare moved', () => {
    expect(review).toMatch(/is \$\{fareCurrency\} \$\{total\.toFixed\(2\)\}, not the \$\{fareCurrency\} \$\{searched\.toFixed\(2\)\}/);
  });
});
