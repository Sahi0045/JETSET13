import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The flight endpoints that reach Amadeus have their own per-IP limit.
 *
 * Search, price, upsell, fare rules, seat maps and the date calendars are
 * unauthenticated and each call spends GDS capacity. They only had the general
 * 300/min limiter, which a scraper could spend entirely on them.
 *
 * Every request here is refused by the route's own validation before Amadeus
 * is reached, so the only thing counted is the limiter.
 */

const ENDPOINTS = [
  ['post', '/search'],
  ['post', '/price'],
  ['post', '/upsell'],
  ['post', '/fare-rules'],
  ['post', '/seatmaps'],
  ['post', '/date-prices'],
  ['get', '/cheapest-dates'],
  ['post', '/calendar-prices'],
];

const makeApp = async (max) => {
  if (max === undefined) delete process.env.RATE_LIMIT_FLIGHT_MAX;
  else process.env.RATE_LIMIT_FLIGHT_MAX = String(max);
  vi.resetModules();
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  // As in every entry point, so the address is the client's, not the proxy's.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/flights', routes);
  // Vercel mounts the same router a second time without the prefix.
  app.use('/flights', routes);
  return app;
};

const call = (app, [method, path], ip, prefix = '/api/flights') =>
  request(app)[method](`${prefix}${path}`).set('X-Forwarded-For', ip).send(method === 'post' ? {} : undefined);

afterEach(() => {
  delete process.env.RATE_LIMIT_FLIGHT_MAX;
});

describe('flight search limiter', () => {
  it('counts every Amadeus endpoint against one budget and answers 429 past it', async () => {
    const app = await makeApp(ENDPOINTS.length);

    for (const endpoint of ENDPOINTS) {
      const res = await call(app, endpoint, '203.0.113.7');
      expect(res.status, endpoint[1]).not.toBe(429);
    }

    const res = await call(app, ENDPOINTS[0], '203.0.113.7');
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/too many flight searches.*wait a minute/i);
  });

  it('gives each address its own budget', async () => {
    const app = await makeApp(2);
    await call(app, ['post', '/price'], '203.0.113.7');
    await call(app, ['post', '/price'], '203.0.113.7');
    expect((await call(app, ['post', '/price'], '203.0.113.7')).status).toBe(429);

    expect((await call(app, ['post', '/price'], '198.51.100.23')).status).not.toBe(429);
  });

  it('applies on the unprefixed mount as well', async () => {
    const app = await makeApp(1);
    await call(app, ['post', '/seatmaps'], '203.0.113.7', '/flights');
    expect((await call(app, ['post', '/seatmaps'], '203.0.113.7', '/flights')).status).toBe(429);
  });

  it('leaves the other flight routes alone', async () => {
    const app = await makeApp(1);
    await call(app, ['post', '/price'], '203.0.113.7');
    expect((await call(app, ['post', '/price'], '203.0.113.7')).status).toBe(429);

    const health = await request(app).get('/api/flights/health').set('X-Forwarded-For', '203.0.113.7');
    expect(health.status).toBe(200);
  });

  // A hurried customer's minute, counted from the pages (see security.js):
  // well past a normal search-to-review pass, and still nowhere near the limit.
  it('never throttles a busy customer at the default', async () => {
    const app = await makeApp(undefined);
    const statuses = [];
    for (let i = 0; i < 40; i += 1) {
      statuses.push((await call(app, ENDPOINTS[i % ENDPOINTS.length], '203.0.113.7')).status);
    }
    expect(statuses).not.toContain(429);
  });
});
