import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The review page's traveller section, the way MakeMyTrip and Cleartrip do it:
 * saved travellers a signed-in customer taps into the right form, progress per
 * traveller type, and no date of birth asked of a domestic adult.
 *
 * Read from source like customerSurfaces.test.js; the rules themselves are
 * tested in tests/utils/travellerChecks.test.js and savedTravellerSlots.test.js.
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
const review = read('frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

describe('saved travellers on the review page', () => {
  it('are offered to a signed-in customer only, and fill only a form their age fits', () => {
    expect(review).toMatch(/useSavedTravellers\(\{ enabled: Boolean\(user\) \}\)/);
    expect(review).toMatch(/placeSavedTraveller\(passengerData, person, bookingDetails\?\.flight\?\.departureDate\)/);
    expect(review).toMatch(/removeSavedTraveller\(current, person\.id, blankTraveller\)/);
    expect(review).toMatch(/\{user && savedPeople\.length > 0 && \(/);
  });

  it('are saved only when the customer asks, and never hold up payment', () => {
    expect(review).toMatch(/const \[saveForNextTime, setSaveForNextTime\] = useState\(false\);/);
    expect(review).toMatch(/if \(user && saveForNextTime\) \{\s*saveTravellersMutation\.mutate\(passengerData\.map\(toSavedTraveller\)\);/);
    expect(read('frontend/src/hooks/queries/useSavedTravellers.js')).toMatch(/keepalive: true/);
  });
});

describe('checking travellers', () => {
  it('uses one list for the payment check, the progress and the card summary', () => {
    expect(review).toMatch(/const items = problemsOf\(p, index\)/);
    expect(review).toMatch(/travellerProgress\(passengerData, problemsOf\)/);
    expect(review).toMatch(/problemsOf\(passenger, index\)\.length === 0/);
  });

  // Outside the US a domestic adult gives no date of birth; on a US flight
  // everyone does (Secure Flight) - so both flags reach the rule.
  it('asks a domestic adult for no date of birth unless the flight touches the US', () => {
    expect(review).toMatch(/needsDateOfBirth\(\{ type: passenger\.type, international: Boolean\(bookingDetails\?\.isInternational\), secureFlight: Boolean\(bookingDetails\?\.secureFlight\) \}\)/);
    expect(review).toMatch(/secureFlight: Boolean\(bookingDetails\?\.secureFlight\),/);
  });
});
