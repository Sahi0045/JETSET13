import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guest flight booking is an admin switch (Feature Flags > Guest flight
 * booking). Checkout enforces it - tests/backend/flightCheckout.test.js - and
 * these read the pages that expose it, the same way customerSurfaces.test.js
 * does: a redirect quietly dropped or a toggle that shows an unsaved position
 * is exactly what a helper's unit test cannot see.
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
const review = read('frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');
const adminPage = read('frontend/src/Pages/Admin/FeatureFlags.jsx');
const routes = read('backend/routes/featureFlag.routes.js');

describe('the review page follows the guest booking switch', () => {
  it('asks the switch only for a signed-out visitor', () => {
    expect(review).toMatch(/useGuestFlightBooking\(\{ enabled: !authLoading && !user \}\)/);
  });

  it('keeps a guest only on a clear "on" and sends everyone else to log in', () => {
    expect(review).toMatch(/const bookingAsGuest = !user && guestSwitch\.isSuccess && guestSwitch\.data === true/);
    expect(review).toMatch(/if \(guestSwitch\.isPending\) return;/);
    expect(review).toMatch(/sendToLogin\(\{ replace: true \}\)/);
    expect(review).toMatch(/loading \|\| authLoading \|\| \(!user && !bookingAsGuest\)/);
  });

  it("requires a guest's email before payment, with the check checkout uses", () => {
    expect(review).toMatch(/import \{ isUsableEmail \} from '(\.\.\/){5}shared\/email'/);
    expect(review).toMatch(/bookingAsGuest && !isUsableEmail\(/);
  });

  it('sends a guest to log in when the switch went off while the page was open', () => {
    expect(review).toMatch(/refusal\.code === 'LOGIN_REQUIRED'/);
    expect(review).toMatch(/onAction: \(\) => sendToLogin\(\)/);
  });
});

describe("the admin panel's guest booking switch", () => {
  it('reads and writes guest_flight_booking', () => {
    expect(adminPage).toMatch(/const GUEST_FLAG = 'guest_flight_booking'/);
    expect(adminPage).toMatch(/`\/api\/feature-flags\/\$\{GUEST_FLAG\}`/);
  });

  it('shows the position the server stored, never an unsaved one', () => {
    expect(adminPage).toMatch(/setGuestBooking\(\{ enabled: body\.data\?\.enabled === true/);
    expect(adminPage).toMatch(/disabled=\{guestSaving \|\| guestBooking\.enabled === null\}/);
  });

  it("reads stored flags by flag_name, the table's column", () => {
    expect(adminPage).toMatch(/stored\[flag\.flag_name\] = flag/);
    expect(adminPage).not.toMatch(/flag\.flag_key\]/);
  });

  it('can be switched only by an admin, and read by anyone', () => {
    expect(routes).toMatch(/router\.put\('\/:key', protect, admin, upsertFeatureFlag\)/);
    expect(routes).toMatch(/router\.get\('\/guest-flight-booking', getGuestFlightBooking\)/);
  });
});
