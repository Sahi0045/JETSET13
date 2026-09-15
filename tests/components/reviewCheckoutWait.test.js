import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Starting the payment waits as long as checkout takes.
 *
 * The browser gave up after 10 seconds while checkout was still pricing the
 * fare (up to 25 seconds) and opening the ARC session (up to 30), so a slow
 * airline read as "Payment service unavailable" and every retry started over.
 * Checkout's side is tested in tests/backend/checkoutReuse.test.js; read from
 * source like the other review page checks (customerSurfaces.test.js).
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
const review = read('frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');
const arcPay = read('frontend/src/Services/ArcPayService.js');

describe('starting the payment', () => {
  it('allows the hosted checkout call a minute, and only that call', () => {
    expect(arcPay).toMatch(/'\?action=hosted-checkout', \{[\s\S]*?\}, \{[\s\S]*?timeout: 60000[\s\S]*?\}\);/);
    expect(arcPay).toMatch(/timeout: 10000 \/\/ 10 second timeout/);
  });

  it('tells the customer it is still checking the fare after a few seconds', () => {
    expect(review).toMatch(/setTimeout\(\(\) => setSlowCheckout\(true\), 8000\)/);
    expect(review).toMatch(/slowCheckout \? 'Still checking the fare…' : 'Checking the fare…'/);
    expect(review).toMatch(/The airline is taking longer than usual to confirm the fare\. Please keep this page open\./);
  });
});
