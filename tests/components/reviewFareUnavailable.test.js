import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A fare the airline no longer sells ends in "Search again", not a loop.
 *
 * Checkout turned every pricing failure into "try again in a moment" and the
 * review page's check on arrival hid a failure silently, so a customer on a
 * fare that could not be sold kept pressing Pay. Checkout's side is tested in
 * tests/backend/flightCheckout.test.js; read from source like the other review
 * page checks (customerSurfaces.test.js explains why).
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

describe('the review page on a fare that is no longer available', () => {
  it("answers checkout's FARE_UNAVAILABLE with a Search again action", () => {
    expect(review).toMatch(/refusal\.code === 'FARE_UNAVAILABLE'/);
    expect(review).toMatch(/actionLabel: 'Search again',\s*onAction: searchAgain,/);
  });

  it('goes back to the results for the same search', () => {
    expect(review).toMatch(/const searchAgain = \(\) => \{[\s\S]*?navigate\(`\/flights\/search\?\$\{searchToQuery\(search\)\}`, \{ state: \{ searchData: search \} \}\);/);
  });

  it('says so on arrival when the airline refuses the fare', () => {
    expect(review).toMatch(/if \(body\?\.code === 'FARE_UNAVAILABLE'\) \{\s*setFareGone\(true\);/);
    expect(review).toMatch(/\{fareGone && \(/);
  });

  it('warns on arrival when the fare could not be checked, rather than hiding it', () => {
    expect(review).toMatch(/We couldn't check this fare with the airline just now/);
    expect(review).toMatch(/if \(!res\.ok \|\| !body\?\.success \|\| !Number\.isFinite\(total\) \|\| total <= 0\) \{\s*couldNotCheck\(\);/);
    expect(review).toMatch(/\} catch \{[\s\S]{0,160}couldNotCheck\(\);/);
  });
});
