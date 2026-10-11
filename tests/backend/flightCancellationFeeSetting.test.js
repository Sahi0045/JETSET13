import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { flightCancellationFeeFrom } from '../../backend/config/priceDefaults.js';

/**
 * Flights have their own cancellation fee. Until an admin saves one, a flight
 * cancel keeps the general fee it kept before, so nothing changes the day this
 * ships.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'admin-1', role: 'superadmin' }; next(); },
    admin: (_req, _res, next) => next(),
  };
});

let table = null;

const appWith = async (stored) => {
  vi.resetModules();
  table = fakeBookingsTable([], { tables: { price_settings: stored ? [{ id: 1, settings: { ...stored } }] : [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/admin.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/admin', routes);
  return app;
};

describe('flightCancellationFeeFrom', () => {
  it('is the default with nothing stored', () => {
    expect(flightCancellationFeeFrom({})).toBe(50);
    expect(flightCancellationFeeFrom(null)).toBe(50);
  });

  it('is the general fee until a flight fee is saved', () => {
    expect(flightCancellationFeeFrom({ cancellation_fee: 30 })).toBe(30);
  });

  it('is the flight fee once saved, 0 included', () => {
    expect(flightCancellationFeeFrom({ cancellation_fee: 30, flight_cancellation_fee: 0 })).toBe(0);
    expect(flightCancellationFeeFrom({ cancellation_fee: 30, flight_cancellation_fee: '20' })).toBe(20);
  });

  it('ignores a flight fee that is not a usable number', () => {
    expect(flightCancellationFeeFrom({ cancellation_fee: 30, flight_cancellation_fee: -5 })).toBe(30);
    expect(flightCancellationFeeFrom({ cancellation_fee: 30, flight_cancellation_fee: '' })).toBe(30);
  });
});

describe('the price settings routes', () => {
  it('answer the general fee as the flight fee until one is saved', async () => {
    const app = await appWith({ flight_taxes_fees: 1, cancellation_fee: 30 });

    const res = await request(app).get('/api/admin/price-settings');

    expect(res.body.data.flight_cancellation_fee).toBe(30);
    expect(res.body.data.cancellation_fee).toBe(30);
  });

  it('answer the saved flight fee', async () => {
    const app = await appWith({ cancellation_fee: 30, flight_cancellation_fee: 15 });

    const all = await request(app).get('/api/admin/price-settings');
    const flights = await request(app).get('/api/admin/price-config/flights');

    expect(all.body.data.flight_cancellation_fee).toBe(15);
    expect(flights.body.data.cancellation_fee).toBe(15);
  });

  it('save a flight fee', async () => {
    const app = await appWith({ cancellation_fee: 50 });

    const res = await request(app).put('/api/admin/price-settings').send({ flight_cancellation_fee: 25 });

    expect(res.status).toBe(200);
    const { data } = await table.from('price_settings').single();
    expect(data.settings).toEqual({ cancellation_fee: 50, flight_cancellation_fee: 25 });
  });
});
