import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The flight pages promise no discount that is never applied.
 *
 * The search form offered "Special Fares" - Student, Armed Forces, "Have a GST
 * number?", Senior Citizen and Doctors & Nurses, most "Up to ₹600 off" - and the
 * choice was never sent with the search or the booking. The landing page said
 * "$50 OFF · today only" every day, with nothing behind it. Read from source,
 * like customerSurfaces.test.js: a promise quietly put back is what a unit test
 * of a helper cannot see.
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const read = (file) => readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights', file), 'utf8');

describe('the search form', () => {
  const form = read('flight-search-form.jsx');

  it('offers no special fares it never sends', () => {
    expect(form).not.toMatch(/Special Fares/);
    expect(form).not.toMatch(/Up to ₹600 off/);
    expect(form).not.toMatch(/Senior Citizen|Armed Forces|Doctor & Nurses|GST number/);
    expect(form).not.toMatch(/selectedFare|setSelectedFare/);
  });
});

describe('the flights landing page', () => {
  const landing = read('flightlanding.jsx');

  it('advertises no permanent "today only" discount', () => {
    expect(landing).not.toMatch(/\$50 OFF/);
    expect(landing).not.toMatch(/today only/);
  });
});
