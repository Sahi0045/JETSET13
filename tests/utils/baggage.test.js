import { describe, expect, it } from 'vitest';
import { formatCheckedBag, hasCheckedBag, parseCheckedBagLabel } from '../../frontend/src/utils/baggage.js';

/**
 * Checked-baggage display.
 *
 * Amadeus files an allowance as EITHER a weight or a piece count, never both,
 * and both real failures pinned here were seen on screen rather than imagined:
 *
 *   - Reading only `.weight` made a piece-based fare read "Cabin only" on the
 *     search card and in the fare selector, while the review page one click
 *     later said "1 Piece" for the same DEL-BOM fare.
 *   - Reading a weight as a count rendered a 15 KG allowance as "15 Pieces".
 *
 * The fallback that parsed the display string had the same confusion in a
 * third form: `parseInt("1 Piece")` is 1, which it then labelled KG.
 */

describe('formatCheckedBag', () => {
  it('renders a weight allowance with its own unit', () => {
    expect(formatCheckedBag({ weight: 15, weightUnit: 'KG' })).toBe('15 KG');
    // Pounds are filed as LB; assuming KG understates the allowance.
    expect(formatCheckedBag({ weight: 50, weightUnit: 'LB' })).toBe('50 LB');
  });

  it('defaults a unitless weight to KG rather than dropping it', () => {
    expect(formatCheckedBag({ weight: 23 })).toBe('23 KG');
  });

  it('renders a piece allowance as pieces, not as a weight', () => {
    expect(formatCheckedBag({ quantity: 1 })).toBe('1 Piece');
    expect(formatCheckedBag({ quantity: 2 })).toBe('2 Pieces');
  });

  it('never reports a piece-based fare as having no bag', () => {
    // The regression: `{quantity: 1}` has no `.weight`, so a `.weight`-only
    // read fell through to "Cabin only" on a fare that includes a bag.
    expect(hasCheckedBag({ quantity: 1 })).toBe(true);
  });

  it('reports no allowance only when there genuinely is none', () => {
    expect(formatCheckedBag(null)).toBeNull();
    expect(formatCheckedBag(undefined)).toBeNull();
    expect(formatCheckedBag({})).toBeNull();
    // A zero weight is what the search page fills in for "unknown", and it is
    // not an allowance.
    expect(formatCheckedBag({ weight: 0, weightUnit: 'KG' })).toBeNull();
    expect(hasCheckedBag(null)).toBe(false);
  });

  it('passes an already-formatted string through', () => {
    // Some booking records store the display string, not the structure.
    expect(formatCheckedBag('1 Piece')).toBe('1 Piece');
    expect(formatCheckedBag('   ')).toBeNull();
  });
});

describe('parseCheckedBagLabel', () => {
  it('reads a piece count back as pieces', () => {
    // `parseInt("1 Piece") || 0` gave `{weight: 1, weightUnit: 'KG'}` — a
    // one-kilo checked allowance, which no airline files.
    expect(parseCheckedBagLabel('1 Piece')).toEqual({ quantity: 1 });
    expect(parseCheckedBagLabel('2 Pieces')).toEqual({ quantity: 2 });
  });

  it('reads a weight back with its unit', () => {
    expect(parseCheckedBagLabel('15 KG')).toEqual({ weight: 15, weightUnit: 'KG' });
    expect(parseCheckedBagLabel('50 LB')).toEqual({ weight: 50, weightUnit: 'LB' });
  });

  it('round-trips whatever formatCheckedBag produced', () => {
    for (const bag of [{ weight: 15, weightUnit: 'KG' }, { quantity: 2 }]) {
      expect(parseCheckedBagLabel(formatCheckedBag(bag))).toEqual(bag);
    }
  });

  it('returns null rather than inventing an allowance', () => {
    expect(parseCheckedBagLabel(null)).toBeNull();
    expect(parseCheckedBagLabel('')).toBeNull();
    expect(parseCheckedBagLabel('Cabin only')).toBeNull();
    expect(parseCheckedBagLabel({ quantity: 1 })).toBeNull();
  });
});
