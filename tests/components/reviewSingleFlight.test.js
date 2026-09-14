import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One trip, one payment page.
 *
 * Every Pay click opened a new ARC payment page under a new reference. Pay was
 * re-enabled the moment the redirect began, so a second click while the
 * browser was leaving - or the back button, or a second tab - left a customer
 * with two live payment pages for the same trip, and paying both booked it
 * twice. Read from source, like the other review page checks
 * (customerSurfaces.test.js explains why); checkout's side is tested in
 * tests/backend/checkoutReuse.test.js.
 */
const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
const review = read('frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');
const orderPage = read('frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');

describe('the review page opens one payment page at a time', () => {
  it('refuses a second click synchronously, not only through state', () => {
    expect(review).toMatch(/const paymentStarting = React\.useRef\(false\);/);
    expect(review).toMatch(/if \(paymentStarting\.current\) return;/);
    expect(review).toMatch(/paymentStarting\.current = true;\s*setCheckingOut\(true\);/);
  });

  it('keeps Pay disabled while the browser is on its way to the payment page', () => {
    expect(review).toMatch(/redirecting = true;\s*setOpeningPayment\(true\);\s*window\.location\.href = checkoutResponse\.checkoutUrl;/);
    expect(review).toMatch(/if \(!redirecting\) paymentStarting\.current = false;/);
    expect(review.match(/disabled=\{checkingOut \|\| openingPayment\}/g)).toHaveLength(2);
    expect(review).toMatch(/openingPayment \? 'Opening secure payment…'/);
  });

  it('lets a customer who came back from the payment page try again', () => {
    expect(review).toMatch(/window\.addEventListener\('pageshow', onPageShow\)/);
    expect(review).toMatch(/if \(!event\.persisted\) return;\s*paymentStarting\.current = false;/);
  });

  // Checkout may hand back the payment page already open for this trip, under
  // that page's reference - the one ARC returns the payer with.
  it("remembers checkout's reference, not the one it asked for", () => {
    expect(review).toMatch(/orderId: checkoutResponse\.orderId \|\| orderId,/);
  });
});

describe('the order page on a payment held as a duplicate', () => {
  it('says the trip was not booked twice, and offers no retry', () => {
    expect(orderPage).toMatch(/errorCode === 'DUPLICATE_PAYMENT'/);
    expect(orderPage).toMatch(/We did not book this trip twice/);
  });
});
