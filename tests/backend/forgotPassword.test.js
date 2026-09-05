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

const VERIFY_URL = 'https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=https%3A%2F%2Fwww.jetsetterss.com%2Freset-password';
const HASHED_TOKEN = 'pkce_9f3adc0be1e4c5a7b2d8';

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
    data: { properties: { action_link: VERIFY_URL, hashed_token: HASHED_TOKEN } },
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

    // The link in the email must be OUR page carrying the token, never
    // Supabase's verify URL - see the prefetch test below.
    const [, link] = emailService.sendPasswordResetEmail.mock.calls[0];
    expect(link).toContain('/reset-password');
    expect(link).toContain(`token_hash=${HASHED_TOKEN}`);
  });

  it('never emails the Supabase verify URL directly', async () => {
    // This is the bug that made the fix look broken in production. Supabase's
    // verify URL is a single-use GET: fetching it consumes the token. Gmail
    // scans links in incoming mail, so it burned the token 12 seconds after
    // the email was sent, and the customer's click got
    // `error_code=otp_expired`. Evidence: `recovery_sent_at` 12:38:46,
    // `last_sign_in_at` 12:38:58, on a link nobody had clicked.
    //
    // Our own page is inert HTML - a scanner fetching it consumes nothing,
    // because the token is only redeemed by `verifyOtp` from the page's
    // JavaScript, which a scanner does not run.
    const emailService = await import('../../backend/services/emailService.js');

    await post({ email: 'traveller@example.com' });

    const [, link] = emailService.sendPasswordResetEmail.mock.calls[0];
    expect(link).not.toContain('/auth/v1/verify');
    expect(link).not.toContain('supabase.co');
    expect(link.startsWith('http')).toBe(true);
  });

  it('does not put the email address in the link', async () => {
    // It adds nothing - the token identifies the account - and a query string
    // is the one part of a URL that reliably ends up in logs and referrers.
    const emailService = await import('../../backend/services/emailService.js');

    await post({ email: 'traveller@example.com' });

    const [, link] = emailService.sendPasswordResetEmail.mock.calls[0];
    expect(link).not.toContain('traveller%40example.com');
    expect(link).not.toContain('traveller@example.com');
  });

  it('fails loudly if Supabase returns no hashed_token', async () => {
    // Without it there is nothing for the reset page to redeem, and an email
    // carrying a dead link is worse than an error.
    supabaseMock.auth.admin.generateLink.mockResolvedValue({
      data: { properties: { action_link: VERIFY_URL } },
      error: null,
    });
    const emailService = await import('../../backend/services/emailService.js');

    const res = await post({ email: 'traveller@example.com' });

    expect(res.status).toBe(500);
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
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
