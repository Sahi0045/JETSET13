import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Inviting a support person, the way travel agents are invited.
 *
 * The first support accounts were made by a script that set a password the
 * owner had chosen - which then had to be sent to the person somehow. This is
 * the agents' path instead: invite an address, they open a link, they choose
 * their own password, and the account activates.
 */

const ROLE = { value: 'admin' };
const sent = [];

vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'owner-1', email: 'owner@jetsetterss.com', role: ROLE.value }; next(); },
  };
});

vi.mock('../../backend/services/emailService.js', () => ({
  sendStaffInviteEmail: vi.fn(async (email, name, link) => { sent.push({ email, name, link }); return { success: true }; }),
}));

/** The users table, as much of it as these routes touch. */
const fakeUsers = (rows) => {
  const state = rows.map((row) => ({ ...row }));
  const find = (filters) => state.find((row) => filters.every(([column, value]) => row[column] === value));
  const build = () => {
    const filters = [];
    const chain = {
      select: () => chain,
      eq: (column, value) => { filters.push([column, value]); return chain; },
      order: () => chain,
      maybeSingle: async () => ({ data: find(filters) ?? null, error: null }),
      single: async () => ({ data: find(filters) ?? null, error: null }),
      then: (resolve) => resolve({ data: state.filter((row) => filters.every(([c, v]) => row[c] === v)), error: null }),
      update: (patch) => ({
        eq: async (column, value) => {
          const row = state.find((r) => r[column] === value);
          if (row) Object.assign(row, patch);
          return { data: row ? [row] : [], error: null };
        },
      }),
      insert: async (records) => { state.push(...records.map((r) => ({ id: `new-${state.length + 1}`, ...r }))); return { data: records, error: null }; },
    };
    return chain;
  };
  return { from: vi.fn(build), rows: state, byEmail: (email) => state.find((row) => row.email === email) };
};

const appWith = async (users) => {
  const table = fakeUsers(users);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/staff.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/staff', routes);
  return { app, table };
};

beforeEach(() => {
  ROLE.value = 'admin';
  sent.length = 0;
  vi.resetModules();
});

describe('inviting', () => {
  it('creates the account, emails a link, and leaves no usable password', async () => {
    const { app, table } = await appWith([]);

    const res = await request(app).post('/api/staff/invite').send({ email: 'Desk@Jetsetterss.com', firstName: 'Asha' });

    expect(res.status).toBe(200);
    expect(res.body.emailed).toBe(true);
    const person = table.byEmail('desk@jetsetterss.com');
    expect(person.role).toBe('support');
    expect(person.invite_token_hash).toHaveLength(64);
    expect(person.invite_accepted_at).toBeNull();
    // The link is the only copy of the token, and the row keeps the hash.
    const token = new URL(sent[0].link).searchParams.get('token');
    expect(crypto.createHash('sha256').update(token).digest('hex')).toBe(person.invite_token_hash);
    expect(sent[0].link).toContain('/desk/set-password?token=');
    // Nothing anyone can sign in with yet.
    expect(person.password).not.toBe(token);
  });

  it('is the owner\'s to send, not a support person\'s', async () => {
    ROLE.value = 'support';
    const { app } = await appWith([]);
    expect((await request(app).post('/api/staff/invite').send({ email: 'x@y.com' })).status).toBe(403);
  });

  it('asks for an email address', async () => {
    const { app } = await appWith([]);
    const res = await request(app).post('/api/staff/invite').send({ email: 'not-an-address' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_REQUIRED');
  });
});

describe('the link', () => {
  const invited = (over = {}) => ({
    id: 'u-1',
    email: 'desk@jetsetterss.com',
    name: 'Asha',
    role: 'support',
    password: 'unusable',
    invite_token_hash: crypto.createHash('sha256').update('tok-1').digest('hex'),
    invite_expires_at: new Date(Date.now() + 3600000).toISOString(),
    invite_accepted_at: null,
    ...over,
  });

  it('says who it is for, and nothing else', async () => {
    const { app } = await appWith([invited()]);
    const res = await request(app).get('/api/staff/invite?token=tok-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'desk@jetsetterss.com', name: 'Asha' });
    expect(JSON.stringify(res.body)).not.toContain('unusable');
  });

  it('sets the password once, then never again', async () => {
    const { app, table } = await appWith([invited()]);

    const first = await request(app).post('/api/staff/accept-invite').send({ token: 'tok-1', password: 'a-good-password' });
    expect(first.status).toBe(200);
    const person = table.byEmail('desk@jetsetterss.com');
    expect(person.invite_token_hash).toBeNull();
    expect(person.invite_accepted_at).toBeTruthy();
    expect(person.password).not.toBe('a-good-password');

    const second = await request(app).post('/api/staff/accept-invite').send({ token: 'tok-1', password: 'another-password' });
    expect(second.status).toBe(404);
  });

  it('refuses a short password, an expired link and one already used', async () => {
    const { app } = await appWith([
      invited(),
      invited({ id: 'u-2', email: 'old@jetsetterss.com', invite_token_hash: crypto.createHash('sha256').update('tok-old').digest('hex'), invite_expires_at: new Date(Date.now() - 1000).toISOString() }),
      invited({ id: 'u-3', email: 'done@jetsetterss.com', invite_token_hash: crypto.createHash('sha256').update('tok-done').digest('hex'), invite_accepted_at: new Date().toISOString() }),
    ]);

    expect((await request(app).post('/api/staff/accept-invite').send({ token: 'tok-1', password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/staff/accept-invite').send({ token: 'tok-old', password: 'a-good-password' })).status).toBe(410);
    expect((await request(app).post('/api/staff/accept-invite').send({ token: 'tok-done', password: 'a-good-password' })).status).toBe(410);
    expect((await request(app).get('/api/staff/invite?token=nonsense')).status).toBe(404);
  });
});

describe('taking the desk away', () => {
  it('puts the account back to an ordinary one', async () => {
    const { app, table } = await appWith([{ id: 'u-1', email: 'desk@jetsetterss.com', role: 'support', invite_token_hash: 'abc' }]);

    const res = await request(app).post('/api/staff/u-1/revoke').send({});

    expect(res.status).toBe(200);
    expect(table.byEmail('desk@jetsetterss.com').role).toBe('user');
    expect(table.byEmail('desk@jetsetterss.com').invite_token_hash).toBeNull();
  });

  it('refuses an account that is not a support account', async () => {
    const { app } = await appWith([{ id: 'u-9', email: 'someone@example.com', role: 'admin' }]);
    const res = await request(app).post('/api/staff/u-9/revoke').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_SUPPORT');
  });
});
