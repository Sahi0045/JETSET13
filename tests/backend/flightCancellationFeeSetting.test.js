import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { flightCancellationFeeFor, flightCancellationFeeFrom } from '../../backend/config/priceDefaults.js';

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

describe('flightCancellationFeeFor', () => {
  it('keeps the flat fee plus that percentage of what was paid', () => {
    expect(flightCancellationFeeFor({ flight_cancellation_fee: 20, flight_cancellation_fee_percent: '12.5' }, 291)).toBe(56.38);
    expect(flightCancellationFeeFor({ flight_cancellation_fee: 0, flight_cancellation_fee_percent: 10 }, 500)).toBe(50);
    expect(flightCancellationFeeFor({ flight_cancellation_fee_percent: 10 }, 500)).toBe(100);
  });

  it('keeps only the flat fee when the percentage is 0, and nothing when both are', () => {
    expect(flightCancellationFeeFor({ flight_cancellation_fee: 25, flight_cancellation_fee_percent: 0 }, 500)).toBe(25);
    expect(flightCancellationFeeFor({ flight_cancellation_fee: 25, flight_cancellation_fee_percent: 0 }, null)).toBe(25);
    expect(flightCancellationFeeFor({ flight_cancellation_fee: 0, flight_cancellation_fee_percent: 0 }, 500)).toBe(0);
  });

  it('is the fixed fee until a percentage is saved', () => {
    expect(flightCancellationFeeFor({ cancellation_fee: 50 }, 500)).toBe(50);
    expect(flightCancellationFeeFor({ flight_cancellation_fee: 20, flight_cancellation_fee_percent: null }, 500)).toBe(20);
  });

  it('ignores a percentage that is not between 0 and 100', () => {
    for (const percent of [-5, 101, '', 'abc']) {
      expect(flightCancellationFeeFor({ cancellation_fee: 30, flight_cancellation_fee_percent: percent }, 500)).toBe(30);
    }
  });

  it('is unknown when a percentage is saved but what was paid is not known', () => {
    expect(flightCancellationFeeFor({ flight_cancellation_fee_percent: 10 }, null)).toBeNull();
    expect(flightCancellationFeeFor({ flight_cancellation_fee_percent: 10 }, undefined)).toBeNull();
  });
});

describe('the price settings routes', () => {
  it('answer no flight percentage until one is saved, and the saved one after', async () => {
    const unset = await appWith({ cancellation_fee: 50 });
    expect((await request(unset).get('/api/admin/price-settings')).body.data.flight_cancellation_fee_percent).toBeNull();

    const saved = await appWith({ cancellation_fee: 50, flight_cancellation_fee_percent: 10 });
    const all = await request(saved).get('/api/admin/price-settings');
    const flights = await request(saved).get('/api/admin/price-config/flights');

    expect(all.body.data.flight_cancellation_fee_percent).toBe(10);
    expect(flights.body.data.cancellation_fee_percent).toBe(10);
  });

  it('save a flight percentage', async () => {
    const app = await appWith({ cancellation_fee: 50 });

    const res = await request(app).put('/api/admin/price-settings').send({ flight_cancellation_fee_percent: 12.5 });

    expect(res.status).toBe(200);
    const { data } = await table.from('price_settings').single();
    expect(data.settings).toEqual({ cancellation_fee: 50, flight_cancellation_fee_percent: 12.5 });
  });

  it('save the rest of the page when the percentage is left empty', async () => {
    const app = await appWith({ cancellation_fee: 50 });

    const res = await request(app).put('/api/admin/price-settings').send({ flight_taxes_fees: 30, flight_cancellation_fee_percent: null });

    expect(res.status).toBe(200);
    const { data } = await table.from('price_settings').single();
    expect(data.settings).toEqual({ cancellation_fee: 50, flight_taxes_fees: 30 });
  });

  it('refuse a percentage over 100 and save nothing', async () => {
    const app = await appWith({ cancellation_fee: 50 });

    const res = await request(app).put('/api/admin/price-settings').send({ flight_taxes_fees: 30, flight_cancellation_fee_percent: 150 });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(['flight_cancellation_fee_percent']);
    const { data } = await table.from('price_settings').single();
    expect(data.settings).toEqual({ cancellation_fee: 50 });
  });

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
