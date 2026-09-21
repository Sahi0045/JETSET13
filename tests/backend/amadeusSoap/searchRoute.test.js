import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';

/**
 * POST /api/flights/search over HTTP, with Amadeus replaced by recorded XML.
 *
 * This is the contract test: the web app and the mobile app both read the
 * fields asserted here, and neither is being changed by the migration, so a
 * regression in this file is a regression on the live site.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');

const makeApp = async () => {
  const routes = (await import('../../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

const reply = (xml) => ({ status: 200, data: xml, headers: {} });

// A date `n` days from now, in UTC. The route refuses departures that have
// passed, so a fixed date here would turn every test into a 400 the day after it.
const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
});

/**
 * A search result must not state what the fare does not.
 *
 * Refundability was read from `refundableTaxes`, a tax amount this provider
 * never sets, so every fare was "Non-refundable". The cabin defaulted to
 * Economy, seats to "Available", and offers that failed to transform vanished
 * with nothing counting them.
 */

/** A search reply whose first flight lands at Keflavik on the way (a technical stop). */
const withTechnicalStop = (xml) => xml
  .replace('<equipmentType>744</equipmentType></productDetail>', '<equipmentType>744</equipmentType><techStopNumber>1</techStopNumber></productDetail>')
  .replace('<productDetailQualifier>AVR</productDetailQualifier></addProductDetail></flightInformation></flightDetails>',
    '<productDetailQualifier>AVR</productDetailQualifier></addProductDetail></flightInformation>'
    + '<technicalStop><stopDetails><dateQualifier>AA</dateQualifier><date>151126</date><firstTime>1605</firstTime><locationId>KEF</locationId></stopDetails>'
    + '<stopDetails><dateQualifier>AD</dateQualifier><date>151126</date><firstTime>1640</firstTime></stopDetails></technicalStop></flightDetails>');

describe('stops on a result card', () => {
  it('counts a technical stop, so the flight is not shown as non-stop', async () => {
    axios.post.mockResolvedValue(reply(withTechnicalStop(fixture('mptbs-nonstop-business'))));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search').send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    const card = res.body.data.find((c) => c.originalOffer.itineraries[0].segments[0].number === '3629');
    expect(card.stops).toBe(1);
    expect(card.stopDetails).toEqual([expect.objectContaining({ airport: 'KEF', technical: true, duration: '0h 35m' })]);
  });
});

describe('a place the search cannot name', () => {
  // Sent as typed - or as the first suggestion for its first word - it searched
  // somewhere else under a heading naming what the customer typed.
  it('is refused with a way forward, and nothing is searched', async () => {
    axios.post.mockReset();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search').send({ from: 'Nowhere At All', to: 'LHR', departDate: inDays(60), adults: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_PLACE');
    expect(res.body.error).toMatch(/choose the city or airport from the list/);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('what a search result does not invent', () => {
  it('takes refundability from the fare rules and leaves unknowns unknown', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app)
      .post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    expect(res.body.data.length).toBeGreaterThan(0);
    for (const card of res.body.data) {
      expect(card.refundable).toBe(card.originalOffer?._ama?.refundable ?? null);
      expect(card.seats).not.toBe('Available');
    }
    expect(res.body.meta).toHaveProperty('droppedCount', 0);
  });

  it('has no invented cabin, seats or refundability left in the route', () => {
    const source = readFileSync(new URL('../../../backend/routes/flight.routes.js', import.meta.url), 'utf8');
    expect(source).not.toContain("}, 'ECONOMY');");
    expect(source).not.toContain("|| 'Available'");
    expect(source).not.toMatch(/refundableTaxes \? true : false/);
    expect(source).not.toMatch(/res\.status\(200\)\.json\(\{ success: false/);
    // Fare detail was dumped to production logs on every search.
    expect(source).not.toContain('DEBUG: First flight travelerPricing');
  });
});

describe('POST /api/flights/search', () => {
  it('returns cards carrying every field the clients read', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app)
      .post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const card = res.body.data[0];
    for (const key of [
      'id', 'airline', 'airlineCode', 'flightNumber', 'duration', 'stops',
      'departure', 'arrival', 'price', 'cabin', 'bookingClass', 'aircraft',
      'refundable', 'baggage', 'baggageDetails', 'amenities', 'fareBasis',
      'validatingAirlineCodes', 'numberOfBookableSeats', 'originalOffer',
    ]) {
      expect(card, `missing ${key}`).toHaveProperty(key);
    }

    expect(card.departure).toMatchObject({
      airport: expect.any(String), time: expect.any(String), date: expect.any(String),
    });
    expect(card.price).toMatchObject({
      total: expect.any(String), currency: 'USD', base: expect.any(String),
    });
  });

  // Mobile renders flight.duration verbatim; switching to ISO 8601 would show
  // customers "PT10H25M".
  it('formats duration as "Xh Ym", not ISO 8601', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    expect(res.body.data[0].duration).toMatch(/^\d+h( \d+m)?$/);
    expect(res.body.data[0].duration).not.toMatch(/^PT/);
  });

  it('resolves airline and aircraft codes to names', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    const card = res.body.data[0];
    expect(card.airline).not.toBe(card.airlineCode);
    expect(card.aircraft).not.toBe('Unknown');
  });

  it('carries originalOffer with the keys the booking route gates on', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    const offer = res.body.data[0].originalOffer;
    expect(offer.itineraries).toBeDefined();
    expect(offer.source).toBe('GDS');
    expect(offer.travelerPricings).toBeDefined();
    expect(offer._ama.segments.length).toBeGreaterThan(0);
  });

  it('handles a round trip as two itineraries', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-roundtrip')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), returnDate: inDays(67), adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data[0].originalOffer.itineraries).toHaveLength(2);
  });

  // A search with no fares is a successful search. Both clients treat a
  // non-200 or success:false as an error banner rather than "no flights".
  it('returns 200 with an empty array when nothing is found', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-no-results')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'SCK', departDate: inDays(60), adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a request missing required fields before calling Amadeus', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search').send({ from: 'JFK' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('never returns a mock or fabricated flight', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    expect(JSON.stringify(res.body)).not.toMatch(/mock/i);
    expect(res.body.meta.source).not.toMatch(/mock/i);
  });
});

describe('what the search route refuses or resolves before calling Amadeus', () => {
  // A departure already gone came back as "Flight search failed", which the
  // results page showed as "No flights found".
  it('refuses a departure date that has passed, with a message the customer can act on', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(-3), adults: 1 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/departure date has already passed/i);
    expect(axios.post).not.toHaveBeenCalled();
  });

  // The customer's today can still be yesterday in UTC.
  it('allows yesterday in UTC', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(-1), adults: 1 });

    expect(res.status).toBe(200);
  });

  it('refuses a return date before the departure date', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(30), returnDate: inDays(29), adults: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/return date is before the departure date/i);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('allows a return on the day of departure', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-roundtrip')));
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(30), returnDate: inDays(30), adults: 1 });

    expect(res.status).toBe(200);
  });

  // The modify-search form sent its display label, and the first word of
  // "New Delhi (DEL)" resolved to New York.
  it('searches the airport a picked suggestion names', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-family-del-bom')));
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'New Delhi (DEL)', to: 'Mumbai (BOM)', departDate: inDays(30), adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.meta.searchParams).toMatchObject({ from: 'DEL', to: 'BOM' });
    const sent = String(axios.post.mock.calls[0][1]);
    expect(sent).toMatch(/>DEL</);
    expect(sent).toMatch(/>BOM</);
    expect(sent).not.toMatch(/>NYC</);
  });
});

describe('what a search returns', () => {
  it('shows every flight combination Amadeus priced, including the cheapest', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-shared-price-combinations')));
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'DEL', to: 'BOM', departDate: inDays(30), adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(50);
    expect(res.body.meta.droppedCount).toBe(0);
    expect(new Set(res.body.data.map((card) => card.id)).size).toBe(50);
    expect(res.body.data.map((card) => card.price.total)).toContain('76.00');
  });

  // The web app's "Fastest" sort needs a number; it parsed "2h 35m" as zero.
  it('carries the duration in minutes alongside the "Xh Ym" text', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    for (const card of res.body.data) {
      const [, hours, minutes] = card.duration.match(/^(\d+)h (\d+)m$/);
      expect(card.durationMinutes).toBe(Number(hours) * 60 + Number(minutes));
      expect(card.durationMinutes).toBeGreaterThan(0);
    }
  });

  // This WSAP's Master Pricer request has no price ceiling, and maxPrice was
  // accepted, keyed, and never sent: fares far over the cap came back as if
  // they satisfied it, each through a fresh live search. Neither app sends it -
  // both filter the results they are given - so it is refused, not faked.
  it('refuses a price ceiling it cannot apply, before searching', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();
    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1, maxPrice: 50 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('kill switch', () => {
  it('returns a clean 503 and never calls Amadeus when disabled', async () => {
    vi.stubEnv('AMADEUS_WS_ENABLED', 'false');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.success).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('GET /api/flights/health', () => {
  it('reports provider status without leaking credentials', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/flights/health');

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('amadeus-soap');
    expect(res.body.configured).toBe(true);
    expect(res.body.airportDataset.count).toBeGreaterThan(3000);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('pw');
    expect(body).not.toContain('WSTEST');
  });
});
