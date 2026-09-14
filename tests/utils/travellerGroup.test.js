import { describe, expect, it } from 'vitest';
import {
  MAX_SEATED,
  describeGroup,
  groupFromOffer,
  travellerGroupProblem,
} from '../../shared/travellerGroup.js';

/**
 * Amadeus's limits on who can travel together, shared by the flight search and
 * the review page: at most 9 passengers with seats, at least one adult, and one
 * infant per adult - an infant sits on an adult's lap.
 */
describe('travellerGroupProblem', () => {
  it.each([
    [{ adults: 1 }],
    [{ adults: 2, children: 1, infants: 1 }],
    [{ adults: 2, infants: 2 }],
    [{ adults: 5, children: 4 }],
  ])('accepts %j', (group) => {
    expect(travellerGroupProblem(group)).toBeNull();
  });

  it('refuses a booking without an adult', () => {
    expect(travellerGroupProblem({ adults: 0, children: 2 })).toMatch(/at least one adult/i);
  });

  it(`refuses more than ${MAX_SEATED} passengers with seats, and does not count infants as seats`, () => {
    expect(travellerGroupProblem({ adults: 5, children: 5 })).toMatch(/at most 9/);
    expect(travellerGroupProblem({ adults: 9, infants: 9 })).toBeNull();
  });

  it('refuses more infants than adults', () => {
    expect(travellerGroupProblem({ adults: 1, infants: 2 })).toMatch(/lap/);
  });

  it('refuses counts that are not whole numbers', () => {
    expect(travellerGroupProblem({ adults: 1.5 })).toMatch(/whole numbers/);
    expect(travellerGroupProblem({ adults: 1, children: -1 })).toMatch(/whole numbers/);
  });
});

describe('groupFromOffer', () => {
  it('counts the travellers an offer was priced for', () => {
    const offer = { travelerPricings: [{ travelerType: 'ADULT' }, { travelerType: 'ADULT' }, { travelerType: 'CHILD' }, { travelerType: 'HELD_INFANT' }] };
    expect(groupFromOffer(offer)).toEqual({ adults: 2, children: 1, infants: 1 });
  });
});

describe('describeGroup', () => {
  it('names the group in words', () => {
    expect(describeGroup({ adults: 2, children: 1, infants: 1 })).toBe('2 adults, 1 child, 1 infant');
    expect(describeGroup({ adults: 1, children: 0, infants: 0 })).toBe('1 adult');
  });
});
