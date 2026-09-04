import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Health endpoints report presence, never values.
 *
 * `/api/flights/health` echoes the endpoint, WSAP and office id so an operator
 * can see which environment a box is pointed at — that is the point of it. The
 * line it must not cross is the credentials, and it is an unauthenticated
 * endpoint, so "must not" is literal.
 *
 * The plan named this as a required test. It did not exist, so the contract
 * held only by inspection.
 */

const PASSWORD = 'sup3r-s3cret-ws-password';
const USERNAME = 'WSJETSETTER';

const makeApp = async () => {
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return app;
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', USERNAME);
  vi.stubEnv('AMADEUS_WS_PASSWORD', PASSWORD);
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
});

describe('GET /api/flights/health', () => {
  it('never includes the password or the username', async () => {
    const app = await makeApp();

    const res = await request(app).get('/api/flights/health');
    const body = JSON.stringify(res.body);

    expect(res.status).toBe(200);
    expect(body).not.toContain(PASSWORD);
    expect(body).not.toContain(USERNAME);
  });

  it('reports credentials as a boolean, not as content', async () => {
    const app = await makeApp();

    const res = await request(app).get('/api/flights/health');

    // `configured` is the whole credential report: a boolean over key presence.
    expect(res.body.configured).toBe(true);
    expect(Object.keys(res.body)).not.toContain('password');
    expect(Object.keys(res.body)).not.toContain('username');
  });

  it('still says which environment the box is pointed at', async () => {
    const app = await makeApp();

    const res = await request(app).get('/api/flights/health');

    // Without this the endpoint cannot do its job — telling PDT from
    // production after cutover is the reason it exists.
    expect(res.body.wsap).toBe('1ASIWJETJEC');
    expect(res.body.officeId).toBe('SCK1S2400');
    expect(res.body).toHaveProperty('bookingEnabled');
  });

  it('reports configured:false without disclosing what is missing', async () => {
    vi.stubEnv('AMADEUS_WS_PASSWORD', '');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).get('/api/flights/health');

    expect(res.body.configured).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  // A probe must not cost a GDS call: health checks run on a timer, and the
  // WSAP has a session ceiling.
  it('answers without calling Amadeus', async () => {
    const axios = (await import('axios')).default;
    const app = await makeApp();

    await request(app).get('/api/flights/health');

    expect(axios.post).not.toHaveBeenCalled();
  });
});
