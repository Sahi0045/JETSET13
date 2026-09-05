import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A security email that arrives on every page load is worse than no email.
 *
 * The login notification used to be guarded only in the browser, by two
 * sessionStorage flags. Both leaked:
 *
 *   - sessionStorage is per-tab, so a second tab was a "new login"
 *   - the "this is a page refresh, not a sign-in" flag was cleared as soon as
 *     `setSession()` resolved, while the SIGNED_IN event it triggers arrives
 *     later — so on an ordinary page load the flag was usually already gone
 *
 * The result was a security alert on essentially every visit, which teaches
 * people to ignore the one that matters. The dedupe now lives on the server,
 * where a new tab, cleared storage or a second device cannot defeat it.
 */

const makeApp = async () => {
  const routes = (await import('../../backend/routes/email.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/email', routes);
  return app;
};

const loginBody = {
  type: 'login_notification',
  to: 'traveller@example.com',
  data: {
    customerName: 'Jane Doe',
    email: 'traveller@example.com',
    loginTime: 'Sep 5, 2026, 4:30 PM',
    deviceInfo: 'Desktop - Google Sign-In',
  },
};

beforeEach(() => {
  vi.resetModules();
});

describe('login notification dedupe', () => {
  it('sends the first time', async () => {
    const cache = await import('../../backend/services/cache.service.js');
    cache.get.mockResolvedValue(null);
    const emailService = (await import('../../backend/services/emailService.js')).default;

    const res = await request(await makeApp()).post('/api/email/send').send(loginBody);

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBeUndefined();
    expect(emailService.sendEmail).toHaveBeenCalled();
  });

  it('suppresses a repeat within the window without sending', async () => {
    const cache = await import('../../backend/services/cache.service.js');
    cache.get.mockResolvedValue({ at: new Date().toISOString() });
    const emailService = (await import('../../backend/services/emailService.js')).default;
    emailService.sendEmail.mockClear();

    const res = await request(await makeApp()).post('/api/email/send').send(loginBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.skipped).toBe(true);
    // The point of the whole change: no second email.
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('records the send so the next request is deduped', async () => {
    const cache = await import('../../backend/services/cache.service.js');
    cache.get.mockResolvedValue(null);
    cache.set.mockClear();

    await request(await makeApp()).post('/api/email/send').send(loginBody);

    expect(cache.set).toHaveBeenCalled();
    const [key, , ttl] = cache.set.mock.calls.at(-1);
    // Keyed on the recipient, not on a client-supplied id, so a second device
    // cannot present itself as a different subject.
    expect(key).toContain('traveller@example.com');
    expect(ttl).toBeGreaterThan(60 * 60);
  });

  it('keys case-insensitively, so a differently-cased address is the same person', async () => {
    const cache = await import('../../backend/services/cache.service.js');
    cache.get.mockResolvedValue(null);
    cache.set.mockClear();

    await request(await makeApp()).post('/api/email/send')
      .send({ ...loginBody, to: 'TRAVELLER@Example.com' });

    const [key] = cache.set.mock.calls.at(-1);
    expect(key).toBe('login-email:traveller@example.com');
  });
});
