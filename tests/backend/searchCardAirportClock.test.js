import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';

/**
 * The departure and arrival times on a search result card, as the airports'
 * clocks read them, whatever time zone the server runs in.
 *
 * The search route wrote each card's `departure.time` / `arrival.time` with
 * `new Date(at).toLocaleTimeString()`: the airline's airport-local time read
 * through the SERVER's zone. The results card prints them, the review page and
 * the order page fall back to them, and the departure-time filter sorts on
 * them. Production runs in UTC, which has no clock change, so they came out
 * right by accident; a server in New York's zone showed a 02:40 departure on
 * its spring-forward day as 03:40. The booking record had the same fault
 * (bookingRecordAirportClock.test.js).
 *
 * 14 Mar 2027 is the day New York springs forward (02:00 -> 03:00).
 */

const offerFor = (segments) => ({
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{ duration: 'PT2H', segments }],
  price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00', fees: [] },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: segments.map((s) => ({ segmentId: s.id, cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' })),
  }],
});

const flight = (id, from, to, dep, arr) => ({
  id, carrierCode: 'AI', number: `10${id}`, aircraft: { code: '320' }, numberOfStops: 0,
  departure: { iataCode: from, at: dep },
  arrival: { iataCode: to, at: arr },
});

/** Searches with `segments` as the one offer Amadeus answers, and returns its card. */
async function cardFor(segments) {
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      searchFlights: vi.fn(async () => ({ success: true, data: [offerFor(segments)], dictionaries: {} })),
    },
    providerStatus: () => ({ bookingEnabled: false, wsap: '1ASIWTEST' }),
  }));
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);

  const res = await request(app).post('/api/flights/search').send({ from: 'DEL', to: 'BOM', departDate: '2027-03-14', adults: 1 });
  expect(res.body.success).toBe(true);
  expect(res.body.data).toHaveLength(1);
  return res.body.data[0];
}

let originalTz;
beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('a search result card, made by a server in New York on its spring-forward day', () => {
  it("shows a 02:40 departure as the airport's clock reads it, not 03:40", async () => {
    const card = await cardFor([flight('1', 'DEL', 'BOM', '2027-03-14T02:40:00', '2027-03-14T04:40:00')]);

    expect(card.departure.time).toBe('02:40');
    expect(card.arrival.time).toBe('04:40');
  });

  it("shows a 02:50 arrival as the airport's clock reads it, not 03:50", async () => {
    const card = await cardFor([flight('1', 'BOM', 'DEL', '2027-03-14T00:35:00', '2027-03-14T02:50:00')]);

    expect(card.departure.time).toBe('00:35');
    expect(card.arrival.time).toBe('02:50');
  });

  it('reads a connection from its first departure and its last arrival', async () => {
    const card = await cardFor([
      flight('1', 'DEL', 'BOM', '2027-03-14T02:40:00', '2027-03-14T04:40:00'),
      flight('2', 'BOM', 'GOI', '2027-03-14T06:00:00', '2027-03-14T07:15:00'),
    ]);

    expect(card.departure.time).toBe('02:40');
    expect(card.arrival.time).toBe('07:15');
  });
});

describe('a search result card on an ordinary day, as before', () => {
  it('keeps an evening departure and a next-morning arrival, in 24 hours', async () => {
    const card = await cardFor([flight('1', 'JFK', 'LHR', '2026-11-15T19:25:00', '2026-11-16T06:10:00')]);

    expect(card.departure).toMatchObject({ time: '19:25', date: '2026-11-15', airport: 'JFK' });
    expect(card.arrival).toMatchObject({ time: '06:10', date: '2026-11-16', airport: 'LHR' });
  });

  it('keeps a departure just after midnight as 00:05, not 24:05', async () => {
    const card = await cardFor([flight('1', 'DEL', 'BOM', '2026-11-15T00:05:00', '2026-11-15T12:30:00')]);

    expect(card.departure.time).toBe('00:05');
    expect(card.arrival.time).toBe('12:30');
  });
});
