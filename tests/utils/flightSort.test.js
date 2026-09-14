import { describe, expect, it } from 'vitest';
import {
  formatMinutes,
  legMinutes,
  maxStops,
  parseDurationMin,
  sortFlights,
  totalMinutes,
} from '../../frontend/src/Pages/Common/flights/flightSort.js';

/**
 * Sorting flight results.
 *
 * The search card sends its duration as "2h 35m" and the parser here expected
 * "PT2H35M", so every flight read as zero minutes: "Fastest" sorted nothing
 * and the sort tabs said "0h 00m". "Arrival - Earliest" sorted on the first
 * segment's arrival, which for a connecting flight is its stopover.
 */

describe('reading a duration', () => {
  it.each([
    ['2h 35m', 155],
    ['PT2H35M', 155],
    ['PT45M', 45],
    ['11h 0m', 660],
    ['PT11H', 660],
  ])('reads %s as %i minutes', (text, minutes) => {
    expect(parseDurationMin(text)).toBe(minutes);
  });

  it('treats an unknown duration as the longest, so it sorts last', () => {
    expect(parseDurationMin('Unknown')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseDurationMin(null)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('prefers the minutes the card carries, and formats them back', () => {
    expect(legMinutes({ duration: 'garbled', durationMinutes: 95 })).toBe(95);
    expect(formatMinutes(155)).toBe('2h 35m');
    expect(formatMinutes(60)).toBe('1h 00m');
    expect(formatMinutes(Number.MAX_SAFE_INTEGER)).toBe('');
  });
});

describe('Fastest', () => {
  const price = { amount: 100 };

  it('orders flights by how long they take', () => {
    const flights = [
      { id: 'slow', duration: '5h 10m', durationMinutes: 310, price },
      { id: 'unknown', duration: 'Unknown', price },
      { id: 'fast', duration: '2h 35m', durationMinutes: 155, price },
      { id: 'middle', duration: '3h 0m', price },   // no number: read from the text
    ];

    expect(sortFlights(flights, 'duration').map((f) => f.id)).toEqual(['fast', 'middle', 'slow', 'unknown']);
  });

  it('times a round trip by both of its legs', () => {
    const quickOutSlowBack = { id: 'quick-out', durationMinutes: 120, returnLeg: { duration: 'PT5H' }, price };
    const evenBothWays = { id: 'even', durationMinutes: 180, returnLeg: { duration: 'PT3H' }, price };

    expect(totalMinutes(evenBothWays)).toBe(360);
    expect(sortFlights([quickOutSlowBack, evenBothWays], 'duration').map((f) => f.id)).toEqual(['even', 'quick-out']);
  });

  it('returns a sorted copy and leaves the list it was given alone', () => {
    const flights = [{ id: 'b', durationMinutes: 200, price }, { id: 'a', durationMinutes: 100, price }];
    const sorted = sortFlights(flights, 'duration');

    expect(sorted.map((f) => f.id)).toEqual(['a', 'b']);
    expect(flights.map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('Arrival - Earliest', () => {
  const price = { amount: 100 };
  const segment = (depart, arrive) => ({ departure: { at: `2026-10-01T${depart}:00` }, arrival: { at: `2026-10-01T${arrive}:00` } });

  it('sorts by when the journey ends, not when its first flight lands', () => {
    const connecting = { id: 'connecting', price, segments: [segment('06:00', '07:00'), segment('09:00', '15:00')] };
    const direct = { id: 'direct', price, segments: [segment('08:00', '10:00')] };

    expect(sortFlights([connecting, direct], 'arrival').map((f) => f.id)).toEqual(['direct', 'connecting']);
    expect(sortFlights([direct, connecting], 'departure').map((f) => f.id)).toEqual(['connecting', 'direct']);
  });

  it("falls back to the card's own arrival when there is no segment list", () => {
    const noSegments = { id: 'no-segments', price, segments: [], arrival: { rawDate: '2026-10-01', time: '09:30' } };
    const direct = { id: 'direct', price, segments: [segment('08:00', '10:00')] };

    expect(sortFlights([direct, noSegments], 'arrival').map((f) => f.id)).toEqual(['no-segments', 'direct']);
  });
});

describe('stops on a round trip', () => {
  it('is not non-stop when the return connects', () => {
    expect(maxStops({ stops: 0, returnLeg: { stops: 1 } })).toBe(1);
    expect(maxStops({ stops: 0 })).toBe(0);
  });

  it('puts flights that are non-stop both ways first', () => {
    const connectingBack = { id: 'connecting-back', stops: 0, returnLeg: { stops: 1 }, price: { amount: 100 } };
    const nonStopBothWays = { id: 'non-stop', stops: 0, returnLeg: { stops: 0 }, price: { amount: 200 } };

    expect(sortFlights([connectingBack, nonStopBothWays], 'nonstop_first').map((f) => f.id))
      .toEqual(['non-stop', 'connecting-back']);
  });
});
