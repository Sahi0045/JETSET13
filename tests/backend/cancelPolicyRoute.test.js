import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * When a booking made now stops being free to cancel: the review page shows it
 * before payment. It is the end of the ticketing office's day, the last moment
 * the ticket can be voided.
 */

const app = async () => {
  vi.resetModules();
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const server = express();
  server.use('/api/flights', routes);
  return server;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-10-12T14:30:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /api/flights/cancel-policy', () => {
  it('gives the end of the office day in Pacific time by default', async () => {
    const res = await request(await app()).get('/api/flights/cancel-policy');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, freeUntil: '2026-10-13T07:00:00.000Z', timeZone: 'America/Los_Angeles' });
  });

  it('follows the office time zone that is set', async () => {
    vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', 'America/New_York');

    const res = await request(await app()).get('/api/flights/cancel-policy');

    expect(res.body).toMatchObject({ freeUntil: '2026-10-13T04:00:00.000Z', timeZone: 'America/New_York' });
  });

  it('gives no deadline for an office time zone it cannot read', async () => {
    vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', 'Not/AZone');

    const res = await request(await app()).get('/api/flights/cancel-policy');

    expect(res.body).toMatchObject({ success: true, freeUntil: null });
  });
});
