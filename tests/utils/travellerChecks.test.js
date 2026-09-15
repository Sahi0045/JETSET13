import { describe, expect, it } from 'vitest';
import { travellerProblems, travellerProgress } from '../../frontend/src/utils/travellerChecks.js';
import { needsDateOfBirth, tripDates } from '../../shared/travellerDetails.js';

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

  // An infant who turns 2 before the flight home is on the wrong fare for it.
  it('checks a child or infant against the last flight of the trip too', () => {
    const infant = { ...complete, type: 'HELD_INFANT', dateOfBirth: '2024-10-20' };
    expect(travellerProblems(infant, domestic)).toEqual([]);
    expect(travellerProblems(infant, { ...domestic, lastDate: '2026-10-25' })[0]).toMatch(/on every flight of the trip/);
  });

  // The review page took the last day from the outbound flights, so a round
  // trip's return was never checked. It now reads every itinerary on the offer.
  describe('on a round trip, up to the flight home', () => {
    const roundTrip = {
      itineraries: [
        { segments: [{ departure: { iataCode: 'JFK', at: '2026-10-04T18:00:00' }, arrival: { iataCode: 'LHR', at: '2026-10-05T06:00:00' } }] },
        { segments: [{ departure: { iataCode: 'LHR', at: '2026-10-25T10:00:00' }, arrival: { iataCode: 'JFK', at: '2026-10-25T13:00:00' } }] },
      ],
    };
    const outboundOnly = { itineraries: [roundTrip.itineraries[0]] };
    const checksFor = (offer) => {
      const { firstDate, lastDate } = tripDates(offer);
      return { index: 1, international: true, travelDate: firstDate, lastDate };
    };
    const passport = { nationality: 'US', passportNumber: 'X1234567', dateOfBirth: '1990-01-01' };

    it('refuses an infant who turns 2 before the return', () => {
      const infant = { ...complete, ...passport, passportExpiry: '2030-01-01', type: 'HELD_INFANT', dateOfBirth: '2024-10-20' };

      expect(travellerProblems(infant, checksFor(outboundOnly))).toEqual([]);
      expect(travellerProblems(infant, checksFor(roundTrip))).toContain('Infant fares are for travellers under 2 on every flight of the trip.');
    });

    it('refuses a passport that expires before the return', () => {
      const traveller = { ...complete, ...passport, passportExpiry: '2026-10-15' };

      expect(travellerProblems(traveller, checksFor(outboundOnly))).toEqual([]);
      expect(travellerProblems(traveller, checksFor(roundTrip))).toContain('The passport expires before the trip ends.');
    });
  });

  it('asks everyone crossing a border for a date of birth and a passport', () => {
    const problems = travellerProblems(complete, { ...domestic, international: true, lastDate: '2026-10-12' });
    expect(problems).toEqual(expect.arrayContaining([
      'Enter the date of birth.', 'Select a nationality.', 'Enter the passport number.', 'Enter the passport expiry date.',
    ]));
  });

  // The PNR prints A-Z only. A name it would lose letters from is refused here,
  // before payment, rather than booked short or refunded afterwards.
  it('refuses a name the airline cannot print, and accepts one it can spell in Latin', () => {
    expect(travellerProblems({ ...complete, firstName: 'Иван' }, domestic)[0]).toMatch(/in Latin letters/);
    expect(travellerProblems({ ...complete, firstName: 'Łukasz', lastName: 'Øberg' }, domestic)).toEqual([]);
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
