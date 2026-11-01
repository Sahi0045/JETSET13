import { describe, expect, it } from 'vitest';
import { searchForGroup } from '../../frontend/src/utils/travellerGroupChange.js';
import { buildSearchPayload } from '../../frontend/src/Pages/Common/flights/searchQuery.js';

const seg = (from, to, at) => ({ departure: { iataCode: from, at: `${at}T09:00:00` }, arrival: { iataCode: to, at: `${at}T13:00:00` } });
const offer = {
  itineraries: [
    { segments: [seg('DEL', 'DXB', '2026-11-24')] },
    { segments: [seg('DXB', 'LHR', '2026-11-28')] },
    { segments: [seg('LHR', 'DXB', '2026-12-05'), seg('DXB', 'DEL', '2026-12-06')] },
  ],
};
const group = { adults: 2, children: 0, infants: 1 };

describe('searching again for a multi-city trip', () => {
  it('keeps the legs the customer searched', () => {
    const searchData = {
      tripType: 'multiCity',
      legs: [
        { from: 'DEL', to: 'DXB', departDate: '2026-11-24' },
        { from: 'DXB', to: 'LON', departDate: '2026-11-28' },
        { from: 'LON', to: 'DEL', departDate: '2026-12-05' },
      ],
      travelClass: 'BUSINESS',
    };

    const search = searchForGroup(searchData, offer, group);

    expect(search.tripType).toBe('multiCity');
    expect(buildSearchPayload(search)).toMatchObject({ legs: searchData.legs, adults: 2, infants: 1, travelClass: 'BUSINESS' });
    expect(search.returnDate).toBe('');
  });

  it('reads the legs from the offer when the search is not at hand', () => {
    const search = searchForGroup({}, offer, group);

    expect(search.tripType).toBe('multiCity');
    expect(buildSearchPayload(search).legs).toEqual([
      { from: 'DEL', to: 'DXB', departDate: '2026-11-24' },
      { from: 'DXB', to: 'LHR', departDate: '2026-11-28' },
      { from: 'LHR', to: 'DEL', departDate: '2026-12-05' },
    ]);
  });
});
