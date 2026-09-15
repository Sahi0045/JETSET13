import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Passport fields follow the server's answer to "does this trip cross a border".
 *
 * The review page decided it from its own short airport list, while checkout
 * decides it from the server's full airport index. A trip the page called
 * domestic hid the passport fields that checkout then refused the booking
 * without. The page's arrival price check already gets the server's answer in
 * `meta.international`; the page now takes it. Read from source like the other
 * review page checks (customerSurfaces.test.js explains why).
 */
const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

describe("the review page's passport rule", () => {
  it("takes the server's international answer from the arrival price check", () => {
    expect(review).toMatch(/const serverInternational = body\?\.meta\?\.international;/);
    expect(review).toMatch(/typeof serverInternational === 'boolean'[\s\S]{0,200}isInternational: serverInternational/);
  });

  it('still shows the passport fields from that same flag', () => {
    expect(review).toMatch(/\{bookingDetails\?\.isInternational && \(<>/);
  });
});
