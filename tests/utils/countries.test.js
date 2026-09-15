import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryByCode, toAlpha3 } from '../../shared/countries.js';

/**
 * Every nationality, on the page and in the booking chain.
 *
 * The review page offered 50 countries in a list that chose only on a mouse
 * press, with no typed fallback and no keyboard selection. A traveller from
 * Colombia, Iceland or anywhere else outside it could not pay for an
 * international trip, and the chain's three-letter table knew the same 50.
 */

describe('the country list', () => {
  it('holds every ISO 3166-1 country once, with codes the passport element takes', () => {
    expect(COUNTRIES).toHaveLength(249);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(249);
    expect(new Set(COUNTRIES.map((c) => c.alpha3)).size).toBe(249);
    for (const country of COUNTRIES) {
      expect(country.code, country.name).toMatch(/^[A-Z]{2}$/);
      expect(country.alpha3, country.name).toMatch(/^[A-Z]{3}$/);
      expect(country.dial, country.name).toMatch(/^\d{1,4}$/);
    }
  });

  it('is in alphabetical order, so a typed letter finds the country', () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('includes countries the old list left out', () => {
    expect(countryByCode('co')).toMatchObject({ name: 'Colombia', alpha3: 'COL', dial: '57' });
    expect(toAlpha3('IS')).toBe('ISL');
    expect(toAlpha3('UZB')).toBe('UZB');
    expect(toAlpha3('ZZ')).toBeNull();
  });
});

describe('the review page asks for nationality from the whole list', () => {
  // From the working directory: under jsdom, import.meta.url is not a file URL.
  const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

  it('in a labelled native select, which the keyboard can operate', () => {
    expect(review).toMatch(/import \{ COUNTRIES \} from '(\.\.\/){5}shared\/countries'/);
    expect(review).toMatch(/<label htmlFor=\{`traveller-\$\{passenger\.id\}-nationality`\}>Nationality/);
    expect(review).toMatch(/<select\s+id=\{`traveller-\$\{passenger\.id\}-nationality`\}/);
  });

  it('with no fixed short list and no mouse-only choice left', () => {
    expect(review).not.toMatch(/const countries = \[/);
    expect(review).not.toMatch(/nationalityDropdown/);
    expect(review).not.toMatch(/onMouseDown=\{\(\) => \{\s*handlePassengerChange\(passenger\.id, 'nationality'/);
  });
});
