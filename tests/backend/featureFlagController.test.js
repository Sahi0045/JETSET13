import { describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import {
  getAllFeatureFlags,
  getGuestFlightBooking,
  upsertFeatureFlag,
} from '../../backend/controllers/featureFlag.controller.js';

/**
 * The admin panel's Feature Flags page reads and writes through these handlers.
 *
 * They keyed every flag by `flag_key`, a column the feature_flags table does
 * not have (its key is `flag_name`), so the list answered 500 and every toggle
 * failed. The page showed its built-in defaults and nothing it "saved" was
 * stored. The guest flight booking switch lives in the same table.
 */

const table = ({ list, existing, saved } = {}) => {
  const calls = [];
  supabaseMock.from.mockImplementation((name) => {
    calls.push(['from', name]);
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'update', 'insert', 'delete']) {
      chain[op] = vi.fn((...args) => {
        calls.push([op, ...args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(async () => existing ?? { data: null, error: null });
    chain.single = vi.fn(async () => saved ?? { data: null, error: null });
    // A list read awaits the chain itself.
    if (list) chain.then = (resolve) => resolve(list);
    return chain;
  });
  return calls;
};

const switchTo = (enabled, key = 'guest_flight_booking') => createRequest({
  params: { key },
  body: { enabled },
  user: { id: 'admin-1', role: 'admin' },
});

describe('the feature flag handlers', () => {
  it('list the stored flags by the flag_name column', async () => {
    const rows = [{ flag_name: 'guest_flight_booking', enabled: true }];
    const calls = table({ list: { data: rows, error: null } });
    const res = createResponse();

    await getAllFeatureFlags(createRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual(rows);
    expect(calls).toContainEqual(['order', 'flag_name', { ascending: true }]);
    expect(JSON.stringify(calls)).not.toMatch(/flag_key/);
  });

  it('switch a stored flag found by its flag_name', async () => {
    const calls = table({
      existing: { data: { id: 'f1' }, error: null },
      saved: { data: { flag_name: 'guest_flight_booking', enabled: true }, error: null },
    });
    const res = createResponse();

    await upsertFeatureFlag(switchTo(true), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(calls.find(([op]) => op === 'update')[1]).toMatchObject({ enabled: true });
    expect(calls).toContainEqual(['eq', 'flag_name', 'guest_flight_booking']);
    expect(JSON.stringify(calls)).not.toMatch(/flag_key/);
  });

  it('create a flag that was never stored, under its flag_name', async () => {
    const calls = table({ saved: { data: { flag_name: 'guest_flight_booking', enabled: false }, error: null } });
    const res = createResponse();

    await upsertFeatureFlag(switchTo(false), res);

    expect(res.statusCode).toBe(200);
    expect(calls.find(([op]) => op === 'insert')[1]).toEqual({ flag_name: 'guest_flight_booking', enabled: false, description: '' });
  });

  it.each([[undefined], ['true'], [1]])('refuse %j as a switch position and store nothing', async (enabled) => {
    const calls = table();
    const res = createResponse();

    await upsertFeatureFlag(switchTo(enabled), res);

    expect(res.statusCode).toBe(400);
    expect(calls.some(([op]) => op === 'update' || op === 'insert')).toBe(false);
  });

  it('report a failed save as a failure, not a switched flag', async () => {
    table({ existing: { data: { id: 'f1' }, error: null }, saved: { data: null, error: { message: 'permission denied' } } });
    const res = createResponse();

    await upsertFeatureFlag(switchTo(false), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/feature-flags/guest-flight-booking', () => {
  it('says off when guest booking was never switched on, and is never cached', async () => {
    table();
    const res = createResponse();

    await getGuestFlightBooking(createRequest(), res);

    expect(res.body).toEqual({ success: true, data: { flag: 'guest_flight_booking', enabled: false } });
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('says on when an admin switched it on', async () => {
    table({ existing: { data: { enabled: true }, error: null } });
    const res = createResponse();

    await getGuestFlightBooking(createRequest(), res);

    expect(res.body.data.enabled).toBe(true);
  });
});
