import { describe, expect, it } from 'vitest';
import {
  placeSavedTraveller,
  removeSavedTraveller,
  typeForAge,
} from '../../frontend/src/utils/savedTravellerSlots.js';

/**
 * A saved traveller goes only into a form whose fare fits their age on the day
 * of travel - the fare, not the person, decides the type.
 */

const TRAVEL = '2026-10-06';
const blank = (type, index) => ({ id: index + 1, type, firstName: '', lastName: '', dateOfBirth: '', passportNumber: '' });
const family = () => [blank('ADULT', 0), blank('ADULT', 1), blank('CHILD', 2), blank('HELD_INFANT', 3)];

describe('typeForAge', () => {
  it('reads the age on the day of travel', () => {
    expect(typeForAge('2024-10-07', TRAVEL)).toBe('HELD_INFANT'); // 1, turning 2 the day after
    expect(typeForAge('2024-10-06', TRAVEL)).toBe('CHILD');       // 2 that day
    expect(typeForAge('2014-10-07', TRAVEL)).toBe('CHILD');       // 11
    expect(typeForAge('2014-10-06', TRAVEL)).toBe('ADULT');       // 12 that day
  });

  it('treats someone saved without a date of birth as an adult', () => {
    expect(typeForAge('', TRAVEL)).toBe('ADULT');
  });
});

describe('placeSavedTraveller', () => {
  it('fills the first empty form of the right type', () => {
    const kabir = { id: 't2', firstName: 'Kabir', lastName: 'Rao', gender: 'male', dateOfBirth: '2018-05-05' };

    const { travellers, filledId } = placeSavedTraveller(family(), kabir, TRAVEL);

    expect(filledId).toBe(3);
    expect(travellers[2]).toMatchObject({ type: 'CHILD', firstName: 'Kabir', dateOfBirth: '2018-05-05', savedTravellerId: 't2' });
    expect(travellers[0].firstName).toBe('');
  });

  it('never puts a child on an adult fare, and says why', () => {
    const adultsOnly = [blank('ADULT', 0)];
    const kabir = { id: 't2', firstName: 'Kabir', lastName: 'Rao', dateOfBirth: '2018-05-05' };

    expect(placeSavedTraveller(adultsOnly, kabir, TRAVEL).problem).toMatch(/no child place/);
  });

  it('says when every place of that type is taken', () => {
    const full = family().map((t) => (t.type === 'ADULT' ? { ...t, firstName: 'Taken', lastName: 'X' } : t));
    const asha = { id: 'self', firstName: 'Asha', lastName: 'Rao' };

    expect(placeSavedTraveller(full, asha, TRAVEL).problem).toMatch(/Every adult place/);
  });
});

describe('removeSavedTraveller', () => {
  it('empties only the form that person filled', () => {
    const asha = { id: 'self', firstName: 'Asha', lastName: 'Rao' };
    const { travellers } = placeSavedTraveller(family(), asha, TRAVEL);

    const after = removeSavedTraveller(travellers, 'self', blank);

    expect(after[0]).toEqual(blank('ADULT', 0));
    expect(after).toHaveLength(4);
  });
});
