import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { JWT_SECRET } from '../../backend/config/jwt.js';

/**
 * A removed travel agent loses the payment links the moment they are removed.
 *
 * handleAgentLogin signs { id, agentId, role: 'agent' } into an app JWT that
 * lives 30 days as a Bearer token and 7 as the session cookie, and lets an
 * agent in only while their `agents` row is active. Removing an agent
 * (handleDeleteAgent) sets that row 'disabled', but nothing on the payment
 * links read it again: the removed agent could still create links that email
 * customers as Jetsetters, and read their customers' links, until the token
 * expired. The same held for an agent whose row was gone. An agent-portal
 * token has no `users` row for getCaller to read, so the `agents` row is the
 * one that says whether they are still an agent.
 */

const LINKS = [
  { id: 'l1', link_token: 'TOK1', customer_name: 'Jane Doe', customer_email: 'jane@example.com', amount: 900, status: 'paid', agent_id: 'a-removed', created_at: '2026-09-01T00:00:00Z' },
  { id: 'l2', link_token: 'TOK2', customer_name: 'John Roe', customer_email: 'john@example.com', amount: 1200, status: 'paid', agent_id: 'a-active', created_at: '2026-09-02T00:00:00Z' },
];

const AGENTS = [
  { id: 'a-active', name: 'Asha Agent', email: 'asha@example.com', status: 'active' },
  { id: 'a-removed', name: 'Rui Agent', email: 'rui@example.com', status: 'disabled' },
];

let db;
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return { ...actual, get supabase() { return { from: (name) => db.from(name) }; } };
});

beforeEach(() => {
  db = fakeBookingsTable([], {
    tables: { users: [{ id: 'u-admin', email: 'admin@example.com', role: 'admin' }], payment_links: LINKS, agents: AGENTS },
  });
});

const agentToken = (id) => jwt.sign({ id, agentId: id, role: 'agent', email: `${id}@example.com` }, JWT_SECRET, { expiresIn: '30d' });
const bearer = (token) => ({ authorization: `Bearer ${token}` });

async function listLinks(headers) {
  const { handleListPaymentLinks } = await import('../../backend/routes/payment/links.handlers.js');
  const res = createResponse();
  await handleListPaymentLinks(createRequest({ method: 'GET', query: {}, headers }), res);
  return res;
}

async function createLink(headers) {
  const { handleCreatePaymentLink } = await import('../../backend/routes/payment/links.handlers.js');
  const res = createResponse();
  await handleCreatePaymentLink(createRequest({
    method: 'POST',
    headers,
    body: { customerName: 'Sam Lee', customerEmail: 'sam@example.com', amount: 500 },
  }), res);
  return res;
}

const linksInserted = () => db.writes.filter((w) => w.table === 'payment_links' && w.insert);
const emailsSent = async () => {
  const { sendEmail } = await import('../../backend/services/emailService.js');
  return sendEmail.mock.calls.length;
};

describe('an agent whose token outlived them', () => {
  it.each([
    ['removed (row disabled)', 'a-removed'],
    ['whose row is gone', 'a-gone'],
  ])('%s cannot create a link or email a customer', async (_who, id) => {
    const res = await createLink(bearer(agentToken(id)));

    expect(res.statusCode).toBe(403);
    expect(linksInserted()).toEqual([]);
    expect(await emailsSent()).toBe(0);
  });

  it('removed, cannot read their customers\' links', async () => {
    const res = await listLinks(bearer(agentToken('a-removed')));

    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/Jane Doe|jane@example\.com|TOK1/);
  });
});

describe('an active agent and the admin are unchanged', () => {
  it('an active agent lists their own links', async () => {
    const res = await listLinks(bearer(agentToken('a-active')));

    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((l) => l.id)).toEqual(['l2']);
  });

  it('an active agent creates a link filed under them', async () => {
    const res = await createLink(bearer(agentToken('a-active')));

    expect(res.statusCode).toBe(200);
    expect(linksInserted()[0].insert[0].agent_id).toBe('a-active');
    expect(await emailsSent()).toBe(1);
  });

  it('an admin still creates a house link', async () => {
    const res = await createLink(bearer(jwt.sign({ id: 'u-admin', role: 'admin' }, JWT_SECRET)));

    expect(res.statusCode).toBe(200);
    expect(linksInserted()[0].insert[0].agent_id).toBeNull();
  });
});
