import { describe, expect, it } from 'vitest';
import { readCode } from '../helpers/source.js';

/**
 * Three places the flight pages sent a customer somewhere that could only fail.
 *
 * Each was reachable by ordinary clicking and none of them was a rare state:
 * one fired on every click, one on any visit without a search, and one sat
 * directly under a sentence saying the opposite.
 */

const read = readCode;

const landing = read('frontend/src/Pages/Common/flights/flightlanding.jsx');
const results = read('frontend/src/Pages/Common/flights/flightsearchpage.jsx');
const review = read('frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');
const checks = read('frontend/src/utils/travellerChecks.js');

/**
 * "Explore more destinations" sent `to: ""` and navigated to the results page,
 * unconditionally. There is no search with no destination: the results page
 * answers "Please choose where you are flying from, where to, and the date" and
 * offers a Retry that repeats the identical empty search. The most prominent
 * button under the destination gallery led nowhere else, ever.
 */
describe('"Explore more destinations"', () => {
  it('no longer searches for an empty destination', () => {
    expect(landing).not.toMatch(/to:\s*""\s*,?\s*\/\/\s*Empty destination/);
    expect(landing).not.toMatch(/to:\s*""/);
  });

  it('takes the customer to the search form and asks where to', () => {
    expect(landing).toMatch(/const handleExploreDestinations = \(\) => \{[\s\S]*?getElementById\('flight-search'\)/);
    expect(landing).toMatch(/input\[name="to"\]/);
  });

  it('gives the form the id that button scrolls to', () => {
    expect(landing).toMatch(/id="flight-search"/);
  });
});

/**
 * A destination card built its origin from `city`, empty until the geo lookup
 * answers and empty for ever if the visitor blocks it, and from `cityCode`,
 * which useLocationContext has never exposed - so it was always undefined. A
 * card clicked in the first second went to the same error page.
 */
describe('a destination card with no known origin', () => {
  it('stops reading a field the location context does not have', () => {
    expect(landing).not.toMatch(/const \{ city, cityCode \}/);
  });

  it('keeps the destination and asks where they are flying from', () => {
    expect(landing).toMatch(/if \(!fromCode\) \{[\s\S]*?setPrefill\(\{[\s\S]*?to: toCode/);
    expect(landing).toMatch(/input\[name="from"\]/);
  });

  it('hands that half-filled search to the form', () => {
    expect(landing).toMatch(/initialData=\{prefill \?\? undefined\}/);
  });
});

/**
 * With no search at all the results effect returned early leaving `loading`
 * false and `error` null, so a hardcoded Delhi-to-Hyderabad rendered as a
 * finished result: "0 flights found" for a route nobody chose, with an inert
 * date strip. It reads as "we have no flights", not "we have no search".
 */
describe('the results page with no search', () => {
  it('invents no route', () => {
    expect(results).not.toMatch(/from:\s*'DEL',\s*\n\s*to:\s*'HYD'/);
  });

  it('says what is missing instead of showing zero results', () => {
    expect(results).toMatch(/if \(!searchData\) \{[\s\S]*?setError\(/);
    expect(results).toMatch(/Tell us where you are flying from/);
  });
});

/**
 * `fareGone` was set when the airline withdrew the fare and then read in
 * exactly one place - to offer a "Search again" link - so the page said "The
 * airline can no longer sell this fare" directly above a live Pay button.
 */
describe('the Pay button on a withdrawn fare', () => {
  it('refuses to open a payment for it', () => {
    expect(review).toMatch(/if \(fareGone\) \{[\s\S]*?setNotice\(/);
  });

  it('offers the way out rather than a dead end', () => {
    const guard = review.slice(review.indexOf('if (fareGone) {'), review.indexOf('if (fareGone) {') + 600);
    expect(guard).toMatch(/no longer available/i);
    expect(guard).toMatch(/onAction: \(\) => searchAgain\(\)/);
  });

  it('is checked before anything is charged', () => {
    const start = review.indexOf('const handleProceedToPayment');
    const guard = review.indexOf('if (fareGone) {', start);
    const checkout = review.indexOf('paymentStarting.current = true', start);
    expect(guard).toBeGreaterThan(start);
    expect(guard).toBeLessThan(checkout);
  });
});

/**
 * SMS was promised in three places and `sms.service.js` is imported by nothing
 * in the backend. The mobile number is still required, and still should be: the
 * airline puts it on the PNR to reach the traveller about a schedule change.
 * That is the promise we keep, so that is the one the page makes.
 */
describe('what the mobile number is for', () => {
  it('no longer promises alerts nothing sends', () => {
    expect(review).not.toMatch(/Booking alerts will be sent to/);
    expect(checks).not.toMatch(/for booking updates/);
  });

  it('says what actually happens with it', () => {
    expect(review).toMatch(/The airline will use/);
    expect(checks).toMatch(/so the airline can reach you about the flight/);
  });

  it('promises the reference by email, which is what is sent', () => {
    expect(review).toMatch(/Your booking reference is emailed to you after payment/);
  });
});

/**
 * Retry re-runs the search that failed. With no search to run it can only fail
 * the same way - the shape the customer was already stuck in. What that page
 * can offer is the form, so the form opens itself and the button goes.
 */
describe('the results page offering a way on', () => {
  it('opens the search form when there is nothing to show', () => {
    expect(results).toMatch(/open=\{!searchData\}/);
    expect(read('frontend/src/Pages/Common/flights/FlightModifyBar.jsx'))
      .toMatch(/open = false[\s\S]*?useState\(Boolean\(openTravellers\) \|\| Boolean\(open\)\)/);
  });

  it('offers Retry only when there is a search to retry', () => {
    expect(results).toMatch(/\{searchData && \([\s\S]*?Retry/);
  });

  it('does not head the page "Flights from  to" with two blanks', () => {
    expect(results).toMatch(/searchData\s*\?\s*<>Flights from/);
    expect(results).toMatch(/'Find a flight'/);
  });
});
