import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { JWT_SECRET } from '../../backend/config/jwt.js';

/**
 * A removed support account loses the payment desk the moment it is removed.
 *
 * Staff sign in through /api/auth/login, which signs { id, role } into an app
 * JWT that lives JWT_EXPIRE (30 days by default). Revoking an account
 * (POST /api/staff/:id/revoke) writes role 'user' to its row, but getCaller
 * only read the row when the token carried no role, so the old token's
 * 'support' or 'admin' kept refunds, voids and payment reads until it expired.
 * `protect` re-reads the role on every request; getCaller now does the same,
 * and a token whose row is gone gets no staff role at all.
 */

vi.hoisted(() => { process.env.VISA_SUPERADMIN_EMAILS = 'owner@example.com'; });

const SUPABASE_TEST_SECRET = 'supabase-test-secret';

vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    verifySupabaseToken: async (token) => {
      try { return jwt.verify(token, SUPABASE_TEST_SECRET); } catch { return null; }
    },
  };
});

const db = fakeBookingsTable([], {
  tables: {
    users: [
      { id: 'u-revoked', email: 'desk@example.com', role: 'user' },
      { id: 'u-support', email: 'support@example.com', role: 'support' },
      { id: 'u-admin', email: 'admin@example.com', role: 'admin' },
      { id: 'u-demoted', email: 'was-admin@example.com', role: 'user' },
      { id: 'u-owner', email: 'owner@example.com', role: 'admin' },
      { id: 'u-customer', email: 'customer@example.com', role: 'user' },
      { id: 'sb-admin', email: 'cookie-admin@example.com', role: 'admin' },
    ],
  },
});
const tablesRead = [];

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    get supabase() {
      return { from: (name, ...rest) => { tablesRead.push(name); return db.from(name, ...rest); } };
    },
  };
});

const appToken = (claims) => jwt.sign(claims, JWT_SECRET, { expiresIn: '30d' });
const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` }, cookies: {} });

async function callerFor(token) {
  const { getCaller } = await import('../../backend/routes/payment/agents.handlers.js');
  return getCaller(bearer(token));
}

// No paymentId: past the gate the handler answers 400, at the gate 403.
async function retrieveStatus(token) {
  const { handlePaymentRetrieve } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handlePaymentRetrieve(createRequest({
    method: 'GET', query: {}, headers: { authorization: `Bearer ${token}` },
  }), res);
  return res.statusCode;
}

async function adminGatePasses(token) {
  const { requireAdmin } = await import('../../backend/routes/payment/agents.handlers.js');
  return requireAdmin(bearer(token), createResponse());
}

describe('a revoked support account', () => {
  const revokedToken = appToken({ id: 'u-revoked', role: 'support' });

  it('is resolved with the role the database gives it now', async () => {
    const caller = await callerFor(revokedToken);
    expect(caller.role).toBe('user');
  });

  it('is refused by the staff-only payment handlers', async () => {
    expect(await retrieveStatus(revokedToken)).toBe(403);
  });
});

describe('the role a token claims never outranks its row', () => {
  it('a demoted admin no longer passes the admin gate', async () => {
    const token = appToken({ id: 'u-demoted', role: 'admin' });
    expect(await adminGatePasses(token)).toBe(false);
    expect((await callerFor(token)).isSuper).toBe(false);
  });

  it('a customer claiming admin is still a customer', async () => {
    const caller = await callerFor(appToken({ id: 'u-customer', role: 'admin' }));
    expect(caller.role).toBe('user');
    expect(caller.isSuper).toBe(false);
  });

  it('a token whose row was deleted gets no staff role', async () => {
    const token = appToken({ id: 'u-gone', role: 'support' });
    const caller = await callerFor(token);
    expect(caller.id).toBe('u-gone');
    expect(caller.role).toBeNull();
    expect(await retrieveStatus(token)).toBe(403);
    expect(await adminGatePasses(appToken({ id: 'u-gone', role: 'superadmin' }))).toBe(false);
  });
});

describe('current staff and customers are unchanged', () => {
  it('a current support account still reaches the payment desk', async () => {
    expect(await retrieveStatus(appToken({ id: 'u-support', role: 'support' }))).toBe(400);
  });

  it('a current admin still passes the admin gate', async () => {
    expect(await adminGatePasses(appToken({ id: 'u-admin', role: 'admin' }))).toBe(true);
  });

  it('the super admin is still the super admin', async () => {
    const caller = await callerFor(appToken({ id: 'u-owner', role: 'admin' }));
    expect(caller).toMatchObject({ role: 'admin', email: 'owner@example.com', isSuper: true });
  });

  it('a Supabase session token resolves its role from the row', async () => {
    const token = jwt.sign(
      { sub: 'sb-admin', email: 'cookie-admin@example.com', role: 'authenticated' },
      SUPABASE_TEST_SECRET,
    );
    const caller = await callerFor(token);
    expect(caller).toMatchObject({ id: 'sb-admin', role: 'admin', email: 'cookie-admin@example.com' });
  });

  it('an ordinary customer is an ordinary customer', async () => {
    const caller = await callerFor(appToken({ id: 'u-customer', role: 'user' }));
    expect(caller).toMatchObject({ id: 'u-customer', role: 'user', email: 'customer@example.com', isSuper: false });
  });

  it('an agent-portal token keeps its role and does not read users', async () => {
    tablesRead.length = 0;
    const caller = await callerFor(appToken({ id: 'a-1', agentId: 'a-1', role: 'agent', email: 'agent@example.com' }));
    expect(caller).toMatchObject({ id: 'a-1', role: 'agent', email: 'agent@example.com', isSuper: false });
    expect(tablesRead).not.toContain('users');
  });
});
