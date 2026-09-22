import jwt from 'jsonwebtoken';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the admin panel and the agent portal show for an agent's work.
 *
 * - A booking made from an agent's payment link never carried the agent, so no
 *   agent view could find it: bookings.agent_id was set on 0 rows.
 * - The admin panel linked each sale to a customer-email search, and the
 *   bookings search only matches references.
 * - A link nobody opened after it lapsed stayed `pending`, and counted as
 *   pending revenue and pending commission on both dashboards.
 */

const AGENT = 'a1b2c3d4-0000-4000-8000-000000000001';
const DAY = 864e5;
const future = new Date(Date.now() + DAY).toISOString();
const past = new Date(Date.now() - DAY).toISOString();

const state = { links: [], bookingsByAgent: [], bookingsByLink: [], agent: null, inserts: [] };

const chainFor = (table) => {
  const filters = [];
  const c = {};
  for (const m of ['select', 'order', 'limit', 'update']) c[m] = vi.fn(() => c);
  c.eq = vi.fn((col, val) => { filters.push(['eq', col, val]); return c; });
  c.in = vi.fn((col, val) => { filters.push(['in', col, val]); return c; });
  c.insert = vi.fn((payload) => { state.inserts.push({ table, payload }); return c; });
  const rows = () => {
    if (table === 'payment_links') return state.links;
    if (table === 'bookings') {
      return filters.some(([op, col]) => op === 'in' && col === 'booking_details->>payment_link_id')
        ? state.bookingsByLink
        : state.bookingsByAgent;
    }
    return [];
  };
  c.single = vi.fn(async () => ({
    data: table === 'payment_links' ? state.links[0] : table === 'bookings' ? { id: 'b-new' } : state.agent,
    error: null,
  }));
  // getCaller reads the caller's role from `users`; the admin token's row lives here.
  const usersRow = () => (filters.some(([, col, val]) => col === 'id' && val === ADMIN.id) ? ADMIN : null);
  c.maybeSingle = vi.fn(async () => ({
    data: table === 'agents' ? state.agent : table === 'users' ? usersRow() : null,
    error: null,
  }));
  c.then = (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
  return c;
};

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    supabase: { from: vi.fn((table) => chainFor(table)) },
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
  };
});

const signed = async (claims) => {
  const { JWT_SECRET } = await import('../../backend/config/jwt.js');
  return jwt.sign(claims, JWT_SECRET, { expiresIn: '5m' });
};

const call = async (module, name, { claims, query = {}, body = {}, method = 'GET' } = {}) => {
  const handlers = await import(`../../backend/routes/payment/${module}.js`);
  const req = {
    method,
    query,
    body,
    cookies: {},
    headers: claims ? { authorization: `Bearer ${await signed(claims)}` } : {},
    get: () => undefined,
  };
  let status = 200;
  let payload = null;
  const res = {
    status(code) { status = code; return this; },
    json(value) { payload = value; return this; },
  };
  await handlers[name](req, res);
  return { status, body: payload };
};

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.com' };
const AGENT_CLAIMS = { id: AGENT, agentId: AGENT, role: 'agent', email: 'ann.agent@example.com' };

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'agent-work-test-secret-0123456789abcdefghijklmnopqrstuvwxyz');
  vi.resetModules();
  state.inserts = [];
  state.agent = {
    id: AGENT, name: 'Ann Agent', email: 'ann.agent@example.com', phone: null,
    commission_rate: 10, status: 'active', created_at: '2026-08-01T00:00:00Z', accepted_at: '2026-08-02T00:00:00Z',
  };
  state.links = [
    { id: 'L1', status: 'paid', amount: '200', expires_at: past, booking_type: 'flight', created_at: '2026-09-01T00:00:00Z' },
    { id: 'L2', status: 'pending', amount: '100', expires_at: past, booking_type: 'flight', created_at: '2026-09-02T00:00:00Z' },
    { id: 'L3', status: 'pending', amount: '50', expires_at: future, booking_type: 'flight', created_at: '2026-09-03T00:00:00Z' },
  ];
  const newer = {
    id: 'B2', booking_reference: 'PL-L3-2', travel_type: 'flight', status: 'pending', payment_status: 'unpaid',
    total_amount: 50, created_at: '2026-09-13T10:00:00Z', booking_details: { payment_link_id: 'L3' },
  };
  const older = {
    id: 'B1', booking_reference: 'PL-L1-1', travel_type: 'flight', status: 'confirmed', payment_status: 'paid',
    total_amount: 200, created_at: '2026-09-01T10:00:00Z', booking_details: { payment_link_id: 'L1' },
  };
  // B2 carries agent_id (made after the fix); B1 only the link id (before it).
  state.bookingsByAgent = [newer];
  state.bookingsByLink = [older, newer];
});

describe('linkStatusNow', () => {
  it('reads a pending link past its expiry as expired, and leaves everything else alone', async () => {
    const { linkStatusNow } = await import('../../backend/routes/payment/agents.handlers.js');
    expect(linkStatusNow({ status: 'pending', expires_at: past })).toBe('expired');
    expect(linkStatusNow({ status: 'pending', expires_at: future })).toBe('pending');
    expect(linkStatusNow({ status: 'pending' })).toBe('pending');
    expect(linkStatusNow({ status: 'paid', expires_at: past })).toBe('paid');
  });
});

describe("the admin panel's view of an agent", () => {
  const detail = (claims = ADMIN) => call('agents.handlers', 'handleAdminAgentDetail', { claims, query: { agentId: AGENT } });

  it('does not count a lapsed link as pending revenue or pending commission', async () => {
    const { status, body } = await detail();

    expect(status).toBe(200);
    expect(body.stats).toMatchObject({
      paidCount: 1, pendingCount: 1, expiredCount: 1,
      totalRevenue: 200, pendingRevenue: 50, commissionEarned: 20, commissionPending: 5,
    });
  });

  it('lists the bookings the sales produced, including ones made before bookings carried the agent', async () => {
    const { body } = await detail();

    expect(body.bookings.map((b) => b.bookingReference)).toEqual(['PL-L3-2', 'PL-L1-1']);
    expect(body.bookings[1]).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', amount: 200 });
  });

  it('links each sale to the booking it created', async () => {
    const { body } = await detail();
    const byId = Object.fromEntries(body.sales.map((s) => [s.id, s]));

    expect(byId.L1.bookingReference).toBe('PL-L1-1');
    expect(byId.L3.bookingReference).toBe('PL-L3-2');
    expect(byId.L2.bookingReference).toBeNull();
    expect(byId.L2.status).toBe('expired');
  });

  it('is refused to anyone but admin staff', async () => {
    expect((await detail(AGENT_CLAIMS)).status).toBe(403);
    expect((await detail(null)).status).toBe(403);
  });
});

describe("the agent's own dashboard", () => {
  it('shows a lapsed link as expired, not pending', async () => {
    const { status, body } = await call('agents.handlers', 'handleAgentStats', { claims: AGENT_CLAIMS });

    expect(status).toBe(200);
    expect(body.stats).toMatchObject({ paidCount: 1, pendingCount: 1, pendingRevenue: 50, commissionPending: 5 });
    expect(body.recentLinks.find((l) => l.id === 'L2').status).toBe('expired');
  });
});

describe('starting checkout from a payment link', () => {
  const start = () => call('links.handlers', 'handleProcessPaymentLink', { method: 'POST', body: { token: 'tok' } });
  const bookingInsert = () => state.inserts.find((i) => i.table === 'bookings')?.payload;

  beforeEach(() => {
    state.links = [{
      id: 'L3abcdef-1111-4111-8111-111111111111', link_token: 'tok', status: 'pending', expires_at: future,
      amount: '50', currency: 'USD', booking_type: 'flight', customer_name: 'Cam Customer',
      customer_email: 'cam@example.com', description: 'DEL-BOM', travel_details: {}, agent_id: AGENT,
    }];
    axios.post.mockReset();
    axios.post.mockResolvedValue({ data: { session: { id: 'S1' }, successIndicator: 'SI' } });
  });

  it("files the booking under the agent who made the sale", async () => {
    await start();
    expect(bookingInsert()).toMatchObject({ agent_id: AGENT });
  });

  it('files a booking from an admin-made link under no agent', async () => {
    state.links[0].agent_id = null;
    await start();
    expect(bookingInsert().agent_id).toBeNull();
  });
});
