import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The review page's service fee comes from the one rule checkout charges by,
 * and says who it is for.
 *
 * A lap infant pays no fixed service fee (owner's decision, 2026-09-15). The fee
 * used to be charged for every priced traveller, and the page showed one line
 * "for 3 travellers" for two adults and a baby. Read from source, like the
 * other review page checks (customerSurfaces.test.js explains why).
 */
const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
const review = read('frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');
const checkout = read('backend/services/flightCheckout.service.js');

describe('the service fee on the review page', () => {
  it("computes the charge from the offer's traveller types, as checkout does", () => {
    expect(review).toMatch(/travellerTypes: travellerTypesOf\(reviewState\?\.flightData\?\.originalOffer\)/);
    expect(review).toMatch(/travellerTypes: travellerTypesOf\(flightData\.originalOffer\)/);
    expect(checkout).toMatch(/const travellerTypes = travellerTypesOf\(offer\);/);
    expect(checkout).toMatch(/computeFlightCharge\(\{ fareTotal, travellerTypes, config \}\)/);
    expect(checkout).toMatch(/computeFlightCharge\(\{ fareTotal, travellerTypes, config, discount \}\)/);
  });

  it('never passes a bare passenger count, which charges a lap infant', () => {
    expect(review).not.toMatch(/computeFlightCharge\(\{[^}]*passengers/);
    expect(checkout).not.toMatch(/computeFlightCharge\(\{[^}]*passengers/);
  });

  it('shows the breakdown from that same computation', () => {
    expect(review).toMatch(/fixedFeeByType: charge\.fixedFeeByType/);
    expect(review).toMatch(/describeServiceFee\(calculatedFare\)/);
  });
});
