import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { JWT_SECRET } from '../../backend/config/jwt.js';

/**
 * A demoted admin loses the payment links the moment they are demoted.
 *
 * Staff sign in through /api/auth/login, which signs { id, role } into an app
 * JWT that lives 30 days as a Bearer token and 7 as the session cookie.
 * Demoting an admin (DELETE /api/auth/admins/:id) writes role 'user' to their
 * row. getCaller already reads that row, but ?action=list-payment-links and
 * ?action=create-payment-link gate on getCallerInfo, which returned the role
 * straight from the token - so the ex-admin still read every customer's
 * payment link (name, email, phone, amount, the PNR in travel_details, the
 * link token) and could create links that email customers as Jetsetters.
 *
 * getCallerInfo now takes its role from getCaller. getCaller trusts 'agent'
 * from the token without reading `users`, because agent-portal tokens have no
 * `users` row; the payment links count 'agent' only for a token that carries
 * the agentId a link is filed under. A visa agent's token also says 'agent'
 * but has none - it used to create links filed under nobody, and kept doing so
 * after the visa agent was disabled.
 */

const USERS = [
  { id: 'u-demoted', email: 'was-admin@example.com', role: 'user' },
  { id: 'u-demoted-super', email: 'was-super@example.com', role: 'user' },
  { id: 'u-admin', email: 'admin@example.com', role: 'admin' },
  { id: 'u-super', email: 'super@example.com', role: 'superadmin' },
  { id: 'u-customer', email: 'customer@example.com', role: 'user' },
  { id: 'u-visa-agent', email: 'visa@example.com', role: 'agent' },
  { id: 'u-visa-disabled', email: 'visa-off@example.com', role: 'user' },
];

const LINKS = [
  { id: 'l1', link_token: 'TOK1', customer_name: 'Jane Doe', customer_email: 'jane@example.com', customer_phone: '+1 555 0100', amount: 900, status: 'paid', agent_id: null, travel_details: { pnr: 'ABC123' }, created_at: '2026-09-01T00:00:00Z' },
  { id: 'l2', link_token: 'TOK2', customer_name: 'John Roe', customer_email: 'john@example.com', customer_phone: '+1 555 0199', amount: 1200, status: 'paid', agent_id: 'a-1', created_at: '2026-09-02T00:00:00Z' },
  { id: 'l3', link_token: 'TOK3', customer_name: 'Mia Poe', customer_email: 'mia@example.com', amount: 300, status: 'paid', agent_id: 'a-2', created_at: '2026-09-03T00:00:00Z' },
];

const AGENTS = [
  { id: 'a-1', name: 'Asha Agent', email: 'asha@example.com', status: 'active' },
  { id: 'a-2', name: 'Ben Agent', email: 'ben@example.com', status: 'active' },
];

// The admin list names each link's agent with `.in('id', [...])`, which the
// shared double does not have; it is the same filter as an `or` of `eq`s.
const withIn = (query) => Object.assign(query, {
  in: (column, values) => query.or(values.map((value) => `${column}.eq.${value}`).join(',')),
});

let db;
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return { ...actual, get supabase() { return { from: (name) => withIn(db.from(name)) }; } };
});

beforeEach(() => {
  db = fakeBookingsTable([], { tables: { users: USERS, payment_links: LINKS, agents: AGENTS } });
});

const appToken = (claims) => jwt.sign(claims, JWT_SECRET, { expiresIn: '30d' });
const bearer = (token) => ({ authorization: `Bearer ${token}` });
const agentToken = (id) => appToken({ id, agentId: id, role: 'agent', email: `${id}@example.com` });

async function listLinks(headers, { query = {}, cookies } = {}) {
  const { handleListPaymentLinks } = await import('../../backend/routes/payment/links.handlers.js');
  const res = createResponse();
  await handleListPaymentLinks(createRequest({ method: 'GET', query, headers, cookies }), res);
  return res;
}

async function createLink(headers, { cookies } = {}) {
  const { handleCreatePaymentLink } = await import('../../backend/routes/payment/links.handlers.js');
  const res = createResponse();
  await handleCreatePaymentLink(createRequest({
    method: 'POST',
    headers,
    cookies,
    body: { customerName: 'Sam Lee', customerEmail: 'sam@example.com', amount: 500, travelDetails: { pnr: 'XYZ789' } },
  }), res);
  return res;
}

const linksInserted = () => db.writes.filter((w) => w.table === 'payment_links' && w.insert);
const emailsSent = async () => {
  const { sendEmail } = await import('../../backend/services/emailService.js');
  return sendEmail.mock.calls.length;
};

describe('a demoted admin (their row says user, their token still says admin)', () => {
  it.each([
    ['admin', 'u-demoted'],
    ['superadmin', 'u-demoted-super'],
  ])('with a token saying %s cannot list the payment links', async (role, id) => {
    const res = await listLinks(bearer(appToken({ id, role })));

    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/Jane Doe|jane@example\.com|ABC123|TOK1/);
  });

  it('cannot list them from the session cookie either', async () => {
    const res = await listLinks({}, { cookies: { jt_access: appToken({ id: 'u-demoted', role: 'admin' }) } });
    expect(res.statusCode).toBe(403);
  });

  it('cannot create a link or email a customer', async () => {
    const res = await createLink(bearer(appToken({ id: 'u-demoted', role: 'admin' })));

    expect(res.statusCode).toBe(403);
    expect(linksInserted()).toEqual([]);
    expect(await emailsSent()).toBe(0);
  });

  it('whose row was deleted gets nothing either', async () => {
    const token = appToken({ id: 'u-gone', role: 'admin' });
    expect((await listLinks(bearer(token))).statusCode).toBe(403);
    expect((await createLink(bearer(token))).statusCode).toBe(403);
  });
});

describe('a token that says agent but is not an agent-portal token', () => {
  it.each([
    ['a visa agent', 'u-visa-agent'],
    ['a disabled visa agent', 'u-visa-disabled'],
  ])('%s cannot create a link filed under nobody', async (_who, id) => {
    const res = await createLink(bearer(appToken({ id, role: 'agent' })));

    expect(res.statusCode).toBe(403);
    expect(linksInserted()).toEqual([]);
    expect(await emailsSent()).toBe(0);
  });

  it('a visa agent cannot list the links', async () => {
    const res = await listLinks(bearer(appToken({ id: 'u-visa-agent', role: 'agent' })));
    expect(res.statusCode).toBe(403);
  });
});

describe('current staff, agents and customers are unchanged', () => {
  it.each([
    ['admin', 'u-admin'],
    ['superadmin', 'u-super'],
  ])('a current %s lists every link, with agent names', async (role, id) => {
    const res = await listLinks(bearer(appToken({ id, role })));

    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((l) => l.id).sort()).toEqual(['l1', 'l2', 'l3']);
    expect(res.body.data.find((l) => l.id === 'l2').agent_name).toBe('Asha Agent');
  });

  it('a current admin can still narrow the list to one agent', async () => {
    const res = await listLinks(bearer(appToken({ id: 'u-admin', role: 'admin' })), { query: { agentId: 'a-2' } });
    expect(res.body.data.map((l) => l.id)).toEqual(['l3']);
  });

  it('a current admin on the session cookie still lists them', async () => {
    const res = await listLinks({}, { cookies: { jt_access: appToken({ id: 'u-admin', role: 'admin' }) } });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ['admin', 'u-admin'],
    ['superadmin', 'u-super'],
  ])('a current %s creates a house link and the customer is emailed', async (role, id) => {
    const res = await createLink(bearer(appToken({ id, role })));

    expect(res.statusCode).toBe(200);
    expect(linksInserted()).toHaveLength(1);
    expect(linksInserted()[0].insert[0].agent_id).toBeNull();
    expect(await emailsSent()).toBe(1);
  });

  it('an agent-portal agent lists only their own links, whatever agentId they ask for', async () => {
    const own = await listLinks(bearer(agentToken('a-1')));
    const widened = await listLinks(bearer(agentToken('a-1')), { query: { agentId: 'a-2' } });

    expect(own.statusCode).toBe(200);
    expect(own.body.data.map((l) => l.id)).toEqual(['l2']);
    expect(widened.body.data.map((l) => l.id)).toEqual(['l2']);
  });

  it('an agent-portal agent creates a link filed under them', async () => {
    const res = await createLink({}, { cookies: { jt_access: agentToken('a-1') } });

    expect(res.statusCode).toBe(200);
    expect(linksInserted()[0].insert[0].agent_id).toBe('a-1');
  });

  it('a customer is refused both', async () => {
    const token = appToken({ id: 'u-customer', role: 'user' });
    expect((await listLinks(bearer(token))).statusCode).toBe(403);
    expect((await createLink(bearer(token))).statusCode).toBe(403);
    expect(linksInserted()).toEqual([]);
  });

  it('no token is refused both', async () => {
    expect((await listLinks({})).statusCode).toBe(403);
    expect((await createLink({})).statusCode).toBe(403);
  });
});
