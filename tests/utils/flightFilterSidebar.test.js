import { describe, expect, it } from 'vitest';
import {
  filtersWithin,
  journeyBounds,
  layoverBounds,
  matchesFilters,
  minuteOfDay,
  stopsSummary,
} from '../../frontend/src/Pages/Common/flights/searchResults.js';

/**
 * The left-hand filter column (Skyscanner style): stops as tick boxes with a
 * "from" price, departure-time ranges per leg, a longest journey, a longest
 * layover. Each of these is a plain function of the flights, so the column and
 * the list cannot disagree about what a filter keeps.
 */

const priceOf = (flight) => flight.price.amount;
const bounds = { min: 0, max: 1000 };
const all = filtersWithin(bounds);

const seg = (from, to, departAt, arriveAt) => ({
  departure: { airport: from, at: departAt },
  arrival: { airport: to, at: arriveAt },
});

const flight = ({
  price = 200,
  stops = 0,
  time = '10:00',
  durationMinutes = 120,
  segments = [],
  returnLeg = null,
} = {}) => ({
  price: { amount: price },
  airline: { name: 'Air India' },
  stops,
  departure: { time, airport: 'DEL' },
  arrival: { airport: 'HYD' },
  durationMinutes,
  segments,
  returnLeg,
  baggage: { checked: null },
  refundable: false,
});

describe('the filters with nothing narrowed', () => {
  it('keep every stop count, the whole day both ways and any journey or layover length', () => {
    expect(all.stops).toEqual([]);
    expect(all.outboundTimes).toEqual([0, 1439]);
    expect(all.returnTimes).toEqual([0, 1439]);
    expect(all.maxJourney).toBeNull();
    expect(all.maxLayover).toBeNull();
    expect(all.price).toEqual([0, 1000]);
  });

  it('keep every kind of flight', () => {
    expect(matchesFilters(flight({ stops: 3, time: '23:59', durationMinutes: 2000 }), all, priceOf)).toBe(true);
  });
});

describe('stops as tick boxes', () => {
  const direct = flight({ stops: 0 });
  const oneStop = flight({ stops: 1 });
  const twoStops = flight({ stops: 2 });
  const threeStops = flight({ stops: 3 });

  it('keeps only the ticked counts', () => {
    const only1 = { ...all, stops: [1] };
    expect([direct, oneStop, twoStops].map((f) => matchesFilters(f, only1, priceOf))).toEqual([false, true, false]);
  });

  it('keeps direct and one-stop flights together', () => {
    const both = { ...all, stops: [0, 1] };
    expect([direct, oneStop, twoStops].map((f) => matchesFilters(f, both, priceOf))).toEqual([true, true, false]);
  });

  it('counts three stops as "2+ stops"', () => {
    expect(matchesFilters(threeStops, { ...all, stops: [2] }, priceOf)).toBe(true);
  });

  it('is not direct when the return connects', () => {
    const roundTrip = flight({ stops: 0, returnLeg: { stops: 1, departure: { time: '09:00' } } });
    expect(matchesFilters(roundTrip, { ...all, stops: [0] }, priceOf)).toBe(false);
    expect(matchesFilters(roundTrip, { ...all, stops: [1] }, priceOf)).toBe(true);
  });

  it('says how many flights each box keeps and the cheapest of them', () => {
    const summary = stopsSummary([direct, flight({ stops: 0, price: 150 }), twoStops, threeStops], priceOf);
    expect(summary).toEqual([
      { value: 0, count: 2, minPrice: 150 },
      { value: 1, count: 0, minPrice: null },
      { value: 2, count: 2, minPrice: 200 },
    ]);
  });
});

describe('departure time ranges', () => {
  it('reads a 24-hour and a 12-hour clock', () => {
    expect(minuteOfDay('14:05')).toBe(845);
    expect(minuteOfDay('02:05 PM')).toBe(845);
    expect(minuteOfDay('12:30 AM')).toBe(30);
    expect(minuteOfDay('')).toBeNull();
  });

  it('keeps an outbound leaving inside the range, both ends included', () => {
    const window = { ...all, outboundTimes: [360, 720] };
    expect(matchesFilters(flight({ time: '06:00' }), window, priceOf)).toBe(true);
    expect(matchesFilters(flight({ time: '12:00' }), window, priceOf)).toBe(true);
    expect(matchesFilters(flight({ time: '12:01' }), window, priceOf)).toBe(false);
    expect(matchesFilters(flight({ time: '05:59' }), window, priceOf)).toBe(false);
  });

  it('applies the return range to the return leg only', () => {
    const late = flight({ time: '08:00', returnLeg: { stops: 0, departure: { time: '22:30' } } });
    expect(matchesFilters(late, { ...all, returnTimes: [0, 1200] }, priceOf)).toBe(false);
    expect(matchesFilters(late, { ...all, outboundTimes: [0, 600] }, priceOf)).toBe(true);
  });

  it('keeps a flight whose time it cannot read', () => {
    expect(matchesFilters(flight({ time: '' }), { ...all, outboundTimes: [360, 720] }, priceOf)).toBe(true);
  });
});

describe('the longest journey', () => {
  it('drops a flight with any leg longer than the limit', () => {
    const long = flight({ durationMinutes: 300 });
    const longReturn = flight({ durationMinutes: 120, returnLeg: { stops: 0, durationMinutes: 400, departure: { time: '09:00' } } });
    const limit = { ...all, maxJourney: 240 };
    expect(matchesFilters(flight({ durationMinutes: 240 }), limit, priceOf)).toBe(true);
    expect(matchesFilters(long, limit, priceOf)).toBe(false);
    expect(matchesFilters(longReturn, limit, priceOf)).toBe(false);
  });

  it('keeps a flight whose duration is unknown', () => {
    expect(matchesFilters(flight({ durationMinutes: null }), { ...all, maxJourney: 60 }, priceOf)).toBe(true);
  });

  it('spans the shortest to the longest leg of the results', () => {
    const flights = [
      flight({ durationMinutes: 90 }),
      flight({ durationMinutes: 660, returnLeg: { stops: 0, durationMinutes: 600, departure: { time: '09:00' } } }),
      flight({ durationMinutes: null }),
    ];
    expect(journeyBounds(flights)).toEqual({ min: 90, max: 660 });
    expect(journeyBounds([])).toBeNull();
  });
});

describe('the longest layover', () => {
  const connecting = (waitMinutes) => {
    const landHour = 10;
    const leaveAt = new Date(Date.UTC(2026, 9, 18, landHour, waitMinutes)).toISOString().slice(0, 19);
    return flight({
      stops: 1,
      segments: [
        seg('DEL', 'BLR', '2026-10-18T08:00:00', `2026-10-18T${String(landHour).padStart(2, '0')}:00:00`),
        seg('BLR', 'HYD', leaveAt, '2026-10-18T23:00:00'),
      ],
    });
  };

  it('drops a connection that waits longer than the limit', () => {
    const limit = { ...all, maxLayover: 120 };
    expect(matchesFilters(connecting(120), limit, priceOf)).toBe(true);
    expect(matchesFilters(connecting(195), limit, priceOf)).toBe(false);
  });

  it('keeps a direct flight whatever the limit', () => {
    expect(matchesFilters(flight({ stops: 0 }), { ...all, maxLayover: 30 }, priceOf)).toBe(true);
  });

  it('looks at the return leg too', () => {
    const out = connecting(60);
    const back = connecting(300);
    const roundTrip = { ...out, returnLeg: { stops: 1, segments: back.segments, departure: { time: '09:00' } } };
    expect(matchesFilters(roundTrip, { ...all, maxLayover: 120 }, priceOf)).toBe(false);
  });

  it('spans the shortest to the longest wait of the results, or nothing without connections', () => {
    expect(layoverBounds([connecting(70), connecting(195), flight()])).toEqual({ min: 70, max: 195 });
    expect(layoverBounds([flight(), flight()])).toBeNull();
  });
});
