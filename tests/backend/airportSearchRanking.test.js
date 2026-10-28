import { describe, expect, it } from 'vitest';
import { isCityCode, resolveToIata, searchLocations } from '../../backend/services/airportsIndex.js';

/**
 * The airport search, ranked the way booking.com ranks it. Every large airport
 * had the same score, so "hon" put Honiara over Hong Kong and "la" never found
 * Los Angeles; Newark and Narita were not in New York and Tokyo (28 Oct).
 */

const codes = (q, limit = 10) => searchLocations(q, 'CITY,AIRPORT', { limit }).data.map((place) => place.code);
const rows = (q, limit = 10) => searchLocations(q, 'CITY,AIRPORT', { limit }).data;

describe('the busiest place first', () => {
  it.each([
    ['la', 'LAX'],
    ['ny', 'NYC'],
    ['sf', 'SFO'],
    ['dc', 'WAS'],
    ['vegas', 'LAS'],
    ['goa', 'GOI'],
    ['new', 'NYC'],
    ['lon', 'LON'],
    ['tok', 'TYO'],
    ['hon', 'HKG'],
    ['mum', 'BOM'],
  ])('"%s" starts with %s', (q, first) => {
    expect(codes(q)[0]).toBe(first);
  });

  it('puts Hong Kong and Honolulu above Honiara, and Dubai and Dublin above Tuzla', () => {
    const hon = codes('hon');
    expect(hon.indexOf('HNL')).toBeLessThan(hon.indexOf('HIR'));
    const dub = codes('dub');
    expect(dub.indexOf('DXB')).toBeLessThan(dub.indexOf('TZL'));
    expect(dub.indexOf('DUB')).toBeLessThan(dub.indexOf('TZL'));
  });

  it('finds San Francisco in the first three for "san"', () => {
    expect(codes('san').slice(0, 3)).toContain('SFO');
  });

  it('counts a short name only when it is typed whole', () => {
    expect(codes('d')).not.toContain('WAS');
  });
});

describe('a city with several airports', () => {
  it('lists the city, then its airports under it', () => {
    const [city, ...airports] = rows('new york');

    expect(city).toMatchObject({ code: 'NYC', type: 'CITY' });
    expect(airports.slice(0, 3).map((a) => a.code)).toEqual(['JFK', 'EWR', 'LGA']);
    expect(airports.slice(0, 3).every((a) => a.parent === 'NYC')).toBe(true);
  });

  it.each([
    ['tokyo', 'TYO', ['HND', 'NRT']],
    ['washington', 'WAS', ['IAD', 'DCA', 'BWI']],
    ['london', 'LON', ['LHR', 'LGW', 'STN', 'LTN', 'LCY']],
    ['milan', 'MIL', ['MXP', 'LIN', 'BGY']],
  ])('"%s" brings %s with %j', (q, metro, airports) => {
    const found = rows(q, 12);
    expect(found[0].code).toBe(metro);
    expect(found.filter((row) => row.parent === metro).map((row) => row.code)).toEqual(expect.arrayContaining(airports));
  });

  it("gives each of the city's airports its distance from the centre", () => {
    const london = rows('london', 12);
    const km = Object.fromEntries(london.filter((row) => row.parent === 'LON').map((row) => [row.code, row.distanceKm]));

    expect(km.LHR).toBeGreaterThan(18);
    expect(km.LHR).toBeLessThan(28);
    expect(km.LCY).toBeLessThan(km.LHR);
    expect(rows('new york').find((row) => row.code === 'JFK').distanceKm).toBeGreaterThan(15);
  });

  it('lists each airport once', () => {
    const found = codes('new');
    expect(found.filter((code) => code === 'EWR')).toHaveLength(1);
  });

  it('shows an airport typed by name on its own', () => {
    expect(rows('heathrow')[0]).toMatchObject({ code: 'LHR' });
    expect(rows('heathrow')[0]).not.toHaveProperty('parent');
  });

  it('does not list a one-airport city twice', () => {
    expect(codes('berlin').filter((code) => code === 'BER')).toHaveLength(1);
  });

  it('groups nothing when only airports are asked for', () => {
    const found = searchLocations('london', 'AIRPORT', { limit: 10 }).data;
    expect(found.every((row) => row.type === 'AIRPORT' && !('parent' in row))).toBe(true);
  });

  it("names Goa's airports Goa, and still finds them by their town", () => {
    expect(rows('goa').slice(0, 2).map((row) => row.cityName)).toEqual(['Goa', 'Goa']);
    expect(codes('vasco')).toContain('GOI');
  });

  it('searches Milan and Sao Paulo as cities', () => {
    expect(isCityCode('MIL')).toBe(true);
    expect(resolveToIata('Milan')).toBe('MIL');
    expect(resolveToIata('Newark')).toBe('EWR');
  });
});
