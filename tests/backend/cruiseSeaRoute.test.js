import { describe, expect, it } from 'vitest';
import { routeForPorts, searchPorts } from '../../backend/services/cruiseCatalog/seaRoute.js';

const MIAMI = { lat: 25.77, lon: -80.17 };
const COZUMEL = { lat: 20.51, lon: -86.95 };
const NASSAU = { lat: 25.08, lon: -77.35 };

describe('sea routes between ports', () => {
  it('routes Miami to Cozumel by sea, starting and ending at the ports', () => {
    const route = routeForPorts([MIAMI, COZUMEL]);
    expect(route.type).toBe('LineString');
    expect(route.coordinates.length).toBeGreaterThan(2);
    expect(route.coordinates[0]).toEqual([MIAMI.lon, MIAMI.lat]);
    expect(route.coordinates.at(-1)).toEqual([COZUMEL.lon, COZUMEL.lat]);
  });

  it('joins every leg of a round trip', () => {
    const route = routeForPorts([MIAMI, NASSAU, COZUMEL, MIAMI]);
    const at = (point) => route.coordinates.some(([lon, lat]) => lon === point.lon && lat === point.lat);
    expect(at(NASSAU)).toBe(true);
    expect(at(COZUMEL)).toBe(true);
    expect(route.coordinates.at(-1)).toEqual([MIAMI.lon, MIAMI.lat]);
  });

  it('falls back to a straight leg when the sea network cannot route it', () => {
    const route = routeForPorts([MIAMI, COZUMEL], { router: () => { throw new Error('no path'); } });
    expect(route.coordinates).toEqual([[MIAMI.lon, MIAMI.lat], [COZUMEL.lon, COZUMEL.lat]]);
  });

  it('skips a port repeated back to back', () => {
    const route = routeForPorts([MIAMI, MIAMI, COZUMEL], { router: () => { throw new Error('no path'); } });
    expect(route.coordinates).toEqual([[MIAMI.lon, MIAMI.lat], [COZUMEL.lon, COZUMEL.lat]]);
  });

  it('has no route for a single port', () => {
    expect(routeForPorts([MIAMI])).toBeNull();
    expect(routeForPorts([MIAMI, MIAMI])).toBeNull();
  });
});

describe('finding a port to add', () => {
  it('finds Barcelona in Spain', () => {
    const spain = searchPorts('barcelona').find((port) => port.country === 'Spain');
    expect(spain).toMatchObject({ name: 'Barcelona' });
    expect(spain.lat).toBeCloseTo(41.38, 1);
    expect(spain.unlocode).toMatch(/^[A-Z]{2}[A-Z0-9]{3}$/);
  });

  it('matches without accents', () => {
    expect(searchPorts('Roatán').map((port) => port.name)).toContain('Roatan');
  });

  it('returns nothing for a blank search and at most the limit', () => {
    expect(searchPorts('  ')).toEqual([]);
    expect(searchPorts('a', 5)).toHaveLength(5);
  });
});
