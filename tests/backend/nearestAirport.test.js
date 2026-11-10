import { describe, expect, it } from 'vitest';
import { airportsNear, nearestAirport } from '../../backend/services/airportsIndex.js';

/**
 * The airport a visitor would fly from, found from where they are.
 *
 * The home page knew an origin only for some forty listed cities. A visitor in
 * Fatehpur or Houston had none, so "Cheapest fares from" had nothing to show
 * (10 Nov 2026).
 */
describe('the nearest airport', () => {
  it('is the major airport people use, not the nearest strip', () => {
    // Fatehpur, Uttar Pradesh: Kanpur is closer and has a handful of flights.
    expect(nearestAirport(25.93, 80.8)).toMatchObject({ code: 'LKO', cityName: 'Lucknow' });
  });

  it('is the busiest airport of a city that has several', () => {
    expect(nearestAirport(29.76, -95.37).code).toBe('IAH');
  });

  it('finds the airport of a listed city too', () => {
    expect(nearestAirport(28.57, 77.32).code).toBe('DEL');
    expect(nearestAirport(39.74, -104.99).code).toBe('DEN');
  });

  it('says how far it is, and leaves out how busy it is', () => {
    const airport = nearestAirport(25.93, 80.8);
    expect(airport.distanceKm).toBeGreaterThan(50);
    expect(airport.distanceKm).toBeLessThan(200);
    expect(airport).not.toHaveProperty('popularity');
  });

  it('is nothing where no major airport is within reach', () => {
    expect(nearestAirport(0, -150)).toBeNull();
  });

  it('is nothing for a position that is missing or not a position', () => {
    expect(nearestAirport(undefined, undefined)).toBeNull();
    expect(nearestAirport(null, null)).toBeNull();
    expect(nearestAirport('', '')).toBeNull();
    expect(nearestAirport('north', 3)).toBeNull();
    expect(nearestAirport(120, 10)).toBeNull();
  });
});

describe('airports near a point', () => {
  it('are listed nearest first, within the radius asked for', () => {
    const near = airportsNear(25.93, 80.8, 250);
    expect(near.length).toBeGreaterThan(1);
    expect(near.map((a) => a.distanceKm)).toEqual([...near.map((a) => a.distanceKm)].sort((a, b) => a - b));
    expect(near.every((a) => a.distanceKm <= 250)).toBe(true);
  });
});
