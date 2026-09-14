import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import {
  deleteSavedTraveller,
  listSavedTravellers,
  sanitizeTraveller,
  saveTravellers,
} from '../../backend/controllers/savedTravellers.controller.js';

/**
 * A customer's saved travellers - the people they book for - so the review page
 * fills a form with one tap. Every query belongs to the signed-in customer, and
 * a list that cannot be read never gets in the way of booking.
 */

const USER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4' };
const MISSING_TABLE = { code: '42P01', message: 'relation "public.saved_travellers" does not exist' };

const database = ({ saved = { data: [], error: null }, profile = { data: null, error: null }, write = { error: null } } = {}) => {
  const calls = [];
  supabaseMock.from.mockImplementation((table) => {
    const chain = {};
    let writes = false;
    for (const op of ['select', 'eq', 'order', 'limit', 'update', 'insert', 'delete']) {
      chain[op] = vi.fn((...args) => {
        calls.push([table, op, ...args]);
        if (['update', 'insert', 'delete'].includes(op)) writes = true;
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(async () => (table === 'users' ? profile : saved));
    chain.then = (resolve) => resolve(writes ? write : saved);
    return chain;
  });
  return calls;
};

const run = async (handler, { body = {}, params = {} } = {}) => {
  const res = createResponse();
  await handler(createRequest({ user: USER, body, params }), res);
  return res;
};

describe('listing saved travellers', () => {
  it("returns only the signed-in customer's travellers, and them from their profile", async () => {
    const calls = database({
      saved: { data: [{ id: 't1', first_name: 'Kabir', last_name: 'Rao', gender: 'male', date_of_birth: '2018-05-05' }], error: null },
      profile: { data: { first_name: 'Asha', last_name: 'Rao', gender: 'Female', date_of_birth: '1990-04-02T00:00:00', nationality: 'in', passport_number: 'p 123-45' }, error: null },
    });

    const res = await run(listSavedTravellers);

    expect(calls).toContainEqual(['saved_travellers', 'eq', 'user_id', USER.id]);
    expect(calls).toContainEqual(['users', 'eq', 'id', USER.id]);
    expect(res.body.data.self).toEqual({
      id: 'self', firstName: 'Asha', lastName: 'Rao', gender: 'female', dateOfBirth: '1990-04-02',
      nationality: 'IN', passportNumber: 'P12345', passportExpiry: '',
    });
    expect(res.body.data.travellers).toEqual([{
      id: 't1', firstName: 'Kabir', lastName: 'Rao', gender: 'male', dateOfBirth: '2018-05-05',
      nationality: '', passportNumber: '', passportExpiry: '',
    }]);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('reads as an empty list, not an error, before the table exists', async () => {
    database({ saved: { data: null, error: MISSING_TABLE } });

    const res = await run(listSavedTravellers);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ travellers: [], available: false });
  });
});

describe('saving travellers', () => {
  it('adds new travellers and updates ones already saved, never blanking what was known', async () => {
    const calls = database({ saved: { data: [{ id: 't1', first_name: 'Asha', last_name: 'Rao', date_of_birth: '1990-04-02' }], error: null } });

    const res = await run(saveTravellers, {
      body: {
        travellers: [
          { firstName: 'asha', lastName: 'RAO', gender: 'female' },
          { firstName: 'Kabir', lastName: 'Rao', gender: 'male', dateOfBirth: '2018-05-05' },
        ],
      },
    });

    const update = calls.find(([table, op]) => table === 'saved_travellers' && op === 'update')[2];
    expect(update).toMatchObject({ gender: 'female' });
    expect(update).not.toHaveProperty('date_of_birth');
    expect(calls).toContainEqual(['saved_travellers', 'eq', 'id', 't1']);

    const insert = calls.find(([table, op]) => table === 'saved_travellers' && op === 'insert')[2];
    expect(insert).toMatchObject({ user_id: USER.id, first_name: 'Kabir', date_of_birth: '2018-05-05' });
    expect(res.body.data.saved).toBe(2);
  });

  it("files travellers under the session's customer, whatever the request says", async () => {
    const calls = database();

    await run(saveTravellers, { body: { user_id: 'someone-else', travellers: [{ firstName: 'Asha', lastName: 'Rao', user_id: 'someone-else' }] } });

    const insert = calls.find(([, op]) => op === 'insert')[2];
    expect(insert.user_id).toBe(USER.id);
  });

  it('saves nobody without a name', async () => {
    database();
    const res = await run(saveTravellers, { body: { travellers: [{ firstName: '', lastName: 'Rao' }] } });
    expect(res.statusCode).toBe(400);
  });

  it('says saving is unavailable before the table exists', async () => {
    database({ saved: { data: null, error: MISSING_TABLE } });
    const res = await run(saveTravellers, { body: { travellers: [{ firstName: 'Asha', lastName: 'Rao' }] } });
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('SAVED_TRAVELLERS_UNAVAILABLE');
  });
});

describe('removing a saved traveller', () => {
  it("removes only from the signed-in customer's list", async () => {
    const id = '9d0b2c1a-1111-4222-8333-944455556666';
    const calls = database();

    const res = await run(deleteSavedTraveller, { params: { id } });

    expect(res.statusCode).toBe(200);
    expect(calls).toContainEqual(['saved_travellers', 'eq', 'id', id]);
    expect(calls).toContainEqual(['saved_travellers', 'eq', 'user_id', USER.id]);
  });

  it('refuses an id that is not one', async () => {
    database();
    expect((await run(deleteSavedTraveller, { params: { id: '1 or 1=1' } })).statusCode).toBe(400);
  });
});

describe('sanitizeTraveller', () => {
  it('trims, bounds and normalises what it stores', () => {
    expect(sanitizeTraveller({
      firstName: '  Asha   Devi ', lastName: 'Rao', gender: 'FEMALE', dateOfBirth: '1990-04-02',
      nationality: 'in', passportNumber: 'z 12-34', passportExpiry: 'not a date',
    })).toEqual({
      first_name: 'Asha Devi', last_name: 'Rao', gender: 'female', date_of_birth: '1990-04-02',
      nationality: 'IN', passport_number: 'Z1234', passport_expiry: null,
    });
  });
});

describe('the routes', () => {
  it('are for signed-in customers only, and mounted on every server', () => {
    const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
    const routes = read('backend/routes/savedTravellers.routes.js');

    expect(routes).toMatch(/router\.get\('\/', protect, listSavedTravellers\)/);
    expect(routes).toMatch(/router\.post\('\/', protect, saveTravellers\)/);
    expect(routes).toMatch(/router\.delete\('\/:id', protect, deleteSavedTraveller\)/);
    for (const server of ['backend/api/index.js', 'server.js', 'backend/server.js']) {
      expect(read(server)).toMatch(/\/api\/users\/me\/travellers['"], savedTravellersRoutes/);
    }
  });
});
