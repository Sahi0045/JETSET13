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

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
});

describe('POST /api/flights/search', () => {
  it('returns cards carrying every field the clients read', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app)
      .post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

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
      .send({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

    expect(res.body.data[0].duration).toMatch(/^\d+h( \d+m)?$/);
    expect(res.body.data[0].duration).not.toMatch(/^PT/);
  });

  it('resolves airline and aircraft codes to names', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

    const card = res.body.data[0];
    expect(card.airline).not.toBe(card.airlineCode);
    expect(card.aircraft).not.toBe('Unknown');
  });

  it('carries originalOffer with the keys the booking route gates on', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

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
      .send({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', returnDate: '2026-11-22', adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data[0].originalOffer.itineraries).toHaveLength(2);
  });

  // A search with no fares is a successful search. Both clients treat a
  // non-200 or success:false as an error banner rather than "no flights".
  it('returns 200 with an empty array when nothing is found', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-no-results')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'SCK', departDate: '2026-11-15', adults: 1 });

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
      .send({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

    expect(JSON.stringify(res.body)).not.toMatch(/mock/i);
    expect(res.body.meta.source).not.toMatch(/mock/i);
  });
});

describe('kill switch', () => {
  it('returns a clean 503 and never calls Amadeus when disabled', async () => {
    vi.stubEnv('AMADEUS_WS_ENABLED', 'false');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

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
