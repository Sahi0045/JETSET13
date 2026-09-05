import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';

/**
 * Password recovery.
 *
 * This was non-functional in production, in three independent ways, any one of
 * which was fatal:
 *
 *  1. `forgotPassword` inserted a token into `public.password_resets`, a table
 *     that does not exist in the database and is not created by any migration
 *     in this repo. The insert failed, so the route answered 500 and no email
 *     was ever sent.
 *
 *  2. Even with that table created, it would still not have worked. The login
 *     form authenticates through `supabase.auth.signInWithPassword`, so the
 *     password it checks lives in Supabase Auth (`auth.users`). The reset
 *     wrote a bcrypt hash to `public.users.password` — a second, parallel
 *     store that nothing reads. 25 of the 26 Supabase Auth accounts have a row
 *     in that table, so the reset would have reported success and changed
 *     nothing the user could log in with.
 *
 *  3. On success the page navigated to `/admin/login`, sending a customer to
 *     the staff sign-in screen.
 *
 * The fix routes recovery through Supabase Auth itself — the same system that
 * verifies the password at sign-in — while keeping our own branded email. So
 * the behaviour worth pinning is: mint a real recovery link, send it, never
 * touch `password_resets`, and never disclose whether an account exists.
 */

const RECOVERY_LINK = 'https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=https%3A%2F%2Fwww.jetsetterss.com%2Freset-password';

const makeApp = async () => {
  const routes = (await import('../../backend/routes/auth.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', routes);
  return app;
};

const post = async (body) => request(await makeApp()).post('/api/auth/forgot-password').send(body);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.admin.generateLink.mockResolvedValue({
    data: { properties: { action_link: RECOVERY_LINK } },
    error: null,
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('rejects a request with no email', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('mints a Supabase recovery link and emails it', async () => {
    const emailService = await import('../../backend/services/emailService.js');

    const res = await post({ email: 'traveller@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Recovery has to be minted by the auth system that owns the password.
    expect(supabaseMock.auth.admin.generateLink).toHaveBeenCalledTimes(1);
    const [args] = supabaseMock.auth.admin.generateLink.mock.calls[0];
    expect(args.type).toBe('recovery');
    expect(args.email).toBe('traveller@example.com');
    // Without redirectTo, Supabase sends the user to SITE_URL and the reset
    // page never sees the recovery token.
    expect(args.options.redirectTo).toMatch(/\/reset-password$/);

    // And the link that goes in the email is the one Supabase minted, not a
    // token of our own invention.
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'traveller@example.com',
      RECOVERY_LINK,
    );
  });

  it('never writes to password_resets', async () => {
    await post({ email: 'traveller@example.com' });

    // The table does not exist. Any code path that reaches for it is the old
    // broken flow coming back.
    const tables = supabaseMock.from.mock.calls.map(([t]) => t);
    expect(tables).not.toContain('password_resets');
  });

  it('does not disclose whether an account exists', async () => {
    const emailService = await import('../../backend/services/emailService.js');
    supabaseMock.auth.admin.generateLink.mockResolvedValue({
      data: null,
      error: { status: 404, message: 'User with this email not found' },
    });

    const res = await post({ email: 'nobody@example.com' });

    // Same status and same message as the success case: an attacker must not
    // be able to enumerate customers through this endpoint.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('answers identically for a known and an unknown address', async () => {
    const known = await post({ email: 'traveller@example.com' });

    supabaseMock.auth.admin.generateLink.mockResolvedValue({
      data: null, error: { status: 404, message: 'User with this email not found' },
    });
    const unknown = await post({ email: 'nobody@example.com' });

    expect(unknown.body).toEqual(known.body);
  });

  it('reports a real failure rather than claiming an email was sent', async () => {
    // A 404 is "no such user" and must be hidden. A 500 from the auth service
    // is our problem, and telling the customer to check their inbox for an
    // email that will never arrive is worse than an honest error.
    supabaseMock.auth.admin.generateLink.mockResolvedValue({
      data: null, error: { status: 500, message: 'Internal error' },
    });

    const res = await post({ email: 'traveller@example.com' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBeFalsy();
  });

  it('still answers 200 when the account exists but the email fails to send', async () => {
    // Resend being down does not mean the account does not exist, and a 500
    // here would leak that difference. Log it; do not change the answer.
    const emailService = await import('../../backend/services/emailService.js');
    emailService.sendPasswordResetEmail.mockRejectedValueOnce(new Error('Resend unavailable'));

    const res = await post({ email: 'traveller@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('normalises the address so casing and padding cannot defeat recovery', async () => {
    await post({ email: '  Traveller@Example.COM ' });

    const [args] = supabaseMock.auth.admin.generateLink.mock.calls[0];
    expect(args.email).toBe('traveller@example.com');
  });
});

describe('POST /api/auth/reset-password', () => {
  it('is gone — the password is set through Supabase Auth on the reset page', async () => {
    // Keeping it would mean keeping a handler that writes a bcrypt hash into
    // `public.users.password`, reports success, and changes nothing the login
    // form reads. An absent route is more honest than that.
    const res = await request(await makeApp())
      .post('/api/auth/reset-password')
      .send({ email: 'a@b.com', token: 'x', newPassword: 'whatever12' });

    expect(res.status).toBe(404);
  });
});
