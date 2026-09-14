import { describe, expect, it } from 'vitest';
import { travellerProblems, travellerProgress } from '../../frontend/src/utils/travellerChecks.js';
import { needsDateOfBirth } from '../../shared/travellerDetails.js';

/**
 * What a traveller form needs before payment. A date of birth is for a child
 * or infant, and for anyone crossing a border; a domestic adult does not need
 * one - MakeMyTrip does not ask for it, and the PNR does not carry it.
 */

const domestic = { index: 1, international: false, travelDate: '2026-10-06' };
const complete = { type: 'ADULT', firstName: 'Asha', lastName: 'Rao', gender: 'female', mobile: '9876543210' };

describe('needsDateOfBirth', () => {
  it('asks a domestic adult for none, and everyone else for one', () => {
    expect(needsDateOfBirth({ type: 'ADULT', international: false })).toBe(false);
    expect(needsDateOfBirth({ type: 'CHILD', international: false })).toBe(true);
    expect(needsDateOfBirth({ type: 'HELD_INFANT', international: false })).toBe(true);
    expect(needsDateOfBirth({ type: 'ADULT', international: true })).toBe(true);
    // Not knowing whether the trip crosses a border counts as crossing.
    expect(needsDateOfBirth({ type: 'ADULT' })).toBe(true);
  });
});

describe('travellerProblems', () => {
  it('passes a domestic adult with no date of birth', () => {
    expect(travellerProblems(complete, domestic)).toEqual([]);
  });

  it('asks a child on the same trip for a date of birth', () => {
    expect(travellerProblems({ ...complete, type: 'CHILD' }, domestic)).toContain('Enter the date of birth.');
  });

  it('still checks an age that was given against the fare', () => {
    expect(travellerProblems({ ...complete, dateOfBirth: '2020-01-01' }, domestic)[0]).toMatch(/Adult fares are for travellers aged 12 or over/);
  });

  it('asks everyone crossing a border for a date of birth and a passport', () => {
    const problems = travellerProblems(complete, { ...domestic, international: true, lastDate: '2026-10-12' });
    expect(problems).toEqual(expect.arrayContaining([
      'Enter the date of birth.', 'Select a nationality.', 'Enter the passport number.', 'Enter the passport expiry date.',
    ]));
  });

  it("needs the lead traveller's mobile, and a guest's email", () => {
    const lead = { ...complete, mobile: '' };
    expect(travellerProblems(lead, { ...domestic, index: 0 })).toContain('Enter a mobile number for booking updates.');
    expect(travellerProblems(complete, { ...domestic, index: 0, bookingAsGuest: true })[0]).toMatch(/Enter an email address/);
  });
});

describe('travellerProgress', () => {
  it('counts complete forms per type, adults first', () => {
    const travellers = [
      { ...complete, type: 'CHILD', dateOfBirth: '2018-05-05' },
      complete,
      { type: 'ADULT' },
    ];
    const problemsOf = (t, index) => travellerProblems(t, { ...domestic, index: index + 1 });

    expect(travellerProgress(travellers, problemsOf)).toEqual([
      { type: 'ADULT', done: 1, total: 2 },
      { type: 'CHILD', done: 1, total: 1 },
    ]);
  });
});
