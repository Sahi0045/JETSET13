import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A fare the airline no longer sells ends in another flight, not a loop and
 * not a retyped form.
 *
 * Checkout turned every pricing failure into "try again in a moment" and the
 * review page's check on arrival hid a failure silently, so a customer on a
 * fare that could not be sold kept pressing Pay. Then it ended in one button
 * back to the results, which lost every name, date of birth and passport
 * number typed - the traveller draft is tied to the exact flight. Now the
 * fares on sale now are offered on the page itself. Checkout's side is tested
 * in tests/backend/flightCheckout.test.js; read from source like the other
 * review page checks (customerSurfaces.test.js explains why).
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

describe('the review page on a fare that is no longer available', () => {
  it("answers checkout's FARE_UNAVAILABLE by fetching the fares on sale now", () => {
    expect(review).toMatch(/refusal\.code === 'FARE_UNAVAILABLE'/);
    expect(review).toMatch(/if \(refusal\.code === 'FARE_UNAVAILABLE'\) \{[\s\S]{0,600}?loadAlternatives\(\);/);
  });

  // The whole point: a refused fare must not cost the customer the form.
  it('tells the customer their traveller details are kept', () => {
    expect(review).toMatch(/Your traveller details are kept/);
    expect(review).toMatch(/Flight changed, and your traveller details are as you left them/);
  });

  // Choosing an alternative swaps the flight in place. It must not navigate
  // away - that is what threw the travellers away before.
  it('swaps the flight on this page rather than leaving it', () => {
    expect(review).toMatch(/const chooseAlternative = \(choice\) => \{/);
    expect(review).toMatch(/setPassengerData\(\(current\) => rebuildTravellers\(current, choice\.originalOffer\.travelerPricings, blankTraveller\)\);/);
    expect(review).toMatch(/navigate\(`\$\{routerLocation\.pathname\}\$\{routerLocation\.search\}`, \{\s*replace: true,\s*state: \{ \.\.\.\(routerLocation\.state \|\| \{\}\), flightData \},/);
  });

  // The fare that was just refused must not be offered straight back.
  it('leaves the refused fare out of the alternatives', () => {
    expect(review).toMatch(/const dead = fareIdentity\(offer\);/);
    expect(review).toMatch(/fareIdentity\(flight\.originalOffer\) !== dead/);
  });

  // A different group is a different fare, so the search that finds the
  // alternatives asks for the group this one was priced for.
  it('searches for the group the dead fare was priced for', () => {
    expect(review).toMatch(/searchForGroup\(reviewState\?\.searchData, offer, groupFromOffer\(offer\)\)/);
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
