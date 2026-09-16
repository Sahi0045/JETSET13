import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_MAX_AGE_MS, clearTravellerDraft, fareFingerprint, readTravellerDraft, saveTravellerDraft,
} from '../../frontend/src/utils/flightTravellerDraft.js';

/**
 * The travellers a customer typed but has not paid for.
 *
 * `passengerData` lived in React state and nowhere else; the only thing that
 * ever persisted it was the moment of leaving for ARC Pay. So everything typed
 * before that was lost to a refresh, a Back and Forward to re-check a flight
 * time, a phone discarding the tab, or the round trip through the login page -
 * around forty fields for four travellers abroad, passport numbers among them.
 *
 * This holds passport numbers, so where it rests is the design. sessionStorage
 * covers all four of those cases because every one of them stays in the same
 * tab, and then it dies with the tab - less exposure than the existing
 * localStorage payment draft, which bookingStorage.js has to age out after six
 * hours precisely because it outlives the tab.
 */

const store = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    get size() { return data.size; },
  };
};

const offer = ({ from = 'BOM', to = 'DXB', date = '2026-10-26', types = ['ADULT'] } = {}) => ({
  id: '1',
  itineraries: [{ segments: [{ departure: { iataCode: from, at: `${date}T11:00:00` }, arrival: { iataCode: to }, carrierCode: 'SV', number: '771' }] }],
  travelerPricings: types.map((travelerType) => ({ travelerType })),
});

const traveller = (n, type = 'ADULT') => ({
  id: n, type, firstName: `First${n}`, lastName: 'Doe', dateOfBirth: '1990-01-01',
  gender: 'female', passportNumber: `P${n}1234567`, passportExpiry: '2030-01-01',
});

let storage;
beforeEach(() => { storage = store(); });

describe('keeping what was typed', () => {
  it('gives it back for the same fare', () => {
    const people = [traveller(1)];
    saveTravellerDraft(people, offer(), storage);

    expect(readTravellerDraft(offer(), { storage })).toEqual(people);
  });

  it('keeps the fields that cost the most to retype', () => {
    saveTravellerDraft([traveller(1)], offer(), storage);

    const [restored] = readTravellerDraft(offer(), { storage });
    expect(restored.passportNumber).toBe('P11234567');
    expect(restored.passportExpiry).toBe('2030-01-01');
    expect(restored.dateOfBirth).toBe('1990-01-01');
  });

  it('keeps a whole family, in order', () => {
    const family = [traveller(1), traveller(2), traveller(3, 'CHILD')];
    saveTravellerDraft(family, offer({ types: ['ADULT', 'ADULT', 'CHILD'] }), storage);

    expect(readTravellerDraft(offer({ types: ['ADULT', 'ADULT', 'CHILD'] }), { storage })).toEqual(family);
  });
});

describe('refusing to put stale people on a booking', () => {
  it('will not restore a draft typed for a different route', () => {
    saveTravellerDraft([traveller(1)], offer({ to: 'DXB' }), storage);

    expect(readTravellerDraft(offer({ to: 'SIN' }), { storage })).toBeNull();
  });

  it('will not restore a draft typed for a different date', () => {
    saveTravellerDraft([traveller(1)], offer({ date: '2026-10-26' }), storage);

    expect(readTravellerDraft(offer({ date: '2026-10-27' }), { storage })).toBeNull();
  });

  /**
   * The fare is priced for a particular party. Restoring one adult onto a
   * two-adult-and-a-child fare is how a child ends up on an adult's ticket.
   */
  it('will not restore a draft typed for a different party', () => {
    saveTravellerDraft([traveller(1)], offer({ types: ['ADULT'] }), storage);

    expect(readTravellerDraft(offer({ types: ['ADULT', 'CHILD'] }), { storage })).toBeNull();
  });

  it('lets go of a draft past its age', () => {
    saveTravellerDraft([traveller(1)], offer(), storage);
    const later = Date.now() + DRAFT_MAX_AGE_MS + 1000;

    expect(readTravellerDraft(offer(), { storage, now: later })).toBeNull();
  });

  it('still restores one that is merely old, not stale', () => {
    saveTravellerDraft([traveller(1)], offer(), storage);
    const later = Date.now() + DRAFT_MAX_AGE_MS - 60_000;

    expect(readTravellerDraft(offer(), { storage, now: later })).not.toBeNull();
  });

  // A tab left open all day should not still be holding passport numbers.
  it('does not keep passports around for a working day', () => {
    expect(DRAFT_MAX_AGE_MS).toBeLessThanOrEqual(4 * 60 * 60 * 1000);
  });
});

describe('when it cannot help', () => {
  it('returns nothing rather than throwing on unreadable storage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };

    expect(() => readTravellerDraft(offer(), { storage: broken })).not.toThrow();
    expect(readTravellerDraft(offer(), { storage: broken })).toBeNull();
  });

  it('carries on when storage refuses the write', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };

    expect(saveTravellerDraft([traveller(1)], offer(), full)).toBe(false);
  });

  it('writes nothing for an empty form', () => {
    saveTravellerDraft([], offer(), storage);

    expect(storage.size).toBe(0);
  });

  it('writes nothing without a fare to tie it to', () => {
    saveTravellerDraft([traveller(1)], null, storage);
    saveTravellerDraft([traveller(1)], { itineraries: [] }, storage);

    expect(storage.size).toBe(0);
  });

  it('ignores anything that is not a draft', () => {
    storage.setItem('jt_flight_travellers', 'not json');

    expect(readTravellerDraft(offer(), { storage })).toBeNull();
  });
});

describe('forgetting it', () => {
  it('leaves nothing behind once the booking is made or the customer signs out', () => {
    saveTravellerDraft([traveller(1)], offer(), storage);
    clearTravellerDraft(storage);

    expect(readTravellerDraft(offer(), { storage })).toBeNull();
  });

  it('never throws on storage it cannot touch', () => {
    expect(() => clearTravellerDraft({ removeItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});

/**
 * Amadeus reuses small integers for offer ids within one search reply, so an id
 * alone matches across two unrelated searches far too easily. What has to still
 * be true is the thing that was priced.
 */
describe('what identifies a fare', () => {
  it('is not the offer id', () => {
    const a = fareFingerprint({ ...offer({ to: 'DXB' }), id: '1' });
    const b = fareFingerprint({ ...offer({ to: 'SIN' }), id: '1' });

    expect(a).not.toBe(b);
  });

  it('is the same for the same itinerary and party', () => {
    expect(fareFingerprint(offer())).toBe(fareFingerprint(offer()));
  });

  it('is nothing for an offer with no flights in it', () => {
    expect(fareFingerprint({ itineraries: [] })).toBeNull();
    expect(fareFingerprint(null)).toBeNull();
  });
});
