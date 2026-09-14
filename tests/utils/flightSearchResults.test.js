import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDateStrip,
  matchesFilters,
  searchFailureMessage,
  shiftDateStrip,
  stripDates,
} from '../../frontend/src/Pages/Common/flights/searchResults.js';

/**
 * The flight results page's date strip, filters and failure message.
 */

const labelOf = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

describe('the date strip, west of UTC', () => {
  /**
   * The week arrows parsed each date as UTC midnight, stepped it in local time
   * and wrote it back with toISOString. In US time zones the label and the
   * search came apart by a day. These run in Los Angeles, where that happened.
   */
  let originalTz;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('really is west of UTC, where the old arithmetic broke', () => {
    expect(new Date(2026, 8, 26, 12).getTimezoneOffset()).toBeGreaterThan(0);

    // What the week arrows did: labelled Oct 2, searched Oct 3.
    const old = new Date('2026-09-26');
    old.setDate(old.getDate() + 7);
    expect(old.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).toBe('Oct 2');
    expect(old.toISOString().slice(0, 10)).toBe('2026-10-03');
  });

  it('labels every day with the date it searches', () => {
    for (const day of buildDateStrip('2026-09-26', { today: '2026-09-01' })) {
      expect(day.date).toBe(labelOf(day.isoDate));
    }
  });

  it('steps a week in calendar days, and the labels still match', () => {
    const next = shiftDateStrip(buildDateStrip('2026-09-26', { today: '2026-09-01' }), 7, { today: '2026-09-01' });

    expect(next.map((d) => d.isoDate)).toEqual([
      '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06',
    ]);
    for (const day of next) expect(day.date).toBe(labelOf(day.isoDate));
  });

  it('does not slip a day across the change back from daylight saving time', () => {
    const next = shiftDateStrip(buildDateStrip('2026-10-29', { today: '2026-09-01' }), 7, { today: '2026-09-01' });

    expect(next[0].isoDate).toBe('2026-11-02');
    expect(next[6].isoDate).toBe('2026-11-08');
    for (const day of next) expect(day.date).toBe(labelOf(day.isoDate));
  });

  // `selected` used to carry over by position, marking a date in the new week
  // that nobody had searched.
  it('marks only the date searched, and nothing in a week without it', () => {
    const options = { selectedIso: '2026-09-26', today: '2026-09-01' };
    const strip = buildDateStrip('2026-09-26', { today: '2026-09-01' });
    const nextWeek = shiftDateStrip(strip, 7, options);
    const backAgain = shiftDateStrip(nextWeek, -7, options);

    expect(strip.filter((d) => d.selected).map((d) => d.isoDate)).toEqual(['2026-09-26']);
    expect(nextWeek.some((d) => d.selected)).toBe(false);
    expect(backAgain.filter((d) => d.selected).map((d) => d.isoDate)).toEqual(['2026-09-26']);
  });

  it('marks days before today as past and drops the old week\'s prices', () => {
    const strip = buildDateStrip('2026-09-16', { today: '2026-09-15' }).map((d) => ({ ...d, price: 99 }));

    expect(strip.filter((d) => d.isPast).map((d) => d.isoDate)).toEqual(['2026-09-13', '2026-09-14']);
    expect(shiftDateStrip(strip, 7, { today: '2026-09-15' }).every((d) => d.price === null)).toBe(true);
  });

  it('lists the seven dates around a date', () => {
    expect(stripDates('2026-09-26')).toEqual([
      '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
    ]);
  });
});

describe('what a failed search tells the customer', () => {
  it("shows a refused search's own reason", () => {
    const reason = "Each infant travels on an adult's lap, so there must be at least as many adults as infants.";
    expect(searchFailureMessage(400, { success: false, error: reason })).toBe(reason);
  });

  it("keeps the server's wording for its own failures off the page", () => {
    expect(searchFailureMessage(502, { success: false, error: 'Flight search failed' })).toMatch(/couldn't load flights/i);
    expect(searchFailureMessage(500, { error: 'TypeError: x is undefined' })).not.toMatch(/TypeError/);
  });

  it('says busy for a 503 and slow for a 504', () => {
    expect(searchFailureMessage(503, { error: 'Too many concurrent requests' })).toMatch(/busy/i);
    expect(searchFailureMessage(504, null)).toMatch(/too long/i);
  });

  it('says it could not connect when nothing answered', () => {
    expect(searchFailureMessage(null, null)).toMatch(/connection/i);
  });

  it('stays friendly for a 4xx that gives no reason', () => {
    expect(searchFailureMessage(404, null)).toMatch(/couldn't load flights/i);
  });
});

describe('filters on a round trip', () => {
  const anyFilters = {
    price: [0, 50000], stops: 'any', airlines: [], departureTime: 'any',
    baggage: 'any', refundable: 'any', originAirports: [], destAirports: [],
  };
  const priceOf = (flight) => flight.price.amount;
  const roundTrip = (outbound, back) => ({
    price: { amount: 300 },
    airline: { name: 'Air India' },
    stops: outbound.stops,
    departure: { time: outbound.time, airport: 'DEL' },
    arrival: { airport: 'BOM' },
    returnLeg: { stops: back.stops, departure: { time: back.time } },
  });

  // Stops and departure time looked only at the outbound leg.
  it('is not non-stop when the return connects', () => {
    const flight = roundTrip({ stops: 0, time: '08:00' }, { stops: 1, time: '09:00 AM' });

    expect(matchesFilters(flight, { ...anyFilters, stops: '0' }, priceOf)).toBe(false);
    expect(matchesFilters(flight, { ...anyFilters, stops: '1' }, priceOf)).toBe(true);
  });

  it('counts two or more stops on either leg', () => {
    const flight = roundTrip({ stops: 0, time: '08:00' }, { stops: 2, time: '09:00 AM' });
    expect(matchesFilters(flight, { ...anyFilters, stops: '2' }, priceOf)).toBe(true);
    expect(matchesFilters(flight, { ...anyFilters, stops: '1' }, priceOf)).toBe(false);
  });

  it('needs every leg to leave in the chosen part of the day', () => {
    const lateReturn = roundTrip({ stops: 0, time: '08:00' }, { stops: 0, time: '11:30 PM' });
    const morningBothWays = roundTrip({ stops: 0, time: '08:00' }, { stops: 0, time: '09:15 AM' });

    expect(matchesFilters(lateReturn, { ...anyFilters, departureTime: 'morning' }, priceOf)).toBe(false);
    expect(matchesFilters(lateReturn, { ...anyFilters, departureTime: 'night' }, priceOf)).toBe(false);
    expect(matchesFilters(morningBothWays, { ...anyFilters, departureTime: 'morning' }, priceOf)).toBe(true);
  });

  it('still filters a one-way flight on its only leg', () => {
    const oneWay = { price: { amount: 100 }, airline: { name: 'Vistara' }, stops: 0, departure: { time: '22:10' }, arrival: {} };

    expect(matchesFilters(oneWay, { ...anyFilters, departureTime: 'night' }, priceOf)).toBe(true);
    expect(matchesFilters(oneWay, { ...anyFilters, departureTime: 'morning' }, priceOf)).toBe(false);
    expect(matchesFilters(oneWay, { ...anyFilters, stops: '0' }, priceOf)).toBe(true);
    expect(matchesFilters(oneWay, { ...anyFilters, price: [0, 99] }, priceOf)).toBe(false);
  });
});
