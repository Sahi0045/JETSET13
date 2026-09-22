import { describe, it, expect } from 'vitest';
import { bookingTravellerProblems } from '../../shared/travellerDetails.js';

/**
 * A traveller whose birthday falls between the outbound and the return flight.
 *
 * A child's fare is set by their age when the trip begins (IATA: a child has
 * reached 2 but not 12 at commencement of travel). The check asked a child to
 * be under 12 on the last flight as well, and an adult fare to be 12 on the
 * first - so a child who turned 12 on the trip fitted neither, and both the
 * review page and checkout refused every way of booking them.
 *
 * An infant who turns 2 on the trip is different: they need a paid seat on the
 * later flights, which no single fare type sells here. That is still refused,
 * but the customer is told to call, so the refusal is not a dead end.
 */

// A round trip DEL-BOM 2026-11-15, back 2026-11-29. Domestic, so no passport.
const ctx = (type, dates = {}) => ({ type, international: false, travelDate: '2026-11-15', lastDate: '2026-11-29', ...dates });
const traveller = (dateOfBirth) => ({ firstName: 'Asha', lastName: 'Rao', gender: 'female', dateOfBirth });
const oneWay = { lastDate: '2026-11-15' };

describe('a child who turns 12 during the trip', () => {
  const dob = '2014-11-20'; // 11 on 15 Nov, 12 on 29 Nov

  it('books on a child fare', () => {
    expect(bookingTravellerProblems(traveller(dob), ctx('CHILD'))).toEqual([]);
  });

  it('is still refused an adult fare, being 11 when the trip begins', () => {
    expect(bookingTravellerProblems(traveller(dob), ctx('ADULT')))
      .toEqual(['Adult fares are for travellers aged 12 or over on the day of travel.']);
  });
});

describe('an infant who turns 2 during the trip', () => {
  const dob = '2024-11-20'; // 1 on 15 Nov, 2 on 29 Nov

  it.each([['HELD_INFANT', 'Infant'], ['SEATED_INFANT', 'Infant (own seat)']])('is refused as %s, with a number to call to book', (type, label) => {
    expect(bookingTravellerProblems(traveller(dob), ctx(type))).toEqual([
      `${label} fares are for travellers under 2 on every flight of the trip. `
      + 'To book an infant who turns 2 during the trip, call (877) 538-7380.',
    ]);
  });
});

describe('trips with no birthday on them are unchanged', () => {
  it('books a child aged 2 to 11 on every flight as a child', () => {
    expect(bookingTravellerProblems(traveller('2018-05-01'), ctx('CHILD'))).toEqual([]);
  });

  it('books a 12-year-old as an adult', () => {
    expect(bookingTravellerProblems(traveller('2014-01-01'), ctx('ADULT'))).toEqual([]);
  });

  it('refuses a child fare for a traveller already 12 on the first flight', () => {
    expect(bookingTravellerProblems(traveller('2014-01-01'), ctx('CHILD')))
      .toEqual(['Child fares are for travellers aged 2 to 11 on the day of travel.']);
  });

  it('refuses a child fare for a traveller under 2 on the first flight', () => {
    expect(bookingTravellerProblems(traveller('2025-06-01'), ctx('CHILD')))
      .toEqual(['Child fares are for travellers aged 2 to 11 on the day of travel.']);
  });

  it.each(['HELD_INFANT', 'SEATED_INFANT'])('books an infant under 2 on every flight as %s', (type) => {
    expect(bookingTravellerProblems(traveller('2025-06-01'), ctx(type))).toEqual([]);
  });

  it.each(['HELD_INFANT', 'SEATED_INFANT'])('refuses %s for a traveller already 2 on the first flight', (type) => {
    const expected = type === 'HELD_INFANT' ? 'Infant' : 'Infant (own seat)';
    expect(bookingTravellerProblems(traveller('2024-01-01'), ctx(type, oneWay)))
      .toEqual([`${expected} fares are for travellers under 2 on the day of travel.`]);
  });
});
