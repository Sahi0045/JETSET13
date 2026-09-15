import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cancelling on ARC's payment page returns to the booking, as it was left.
 *
 * The cancel link went to /flights?cancelled=true, which the landing page
 * ignores, and the review page had already cleared the flight it kept: the
 * flight and every detail typed were lost, and nothing said whether anything
 * was charged. The rules for restoring are tested in
 * tests/utils/cancelledCheckout.test.js; this reads the page's wiring, like the
 * other review page checks (customerSurfaces.test.js explains why).
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

describe('the review page after a cancelled payment', () => {
  it('sends ARC a cancel link back to itself', () => {
    expect(review).toMatch(/cancelUrl: cancelUrlFor\(window\.location\.origin\),/);
    expect(review).not.toMatch(/\/flights\?cancelled=true/);
  });

  it('restores the saved booking only on that return', () => {
    expect(review).toMatch(/!routerLocation\.state\?\.flightData && isCancelledReturn\(routerLocation\.search\)\s*\?\s*readCancelledCheckout\(\)/);
    expect(review).toMatch(/cancelledCheckout\?\.reviewState \?\? readFlightReview\(\)/);
  });

  it('puts the travellers and contact details back when they still fit the fare', () => {
    expect(review).toMatch(/restored\.length === types\.length && restored\.every\(\(t, index\) => t\?\.type === types\[index\]\)/);
    expect(review).toMatch(/cancelledCheckout\?\.contact \? \{ \.\.\.bookingData, contact: cancelledCheckout\.contact \}/);
  });

  it('says the payment was cancelled and nothing was charged', () => {
    expect(review).toMatch(/Payment was cancelled - nothing was charged\. Your flight and traveller details are as you left them\./);
    expect(review).toMatch(/\{paymentCancelled && \(/);
  });

  it('keeps the restored flight across a refresh without restoring it again', () => {
    expect(review).toMatch(/navigate\(routerLocation\.pathname, \{ replace: true, state: cancelledCheckout\.reviewState \}\)/);
  });

  it('saves the search with the booking, so Search again still has it', () => {
    expect(review).toMatch(/searchData: reviewState\?\.searchData \?\? null/);
  });
});
