import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Saving price settings keeps every fee a real, non-negative number, and keeps
 * the settings a save did not mention.
 *
 * PUT /api/admin/price-settings saved `parseFloat(value) || 0`: a negative fee
 * as it was, and anything unreadable as 0. And it replaced the stored object, so
 * a save that left a key out sent that setting back to its default.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'admin-1', role: 'superadmin' }; next(); },
    admin: (_req, _res, next) => next(),
  };
});

const STORED = { flight_taxes_fees: 1, flight_taxes_fees_percentage: 0, cancellation_fee: 50 };

let table = null;

const save = async (body, stored = STORED) => {
  vi.resetModules();
  table = fakeBookingsTable([], { tables: { price_settings: stored ? [{ id: 1, settings: { ...stored } }] : [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/admin.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/admin', routes);
  return request(app).put('/api/admin/price-settings').send(body);
};

const storedSettings = () => table.from('price_settings').single().then(({ data }) => data?.settings);

describe('saving price settings', () => {
  it('refuses a negative fee, and saves nothing', async () => {
    const res = await save({ flight_taxes_fees: -25, cancellation_fee: 10 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PRICE_SETTINGS');
    expect(res.body.fields).toEqual(['flight_taxes_fees']);
    expect(table.writes).toEqual([]);
    expect(await storedSettings()).toEqual(STORED);
  });

  it('refuses a value that is not a number, rather than saving it as 0', async () => {
    const res = await save({ cancellation_fee: 'fifty', flight_taxes_fees_percentage: '' });

    expect(res.status).toBe(400);
    expect(res.body.fields.sort()).toEqual(['cancellation_fee', 'flight_taxes_fees_percentage']);
    expect(table.writes).toEqual([]);
  });

  it('keeps the settings a save did not mention', async () => {
    const res = await save({ cancellation_fee: 0 });

    expect(res.status).toBe(200);
    expect(await storedSettings()).toEqual({ flight_taxes_fees: 1, flight_taxes_fees_percentage: 0, cancellation_fee: 0 });
    expect(res.body.data).toEqual({ flight_taxes_fees: 1, flight_taxes_fees_percentage: 0, cancellation_fee: 0 });
  });

  it('reads numbers sent as text, and ignores keys that are not settings', async () => {
    const res = await save({ cancellation_fee: '20.5', not_a_setting: 5 });

    expect(res.status).toBe(200);
    const settings = await storedSettings();
    expect(settings.cancellation_fee).toBe(20.5);
    expect(settings).not.toHaveProperty('not_a_setting');
  });
});
