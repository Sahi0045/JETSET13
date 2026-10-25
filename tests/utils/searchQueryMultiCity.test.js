import { describe, expect, it } from 'vitest';
import {
  buildSearchPayload,
  normalizeTripType,
  searchFromQuery,
  searchKeyOf,
  searchToQuery,
} from '../../frontend/src/Pages/Common/flights/searchQuery.js';

const multiCity = {
  tripType: 'multiCity',
  legs: [
    { from: 'New Delhi (DEL)', fromCode: 'DEL', to: 'Dubai (DXB)', toCode: 'DXB', departDate: '2026-11-24' },
    { from: 'DXB', to: 'London (LHR)', departDate: '2026-11-28' },
    { from: 'LHR', to: 'DEL', departDate: '2026-12-05' },
  ],
  adults: 2,
  children: 1,
  infants: 0,
  travelClass: 'ECONOMY',
};

describe('the multi-city search contract', () => {
  it('sends the legs, not one route', () => {
    const payload = buildSearchPayload(multiCity);

    expect(payload.legs).toEqual([
      { from: 'DEL', to: 'DXB', departDate: '2026-11-24' },
      { from: 'DXB', to: 'LHR', departDate: '2026-11-28' },
      { from: 'LHR', to: 'DEL', departDate: '2026-12-05' },
    ]);
    expect(payload).not.toHaveProperty('from');
    expect(payload).not.toHaveProperty('returnDate');
    expect(payload).toMatchObject({ adults: 2, children: 1, infants: 0, travelClass: 'ECONOMY' });
  });

  it('a multi-city link reloads the same trip', () => {
    const query = searchToQuery(multiCity);
    const back = searchFromQuery(`?${query}`);

    expect(query).toContain('tripType=multiCity');
    expect(back.tripType).toBe('multiCity');
    expect(back.legs).toEqual([
      { from: 'DEL', to: 'DXB', departDate: '2026-11-24' },
      { from: 'DXB', to: 'LHR', departDate: '2026-11-28' },
      { from: 'LHR', to: 'DEL', departDate: '2026-12-05' },
    ]);
    expect(back).toMatchObject({ from: 'DEL', to: 'DEL', departDate: '2026-11-24', returnDate: '', adults: 2, children: 1 });
    expect(buildSearchPayload(back)).toEqual(buildSearchPayload(multiCity));
  });

  it('keeps a place typed as text through the link', () => {
    const typed = { ...multiCity, legs: [{ from: 'New York, NY', to: 'LHR', departDate: '2026-11-24' }, { from: 'LHR', to: 'New York, NY', departDate: '2026-11-30' }] };

    expect(searchFromQuery(`?${searchToQuery(typed)}`).legs[0].from).toBe('New York, NY');
  });

  it('a link with one leg is not a multi-city search', () => {
    expect(searchFromQuery('?tripType=multiCity&leg=DEL%7CDXB%7C2026-11-24')).toBeNull();
  });

  it('two trips with different legs are different searches', () => {
    const other = { ...multiCity, legs: [...multiCity.legs.slice(0, 2), { from: 'LHR', to: 'BOM', departDate: '2026-12-05' }] };

    expect(searchKeyOf(other)).not.toBe(searchKeyOf(multiCity));
  });

  it('knows the multi-city trip type in any spelling', () => {
    expect(normalizeTripType('multiCity')).toBe('multiCity');
    expect(normalizeTripType('multi-city')).toBe('multiCity');
  });

  it('one-way and round-trip links are unchanged', () => {
    const roundTrip = { from: 'DEL', to: 'BOM', departDate: '2026-11-24', returnDate: '2026-11-30', adults: 1 };

    expect(searchToQuery(roundTrip)).toBe('from=DEL&to=BOM&date=2026-11-24&returnDate=2026-11-30');
    expect(buildSearchPayload(roundTrip)).not.toHaveProperty('legs');
  });
});
