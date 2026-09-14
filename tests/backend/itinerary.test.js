import { describe, expect, it } from 'vitest';
import { crossesBorder } from '../../backend/utils/itinerary.js';

/**
 * Whether a trip crosses a border decides whether travellers need a passport
 * and a date of birth. The order route decides it from the offer's airports.
 */

const offer = (...legs) => ({
  itineraries: legs.map((pairs) => ({
    segments: pairs.map(([from, to]) => ({ departure: { iataCode: from }, arrival: { iataCode: to } })),
  })),
});

describe('crossesBorder', () => {
  it('is false for a trip inside one country, both ways', () => {
    expect(crossesBorder(offer([['DEL', 'BOM']]))).toBe(false);
    expect(crossesBorder(offer([['DEL', 'BOM'], ['BOM', 'JAI']], [['JAI', 'DEL']]))).toBe(false);
  });

  it('is true for a trip abroad, including a connection abroad', () => {
    expect(crossesBorder(offer([['JFK', 'LHR']]))).toBe(true);
    expect(crossesBorder(offer([['DEL', 'DXB'], ['DXB', 'BOM']]))).toBe(true);
  });

  // A document nobody needed costs a form field; a missing one costs a ticket.
  it('counts an airport it does not know, or no airports at all, as crossing', () => {
    expect(crossesBorder(offer([['DEL', 'QQX']]))).toBe(true);
    expect(crossesBorder({ itineraries: [] })).toBe(true);
    expect(crossesBorder(null)).toBe(true);
  });
});
