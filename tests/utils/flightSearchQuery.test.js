import { describe, expect, it } from 'vitest';
import {
  extractIata,
  searchFromQuery,
  searchToQuery,
} from '../../frontend/src/Pages/Common/flights/searchQuery.js';

/**
 * The flight search results URL.
 *
 * The page wrote `?from=&to=&date=` onto its own URL whenever the user picked a
 * date in the strip, and then never read it back — it took its criteria only
 * from router navigation state. State does not survive a refresh, a bookmark,
 * a pasted link or a restored tab, and all of those fell through to a
 * hardcoded DEL-HYD search for today: a different route from the one named in
 * the address bar the user was looking at.
 */

describe('searchFromQuery', () => {
  it('reads the URL the page itself writes', () => {
    // This is verbatim what the date strip put in the address bar.
    expect(searchFromQuery('?from=DEL&to=BOM&date=2026-09-27')).toEqual({
      from: 'DEL',
      to: 'BOM',
      departDate: '2026-09-27',
      returnDate: '',
      tripType: 'one-way',
      adults: 1,
      travelers: 1,
      children: 0,
      infants: 0,
      travelClass: 'ECONOMY',
    });
  });

  it('carries passengers and cabin, which the old writer dropped', () => {
    const parsed = searchFromQuery('?from=DEL&to=BOM&date=2026-09-27&adults=3&children=1&travelClass=BUSINESS');

    expect(parsed.adults).toBe(3);
    expect(parsed.children).toBe(1);
    expect(parsed.travelClass).toBe('BUSINESS');
  });

  it('infers a round trip from a return date', () => {
    const parsed = searchFromQuery('?from=JFK&to=LHR&date=2026-10-01&returnDate=2026-10-08');

    expect(parsed.returnDate).toBe('2026-10-08');
    expect(parsed.tripType).toBe('round-trip');
  });

  it('refuses a partial URL rather than searching for something else', () => {
    // Returning a half-filled search here is how the page ended up running
    // DEL-HYD: anything non-null would be treated as the user's search.
    expect(searchFromQuery('?from=DEL')).toBeNull();
    expect(searchFromQuery('?from=DEL&to=BOM')).toBeNull();
    expect(searchFromQuery('')).toBeNull();
    expect(searchFromQuery('?ref=newsletter')).toBeNull();
  });

  it('accepts departDate as well as date', () => {
    expect(searchFromQuery('?from=DEL&to=BOM&departDate=2026-09-27')?.departDate).toBe('2026-09-27');
  });
});

describe('searchToQuery', () => {
  it('normalises a display label to its IATA code', () => {
    // Router state carries "New Delhi (DEL)"; a URL must carry DEL, or reading
    // it back sends "New Delhi (DEL)" to the search API.
    const q = searchToQuery({ from: 'New Delhi (DEL)', to: 'Mumbai (BOM)', departDate: '2026-09-27' });

    expect(q).toContain('from=DEL');
    expect(q).toContain('to=BOM');
  });

  it('keeps the URL short by omitting defaults', () => {
    const q = searchToQuery({ from: 'DEL', to: 'BOM', departDate: '2026-09-27' });

    expect(q).toBe('from=DEL&to=BOM&date=2026-09-27');
  });

  it('writes passengers and cabin when they are not the default', () => {
    // The date strip used to write only from/to/date, so refreshing after
    // picking a date on a three-passenger business search came back as one
    // passenger in economy.
    const q = searchToQuery({
      from: 'DEL', to: 'BOM', departDate: '2026-09-27',
      adults: 3, children: 1, infants: 1, travelClass: 'BUSINESS',
    });

    expect(q).toContain('adults=3');
    expect(q).toContain('children=1');
    expect(q).toContain('infants=1');
    expect(q).toContain('travelClass=BUSINESS');
  });

  it('takes an override date, which is how the date strip uses it', () => {
    const q = searchToQuery({ from: 'DEL', to: 'BOM', departDate: '2026-09-27' }, '2026-09-30');

    expect(q).toContain('date=2026-09-30');
    expect(q).not.toContain('2026-09-27');
  });

  it('reads a passenger count from `travelers`, which the landing page sends', () => {
    expect(searchToQuery({ from: 'DEL', to: 'BOM', departDate: '2026-09-27', travelers: 2 }))
      .toContain('adults=2');
  });
});

describe('round trip through the URL', () => {
  it('survives being written and read back', () => {
    // This is the actual bug path: search -> URL -> refresh -> search again.
    const original = {
      from: 'New Delhi (DEL)', to: 'Mumbai (BOM)', departDate: '2026-09-27',
      returnDate: '2026-10-04', adults: 2, children: 1, infants: 0, travelClass: 'BUSINESS',
    };
    const parsed = searchFromQuery(`?${searchToQuery(original)}`);

    expect(parsed).toMatchObject({
      from: 'DEL',
      to: 'BOM',
      departDate: '2026-09-27',
      returnDate: '2026-10-04',
      tripType: 'round-trip',
      adults: 2,
      children: 1,
      infants: 0,
      travelClass: 'BUSINESS',
    });
  });
});

describe('extractIata', () => {
  it('pulls the code out of a display label', () => {
    expect(extractIata('New Delhi (DEL)')).toBe('DEL');
  });

  it('passes a bare code through, trimmed', () => {
    expect(extractIata('BOM')).toBe('BOM');
    expect(extractIata('  BOM  ')).toBe('BOM');
  });

  it('returns an empty string for nothing, never undefined', () => {
    expect(extractIata(null)).toBe('');
    expect(extractIata(undefined)).toBe('');
    expect(extractIata('')).toBe('');
  });
});
