import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A token that says role 'agent', after the person behind it was removed.
 *
 * Two kinds of app JWT carry role 'agent', both signed with JWT_SECRET:
 *  - a travel agent's, from handleAgentLogin: { id, agentId, role, email },
 *    for a row in `agents`. Removing one (handleDeleteAgent) is a soft delete:
 *    status 'disabled'. Login then refuses, but the token already issued lives
 *    JWT_EXPIRE (30 days; the jt_access cookie 7).
 *  - a visa agent's, from POST /api/auth/login: { id, role } for a `users` row
 *    with role 'agent'. Removing one (visaAgents deleteAgent) writes role
 *    'user' or deletes the row. The token still says 'agent'.
 *
 * getCaller re-read the role from `users` for every token except 'agent', and
 * getCallerInfo (payment links) re-read nothing - it returned the token's role
 * and agentId as signed. So a removed agent kept the agent portal's data and
 * could go on creating payment links that Jetsetters emails to any address, and
 * a demoted admin kept every customer's payment links. The payment links now
 * read the role and the agent's status (paymentLinksRoleFromDatabase and
 * paymentLinksRemovedAgent tests); the dashboard reads the agent's status.
 */

vi.hoisted(() => {
  process.env.JWT_SECRET = 'removed-agent-access-test-secret-0123456789abcdef';
  process.env.VISA_SUPERADMIN_EMAILS = 'owner@example.com';
});

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../../backend/services/emailService.js', () => {
  const mailer = {
    sendEmail,
    sendTravelAgentInviteEmail: vi.fn(),
    sendBookingNotificationEmails: vi.fn(),
    sendCancellationNotificationEmails: vi.fn(),
  };
  return { ...mailer, default: mailer };
});

const future = new Date(Date.now() + 10 * 864e5).toISOString();

let db;
const seed = () => {
  db = fakeBookingsTable([], {
    tables: {
      users: [
        { id: 'u-visa', email: 'visa.agent@example.com', role: 'agent' },
        { id: 'u-visa-removed', email: 'was.visa.agent@example.com', role: 'user' },
        { id: 'u-admin', email: 'admin@example.com', role: 'admin' },
        { id: 'u-demoted', email: 'was.admin@example.com', role: 'user' },
      ],
      agents: [
        { id: 'ta-active', name: 'Ann Active', email: 'ann@example.com', commission_rate: 10, status: 'active' },
        { id: 'ta-removed', name: 'Rex Removed', email: 'rex@example.com', commission_rate: 10, status: 'disabled' },
      ],
      payment_links: [
        { id: 'L-rex', link_token: 'tok-rex', agent_id: 'ta-removed', customer_name: 'Cara Client', customer_email: 'cara@example.com', amount: 400, status: 'pending', expires_at: future, created_at: '2026-09-01T00:00:00Z' },
        { id: 'L-ann', link_token: 'tok-ann', agent_id: 'ta-active', customer_name: 'Dan Doe', customer_email: 'dan@example.com', amount: 300, status: 'paid', expires_at: future, created_at: '2026-09-02T00:00:00Z' },
        { id: 'L-desk', link_token: 'tok-desk', agent_id: null, customer_name: 'Eve Early', customer_email: 'eve@example.com', customer_phone: '+15550100', amount: 900, status: 'pending', expires_at: future, created_at: '2026-09-03T00:00:00Z' },
      ],
    },
  });
};

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    get supabase() {
      return {
        from: (name) => {
          const chain = db.from(name);
          // The helper has no `.in`; the admin list uses it only to name agents.
          chain.in = (column, values) => chain.filter(column, 'in', values);
          return chain;
        },
      };
    },
  };
});

const appToken = (claims) => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '30d' });
// Exactly what each login signs.
const travelAgentToken = (row) => appToken({ id: row.id, agentId: row.id, role: 'agent', email: row.email });
const usersLoginToken = (id, role) => appToken({ id, role });

const REX = { id: 'ta-removed', email: 'rex@example.com' };
const ANN = { id: 'ta-active', email: 'ann@example.com' };

async function call(module, name, token, { method = 'GET', body = {}, query = {} } = {}) {
  const handlers = await import(`../../backend/routes/payment/${module}`);
  const res = createResponse();
  await handlers[name](createRequest({
    method, body, query, cookies: {}, headers: { authorization: `Bearer ${token}` },
  }), res);
  return res;
}

const newLink = { customerName: 'Pat Payer', customerEmail: 'pat@example.com', amount: 2500, currency: 'USD', description: 'Flight balance' };
const linkInserts = () => db.writes.filter((w) => w.table === 'payment_links' && w.insert);

beforeEach(() => {
  seed();
  sendEmail.mockClear();
});

describe('a travel agent removed by the super admin (status disabled)', () => {
  it('no longer opens the agent dashboard with the token issued before removal', async () => {
    const res = await call('agents.handlers.js', 'handleAgentStats', travelAgentToken(REX));
    expect(res.statusCode).toBe(403);
    expect(res.body?.recentLinks).toBeUndefined();
  });

  it('can no longer create a payment link that Jetsetters emails to a customer', async () => {
    const res = await call('links.handlers.js', 'handleCreatePaymentLink', travelAgentToken(REX), { method: 'POST', body: newLink });
    expect(res.statusCode).toBe(403);
    expect(linkInserts()).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('can no longer list the customers on their links', async () => {
    const res = await call('links.handlers.js', 'handleListPaymentLinks', travelAgentToken(REX));
    expect(res.statusCode).toBe(403);
    expect(res.body?.data).toBeUndefined();
  });
});

describe('a visa agent removed from /visa/admin/agents (users.role now user)', () => {
  it('can no longer create a payment link with the agent token it still holds', async () => {
    const res = await call('links.handlers.js', 'handleCreatePaymentLink', usersLoginToken('u-visa-removed', 'agent'), { method: 'POST', body: newLink });
    expect(res.statusCode).toBe(403);
    expect(linkInserts()).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('whose users row was deleted can no longer create one either', async () => {
    const res = await call('links.handlers.js', 'handleCreatePaymentLink', usersLoginToken('u-visa-gone', 'agent'), { method: 'POST', body: newLink });
    expect(res.statusCode).toBe(403);
    expect(linkInserts()).toEqual([]);
  });
});

describe('an admin demoted to a normal user (removeAdmin)', () => {
  it('can no longer list every customer payment link with the admin token it still holds', async () => {
    const res = await call('links.handlers.js', 'handleListPaymentLinks', usersLoginToken('u-demoted', 'admin'));
    expect(res.statusCode).toBe(403);
    expect(res.body?.data).toBeUndefined();
  });

  it('can no longer create a payment link', async () => {
    const res = await call('links.handlers.js', 'handleCreatePaymentLink', usersLoginToken('u-demoted', 'admin'), { method: 'POST', body: newLink });
    expect(res.statusCode).toBe(403);
    expect(linkInserts()).toEqual([]);
  });
});

// Controls: what getCaller's 'agent' exception does NOT open, and what the
// people still entitled to it keep. These pass on both commits.
describe('what a role-agent token does not open through getCaller', () => {
  const visa = () => usersLoginToken('u-visa', 'agent');

  it('a visa-agent token is not an admin, a super admin or the booking desk', async () => {
    const { getCaller, requireAdmin } = await import('../../backend/routes/payment/agents.handlers.js');
    const caller = await getCaller({ headers: { authorization: `Bearer ${visa()}` }, cookies: {} });
    expect(caller).toMatchObject({ id: 'u-visa', role: 'agent', isSuper: false });
    expect(await requireAdmin({ headers: { authorization: `Bearer ${visa()}` }, cookies: {} }, createResponse())).toBe(false);
    expect((await call('operations.handlers.js', 'handlePaymentRetrieve', visa())).statusCode).toBe(403);
    expect((await call('agents.handlers.js', 'handleListAgents', visa())).statusCode).toBe(403);
    expect((await call('agents.handlers.js', 'handleAdminAgentDetail', visa(), { query: { agentId: 'ta-active' } })).statusCode).toBe(403);
    expect((await call('agents.handlers.js', 'handleRecordPayout', visa(), { method: 'POST', body: { agentId: 'ta-active', amount: 5 } })).statusCode).toBe(403);
  });

  it('a visa-agent token finds no travel-agent dashboard, because it has no agents row', async () => {
    const res = await call('agents.handlers.js', 'handleAgentStats', visa());
    expect(res.statusCode).toBe(404);
    expect(res.body?.recentLinks).toBeUndefined();
  });

  it('a visa-agent token lists no one else\'s payment links', async () => {
    const res = await call('links.handlers.js', 'handleListPaymentLinks', visa());
    expect(res.body?.data ?? []).toEqual([]);
  });
});

describe('people still entitled keep their access', () => {
  it('an active travel agent still sees their dashboard, their own links only, and can create a link', async () => {
    const stats = await call('agents.handlers.js', 'handleAgentStats', travelAgentToken(ANN));
    expect(stats.statusCode).toBe(200);
    expect(stats.body.recentLinks.map((l) => l.id)).toEqual(['L-ann']);

    const list = await call('links.handlers.js', 'handleListPaymentLinks', travelAgentToken(ANN));
    expect(list.statusCode).toBe(200);
    expect(list.body.data.map((l) => l.id)).toEqual(['L-ann']);

    const created = await call('links.handlers.js', 'handleCreatePaymentLink', travelAgentToken(ANN), { method: 'POST', body: newLink });
    expect(created.statusCode).toBe(200);
    expect(linkInserts()[0].insert[0].agent_id).toBe('ta-active');
  });

  it('a current admin still lists every payment link', async () => {
    const res = await call('links.handlers.js', 'handleListPaymentLinks', usersLoginToken('u-admin', 'admin'));
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });
});
