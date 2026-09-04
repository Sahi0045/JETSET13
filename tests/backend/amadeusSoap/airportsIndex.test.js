import { describe, expect, it } from 'vitest';
import { datasetInfo, isCityCode, resolveToIata, searchLocations } from '../../../backend/services/airportsIndex.js';

/**
 * The WSAP has no location-search operation, so this dataset is the only thing
 * standing between a customer typing "Bangalore" and a search that fails.
 */

describe('output shape', () => {
  // Must match what the REST service emitted, or the autocomplete UI breaks.
  it('emits exactly the normalized fields clients read', () => {
    const [first] = searchLocations('LHR', 'AIRPORT', { limit: 1 }).data;

    expect(Object.keys(first).sort()).toEqual([
      'cityCode', 'cityName', 'code', 'country', 'countryCode',
      'displayName', 'geoCode', 'name', 'score', 'type',
    ]);
    expect(first.geoCode).toMatchObject({ latitude: expect.any(Number), longitude: expect.any(Number) });
  });

  it('never leaks internal index fields', () => {
    const [first] = searchLocations('delhi', 'AIRPORT', { limit: 1 }).data;
    for (const key of Object.keys(first)) expect(key.startsWith('_')).toBe(false);
    expect(first).not.toHaveProperty('aliases');
  });
});

describe('resolution', () => {
  it.each([
    ['LHR', 'LHR'],
    ['lhr', 'LHR'],
    ['delhi', 'DEL'],
    ['London', 'LON'],
    ['New York', 'NYC'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveToIata(input)).toBe(expected);
  });

  // Historic names are what customers actually type; the dataset stores the
  // current official name, so without aliases these searches return nothing.
  it.each([
    ['Bangalore', 'BLR'],
    ['Bombay', 'BOM'],
    ['Calcutta', 'CCU'],
    ['Madras', 'MAA'],
  ])('resolves the historic name %s to %s', (input, expected) => {
    expect(resolveToIata(input)).toBe(expected);
  });

  it('returns null rather than guessing at an unknown place', () => {
    expect(resolveToIata('Nowhere At All')).toBeNull();
  });
});

describe('metropolitan codes', () => {
  // A metro code searches every airport in the city, so it must be recognised
  // and sent with airportCityQualifier 'C' rather than 'A'.
  it('recognises real metro codes and not airports', () => {
    expect(isCityCode('LON')).toBe(true);
    expect(isCityCode('NYC')).toBe(true);
    expect(isCityCode('LHR')).toBe(false);
    expect(isCityCode('JFK')).toBe(false);
  });

  it('ranks the metro above its individual airports', () => {
    const codes = searchLocations('london', 'CITY,AIRPORT', { limit: 4 }).data.map((d) => d.code);
    expect(codes[0]).toBe('LON');
    expect(codes).toContain('LHR');
  });

  it('never invents a city code from an airport', () => {
    const cities = searchLocations('paris', 'CITY', { limit: 5 }).data;
    for (const city of cities) expect(city.code).not.toBe('CDG');
  });
});

describe('search behaviour', () => {
  it('puts an exact IATA code first', () => {
    expect(searchLocations('BOM', 'CITY,AIRPORT', { limit: 3 }).data[0].code).toBe('BOM');
  });

  it('honours the subType filter', () => {
    const data = searchLocations('london', 'AIRPORT', { limit: 5 }).data;
    expect(data.every((d) => d.type === 'AIRPORT')).toBe(true);
  });

  it('honours the country filter', () => {
    const data = searchLocations('san', 'AIRPORT', { limit: 10, countryCode: 'US' }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((d) => d.countryCode === 'US')).toBe(true);
  });

  it('respects the limit and returns an empty result for nonsense', () => {
    expect(searchLocations('a', 'CITY,AIRPORT', { limit: 2 }).data.length).toBeLessThanOrEqual(2);
    expect(searchLocations('qqzzxx', 'CITY,AIRPORT', { limit: 5 }).data).toEqual([]);
    expect(searchLocations('', 'CITY,AIRPORT').data).toEqual([]);
  });
});

describe('dataset', () => {
  it('is large enough to be useful and reports its provenance', () => {
    const info = datasetInfo();
    expect(info.count).toBeGreaterThan(3000);
    expect(info.source).toMatch(/OurAirports/);
    expect(info.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
