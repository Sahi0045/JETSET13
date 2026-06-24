import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { notFoundHandler, errorHandler } from '../../backend/middleware/errorHandler.js';
import { apiLimiter, securityHeaders, buildCorsOptions } from '../../backend/middleware/security.js';
import { validate } from '../../backend/middleware/validate.js';
import { validateEnv } from '../../backend/config/validateEnv.js';
import { reportError } from '../../backend/services/monitoring.js';

function makeApp(routes) {
  const app = express();
  app.use(express.json());
  routes(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler middleware', () => {
  it('returns a structured 500 for thrown errors and hides stack in prod', async () => {
    const app = makeApp((a) => a.get('/api/boom', () => { throw new Error('kaboom'); }));
    const res = await request(app).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('kaboom');
    expect(res.body.stack).toBeUndefined();
  });

  it('honors err.status', async () => {
    const app = makeApp((a) => a.get('/api/teapot', () => {
      const e = new Error('no coffee'); e.status = 418; throw e;
    }));
    const res = await request(app).get('/api/teapot');
    expect(res.status).toBe(418);
  });

  it('does not throw when err.message is undefined', async () => {
    const app = makeApp((a) => a.get('/api/weird', (req, res, next) => next({})));
    const res = await request(app).get('/api/weird');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with method + path', async () => {
    const app = makeApp(() => {});
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, method: 'GET', path: '/api/nope' });
  });
});

describe('validate middleware', () => {
  const schema = z.object({ from: z.string().min(1), to: z.string().min(1) }).passthrough();

  it('rejects invalid bodies with 400 + field errors', async () => {
    const app = makeApp((a) => a.post('/api/s', validate({ body: schema }), (req, res) => res.json({ ok: true })));
    const res = await request(app).post('/api/s').send({ from: 'JFK' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.path)).toContain('to');
  });

  it('passes valid bodies through and preserves extra fields', async () => {
    const app = makeApp((a) => a.post('/api/s', validate({ body: schema }), (req, res) => res.json(req.body)));
    const res = await request(app).post('/api/s').send({ from: 'JFK', to: 'LAX', adults: 2 });
    expect(res.status).toBe(200);
    expect(res.body.adults).toBe(2);
  });
});

describe('rate limiter', () => {
  it('returns 429 past the limit and skips /api/health', async () => {
    process.env.RATE_LIMIT_MAX = '2';
    // reset module cache so a fresh limiter reads the new env value
    vi.resetModules();
    const { apiLimiter: freshLimiter } = await import('../../backend/middleware/security.js');
    const app = express();
    app.use(freshLimiter);
    app.get('/api/x', (req, res) => res.json({ ok: true }));
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await request(app).get('/api/x')).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    const health = (await request(app).get('/api/health')).status;
    expect(health).toBe(200);
  });
});

describe('CORS allowlist', () => {
  it('builds an allowlist (never a credentialed "*")', () => {
    const opts = buildCorsOptions();
    expect(opts.credentials).toBe(true);
    expect(opts.origin).not.toBe('*');
  });
});

describe('validateEnv', () => {
  it('reports missing required vars without exiting when exitOnError is false', () => {
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    const res = validateEnv({ exitOnError: false });
    expect(res.ok).toBe(false);
    expect(res.missingRequired.length).toBeGreaterThan(0);
    if (saved.url) process.env.SUPABASE_URL = saved.url;
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  });
});

describe('reportError', () => {
  it('never throws when no provider is configured', () => {
    expect(() => reportError(new Error('x'), { a: 1 })).not.toThrow();
  });
});
