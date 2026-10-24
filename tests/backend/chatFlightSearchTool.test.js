import axios from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEARCH_FLIGHTS_DECLARATION,
  cardSummary,
  flightsApiBase,
  normalizeSearchArgs,
  pickCards,
  runFlightSearch,
  searchBody,
} from '../../backend/services/chat/flightSearchTool.js';
import { buildSearchPayload } from '../../frontend/src/Pages/Common/flights/searchQuery.js';
import offers from '../fixtures/flights/searchOffers.json';

const today = '2026-10-24';

const offer = (id, { price, minutes = 120, stops = 0, airline = 'AI', time = '08:00' }) => ({
  id,
  airline: `Airline ${airline}`,
  airlineCode: airline,
  price: { total: price.toFixed(2), amount: price, currency: 'USD' },
  durationMinutes: minutes,
  duration: `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
  stops,
  departure: { time, airport: 'DEL', date: '2026-11-23' },
  arrival: { time: '23:00', airport: 'BOM', date: '2026-11-23' },
});

describe('normalizeSearchArgs', () => {
  it('normalizes a complete one-way request', () => {
    const result = normalizeSearchArgs(
      { from: 'New York', to: 'LA', departDate: '2026-11-15', tripType: 'oneWay', adults: 2 },
      { today },
    );

    expect(result.ok).toBe(true);
    expect(result.search).toEqual({
      from: 'New York', to: 'LA', departDate: '2026-11-15', adults: 2, children: 0, infants: 0, travelClass: 'ECONOMY',
    });
    expect(result.refine).toEqual({ nonStop: false, airlines: [], timeOfDay: undefined, maxPrice: undefined });
  });

  it('asks for what is missing', () => {
    const result = normalizeSearchArgs({ from: 'DEL', to: 'BOM', departDate: '2026-11-15' }, { today });

    expect(result).toEqual({ ok: false, missing: ['tripType', 'adults'] });
  });

  it('refuses a past date', () => {
    const result = normalizeSearchArgs(
      { from: 'DEL', to: 'BOM', departDate: '2026-10-23', tripType: 'oneWay', adults: 1 },
      { today },
    );

    expect(result).toEqual({ ok: false, missing: [], reason: 'PAST_DATE' });
  });

  it('round trip needs a return date on or after departure', () => {
    const base = { from: 'DEL', to: 'BOM', departDate: '2026-11-15', tripType: 'roundTrip', adults: 1 };

    expect(normalizeSearchArgs(base, { today })).toEqual({ ok: false, missing: ['returnDate'] });
    expect(normalizeSearchArgs({ ...base, returnDate: '2026-11-14' }, { today }))
      .toEqual({ ok: false, missing: [], reason: 'RETURN_BEFORE_DEPARTURE' });
    expect(normalizeSearchArgs({ ...base, returnDate: '2026-11-20' }, { today }).search.returnDate).toBe('2026-11-20');
  });

  it('a one-way search carries no return date', () => {
    const result = normalizeSearchArgs(
      { from: 'DEL', to: 'BOM', departDate: '2026-11-15', tripType: 'oneWay', returnDate: '2026-11-20', adults: 1 },
      { today },
    );

    expect(result.search.returnDate).toBeUndefined();
  });

  it('more infants than adults is refused', () => {
    const result = normalizeSearchArgs(
      { from: 'DEL', to: 'BOM', departDate: '2026-11-15', tripType: 'oneWay', adults: 1, infants: 2 },
      { today },
    );

    expect(result).toEqual({ ok: false, missing: [], reason: 'INFANTS_EXCEED_ADULTS' });
  });

  it('keeps a known cabin and the refinements', () => {
    const result = normalizeSearchArgs({
      from: 'DEL', to: 'BOM', departDate: '2026-11-15', tripType: 'oneWay', adults: 1,
      cabin: 'business', nonStop: true, airlines: ['ai', 'bad code'], timeOfDay: 'morning', maxPrice: 300,
    }, { today });

    expect(result.search.travelClass).toBe('BUSINESS');
    expect(result.refine).toEqual({ nonStop: true, airlines: ['AI'], timeOfDay: 'morning', maxPrice: 300 });
  });
});

describe('the search request', () => {
  const search = { from: 'New York', to: 'LA', departDate: '2026-11-15', adults: 2, children: 1, infants: 0, travelClass: 'ECONOMY' };

  beforeEach(() => {
    axios.post.mockReset();
    delete process.env.FLIGHTS_API_BASE;
    delete process.env.VERCEL;
  });

  it('the body matches the search page', () => {
    expect(searchBody(search)).toEqual(buildSearchPayload(search));
    expect(searchBody({ ...search, returnDate: '2026-11-20' })).toEqual(buildSearchPayload({ ...search, returnDate: '2026-11-20' }));
  });

  it('refinements never reach the search route', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { success: true, data: offers, meta: { searchParams: { from: 'JFK', to: 'LAX' } } } });

    const result = await runFlightSearch(search, { visitorIp: '203.0.113.9' });

    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:5004/api/flights/search');
    expect(body).not.toHaveProperty('nonStop');
    expect(body).not.toHaveProperty('includedAirlineCodes');
    expect(config.headers['x-forwarded-for']).toBe('203.0.113.9');
    expect(result).toEqual({ ok: true, offers, total: offers.length, resolved: { from: 'JFK', to: 'LAX' } });
  });

  it("passes the route's refusal through", async () => {
    const error = 'We could not find "Springfield". Please choose the city or airport from the list as you type.';
    axios.post.mockResolvedValue({ status: 400, data: { success: false, code: 'UNKNOWN_PLACE', error } });

    expect(await runFlightSearch(search, {})).toEqual({ ok: false, status: 400, code: 'UNKNOWN_PLACE', message: error });
  });

  it('a search that never answers is a failure, not an error', async () => {
    axios.post.mockRejectedValue(Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' }));

    const result = await runFlightSearch(search, {});

    expect(result.ok).toBe(false);
    expect(result.status).toBe(504);
  });

  it('no flights is an answer with no offers', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { success: true, data: [], message: 'No flights found for the specified route and date.' } });

    expect(await runFlightSearch(search, {})).toEqual({ ok: true, offers: [], total: 0, resolved: search });
  });

  it('calls Lightsail from Vercel and the configured base when there is one', () => {
    expect(flightsApiBase({ VERCEL: '1' })).toBe('https://api.jetsetterss.com');
    expect(flightsApiBase({ FLIGHTS_API_BASE: 'https://example.test/', VERCEL: '1' })).toBe('https://example.test');
    expect(flightsApiBase({ PORT: '5010' })).toBe('http://127.0.0.1:5010');
  });
});

describe('the cards', () => {
  const nine = [
    offer('a', { price: 300, minutes: 130 }),
    offer('b', { price: 150, minutes: 400, stops: 1 }),
    offer('c', { price: 200, minutes: 90, stops: 1 }),
    offer('d', { price: 250, minutes: 125 }),
    offer('e', { price: 160, minutes: 380, stops: 2 }),
    offer('f', { price: 170, minutes: 390, stops: 1 }),
    offer('g', { price: 180, minutes: 395, stops: 1 }),
    offer('h', { price: 190, minutes: 399, stops: 1, airline: 'UK', time: '06:30' }),
    offer('i', { price: 999, minutes: 100, airline: 'UK', time: '22:15' }),
  ];

  it('picks cheapest, fastest and cheapest nonstop first, at most 5, no repeats', () => {
    const cards = pickCards(nine, {});

    expect(cards.map((c) => c.id)).toEqual(['b', 'c', 'd', 'e', 'f']);
  });

  it('applies nonstop', () => {
    expect(pickCards(nine, { nonStop: true }).map((c) => c.id)).toEqual(['d', 'i', 'a']);
  });

  it('applies the airline', () => {
    expect(pickCards(nine, { airlines: ['UK'] }).map((c) => c.id)).toEqual(['h', 'i']);
  });

  it('applies the time of day', () => {
    expect(pickCards(nine, { timeOfDay: 'night' }).map((c) => c.id)).toEqual(['i']);
    expect(pickCards(nine, { timeOfDay: 'morning' }).map((c) => c.id)).not.toContain('i');
    expect(pickCards([nine[7], nine[8]], { timeOfDay: 'morning' }).map((c) => c.id)).toEqual(['h']);
  });

  it('applies the max price', () => {
    expect(pickCards(nine, { maxPrice: 165 }).map((c) => c.id)).toEqual(['b', 'e']);
  });

  it('summary lines carry the card total and the service fee words', () => {
    const summary = cardSummary(offers, { adults: 2, children: 0, infants: 0 });
    const lines = summary.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(`USD ${offers[0].price.total} for 2 travellers + service fee`);
    expect(lines[0]).toContain('nonstop');
    expect(lines[1]).toContain('1 stop');
  });
});

describe('the declaration', () => {
  it('names the tool and requires what the bot must ask for', () => {
    expect(SEARCH_FLIGHTS_DECLARATION.name).toBe('search_flights');
    expect(SEARCH_FLIGHTS_DECLARATION.parameters.required).toEqual(['from', 'to', 'departDate', 'tripType', 'adults']);
  });
});
