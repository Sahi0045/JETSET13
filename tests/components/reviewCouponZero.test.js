import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A coupon that takes the total to $0.00.
 *
 * No payment page opens for nothing, so Pay sent an amount of 0 and checkout
 * answered "Missing required fields: amount and orderId are required", which
 * the page showed as it was. Checkout's side is tested in
 * tests/backend/flightCheckout.test.js; read from source like the other review
 * page checks (customerSurfaces.test.js).
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

describe('the review page and a coupon worth the whole fare', () => {
  it('refuses the coupon when it is applied, and says why', () => {
    expect(review).toMatch(/if \(!\(Number\(coupon\?\.finalTotal\) > 0\)\) \{\s*setCouponProblem\(/);
    expect(review).toMatch(/This coupon covers the whole fare, and a booking cannot be paid for at \$0\.00 online/);
    expect(review).toMatch(/\{couponProblem && \(/);
  });

  it('clears the coupon box, which would otherwise show the coupon as applied', () => {
    expect(review).toMatch(/setCouponInputRound\(\(round\) => round \+ 1\)/);
    expect(review).toMatch(/key=\{`\$\{calculatedFare\.totalAmount\}-\$\{couponInputRound\}`\}/);
  });

  it("shows checkout's own words only for a refusal written for customers", () => {
    expect(review).toMatch(/message: String\(\(refusal\.code && refusal\.error\) \|\| 'Please try again in a moment\.'\)/);
  });
});
