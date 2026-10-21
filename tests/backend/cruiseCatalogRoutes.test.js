import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';

vi.mock('../../backend/middleware/auth.middleware.js', () => ({
  protect: (req, _res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
  admin: (_req, _res, next) => next(),
}));

const { default: cruiseCatalogRoutes } = await import('../../backend/routes/cruiseCatalog.routes.js');
const app = express().use(express.json()).use('/api/cruise-catalog', cruiseCatalogRoutes);

const PHOTO = `${process.env.SUPABASE_URL}/storage/v1/object/public/cruise-photos/sailings/a.jpg`;

/**
 * A fake Supabase that answers per table and records every filter, so a test
 * can say which filters a query used.
 */
const fakeDb = (answers) => {
  const calls = [];
  supabaseMock.from.mockImplementation((table) => {
    const chain = {};
    const own = [];
    const record = (op) => (...args) => { calls.push([table, op, ...args]); own.push([table, op, ...args]); return chain; };
    for (const op of ['select', 'eq', 'in', 'order', 'insert', 'update', 'gte', 'limit']) chain[op] = record(op);
    const answer = () => {
      const a = answers[table];
      return typeof a === 'function' ? a(own) : (a ?? { data: [], error: null });
    };
    chain.single = async () => answer();
    chain.maybeSingle = async () => answer();
    chain.then = (resolve, reject) => Promise.resolve(answer()).then(resolve, reject);
    return chain;
  });
  supabaseMock.rpc = vi.fn(async () => ({ data: 'sailing-1', error: null }));
  return calls;
};

const body = (overrides = {}) => ({
  title: 'Western Caribbean',
  region: 'caribbean',
  lineId: 'line-1',
  nights: 2,
  status: 'draft',
  days: [
    { day: 1, portId: 'miami', arrive: null, depart: '16:00' },
    { day: 2, portId: 'cozumel', arrive: '07:00', depart: '18:00' },
    { day: 3, portId: 'miami', arrive: '06:00', depart: null },
  ],
  dates: ['2099-01-10'],
  fromPriceUsd: 849,
  photos: [{ url: PHOTO, credit: 'Royal Caribbean' }],
  ...overrides,
});

const PORT_ROWS = { data: [{ id: 'miami', lat: 25.77, lon: -80.17 }, { id: 'cozumel', lat: 20.51, lon: -86.95 }], error: null };

beforeEach(() => {
  supabaseMock.from.mockReset();
});

describe('public reads', () => {
  it('lists only published sailings', async () => {
    const calls = fakeDb({ cruise_sailings: { data: [], error: null } });
    const res = await request(app).get('/api/cruise-catalog/sailings');
    expect(res.status).toBe(200);
    expect(calls).toContainEqual(['cruise_sailings', 'eq', 'status', 'published']);
  });

  it('never serves a draft, even by slug', async () => {
    const calls = fakeDb({ cruise_sailings: { data: null, error: null } });
    const res = await request(app).get('/api/cruise-catalog/sailings/western-caribbean-2-nights-ab12');
    expect(res.status).toBe(404);
    expect(calls).toContainEqual(['cruise_sailings', 'eq', 'status', 'published']);
  });

  it('treats a published sailing whose dates have all passed as gone', async () => {
    fakeDb({ cruise_sailings: { data: { slug: 'old', title: 'Old', region: 'caribbean', nights: 2, photos: [], dates: [{ sail_date: '2020-01-01' }], days: [], line: { name: 'X' } }, error: null } });
    const res = await request(app).get('/api/cruise-catalog/sailings/old');
    expect(res.status).toBe(404);
  });

  it('leaves out sailings whose dates have all passed', async () => {
    fakeDb({
      cruise_sailings: {
        data: [
          { slug: 'old', title: 'Old', region: 'caribbean', nights: 2, photos: [], dates: [{ sail_date: '2020-01-01' }], days: [], line: { name: 'X' } },
          { slug: 'new', title: 'New', region: 'caribbean', nights: 2, photos: [], dates: [{ sail_date: '2099-01-01' }, { sail_date: '2098-06-01' }], days: [], line: { name: 'X' } },
        ],
        error: null,
      },
    });
    const res = await request(app).get('/api/cruise-catalog/sailings');
    expect(res.body.data.map((s) => s.slug)).toEqual(['new']);
    expect(res.body.data[0].next_date).toBe('2098-06-01');
  });

  it('gives each card its route, its ports in order and where it starts and ends', async () => {
    fakeDb({
      cruise_sailings: {
        data: [{
          slug: 'w', title: 'W', region: 'caribbean', nights: 2, photos: [], line: { name: 'X' },
          route: { type: 'LineString', coordinates: [[-80.17, 25.77], [-77.35, 25.08], [-80.17, 25.77]] },
          dates: [{ sail_date: '2099-01-01' }],
          days: [
            { day: 3, port: { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 } },
            { day: 1, port: { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 } },
            { day: 2, port: { name: 'Nassau', country: 'Bahamas', lat: 25.08, lon: -77.35 } },
          ],
        }],
        error: null,
      },
    });
    const res = await request(app).get('/api/cruise-catalog/sailings');
    const [card] = res.body.data;
    expect(card.route.type).toBe('LineString');
    expect(card.ports).toEqual([
      { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 },
      { name: 'Nassau', country: 'Bahamas', lat: 25.08, lon: -77.35 },
    ]);
    expect(card.start_port).toBe('Miami');
    expect(card.end_port).toBe('Miami');
  });

  it('counts regions with published sailings only where there are some', async () => {
    fakeDb({ cruise_sailings: { data: [{ region: 'alaska', dates: [{ sail_date: '2099-01-01' }] }, { region: 'alaska', dates: [{ sail_date: '2099-02-01' }] }], error: null } });
    const res = await request(app).get('/api/cruise-catalog/regions');
    expect(res.body.data).toEqual([expect.objectContaining({ key: 'alaska', name: 'Alaska', count: 2 })]);
  });
});

describe('saving a sailing', () => {
  it('saves through the save function with a computed sea route', async () => {
    fakeDb({ cruise_ports: PORT_ROWS });
    const res = await request(app).post('/api/cruise-catalog/admin/sailings').send(body());
    expect(res.status).toBe(200);
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = supabaseMock.rpc.mock.calls[0];
    expect(fn).toBe('cruise_save_sailing');
    expect(args.p_sailing.route.type).toBe('LineString');
    expect(args.p_sailing.slug).toMatch(/^western-caribbean-2-nights-[0-9a-f]{4}$/);
    expect(args.p_sailing.created_by).toBe('admin-1');
    expect(args.p_sailing.price_checked_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.p_days).toHaveLength(3);
    expect(args.p_dates).toEqual(['2099-01-10']);
    expect(res.body.data).toEqual({ id: 'sailing-1', slug: args.p_sailing.slug });
  });

  it('refuses a bad body with the validation message', async () => {
    fakeDb({ cruise_ports: PORT_ROWS });
    const res = await request(app).post('/api/cruise-catalog/admin/sailings').send(body({ region: 'atlantis' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Pick a region from the list.');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('refuses a port that is not in the port list', async () => {
    fakeDb({ cruise_ports: { data: [{ id: 'miami', lat: 25.77, lon: -80.17 }], error: null } });
    const res = await request(app).post('/api/cruise-catalog/admin/sailings').send(body());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('A port in the itinerary is not in the port list.');
  });

  it('keeps the checked date and the slug when the price is unchanged on PUT', async () => {
    fakeDb({
      cruise_ports: PORT_ROWS,
      cruise_sailings: { data: { id: 'sailing-1', slug: 'kept-slug', from_price_usd: '849.00', price_checked_on: '2026-09-01' }, error: null },
    });
    const res = await request(app).put('/api/cruise-catalog/admin/sailings/sailing-1').send(body());
    expect(res.status).toBe(200);
    const [, args] = supabaseMock.rpc.mock.calls[0];
    expect(args.p_sailing).toMatchObject({ id: 'sailing-1', slug: 'kept-slug', price_checked_on: '2026-09-01' });
  });

  it('answers 404 when updating a sailing that does not exist', async () => {
    fakeDb({ cruise_ports: PORT_ROWS, cruise_sailings: { data: null, error: null } });
    const res = await request(app).put('/api/cruise-catalog/admin/sailings/nope').send(body());
    expect(res.status).toBe(404);
  });
});

describe('when something unexpected throws', () => {
  it('answers 500 instead of leaving the request hanging', async () => {
    supabaseMock.from.mockImplementation(() => { throw new Error('connection reset'); });
    const res = await request(app).get('/api/cruise-catalog/admin/sailings').timeout(3000);
    expect(res.status).toBe(500);
  });
});

describe('photos and ports', () => {
  it('refuses a photo that is not an image', async () => {
    const res = await request(app).post('/api/cruise-catalog/admin/photo-upload-url').send({ filename: 'brochure.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Upload a JPG, PNG or WebP photo.');
  });

  it('hands out a signed upload for an image', async () => {
    const createSignedUploadUrl = vi.fn(async (path) => ({ data: { path, token: 'tok', signedUrl: 'https://x/upload' }, error: null }));
    supabaseMock.storage.from.mockReturnValue({
      createSignedUploadUrl,
      getPublicUrl: (path) => ({ data: { publicUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/cruise-photos/${path}` } }),
    });
    const res = await request(app).post('/api/cruise-catalog/admin/photo-upload-url').send({ filename: 'Ship At Sea.JPG' });
    expect(res.status).toBe(200);
    expect(supabaseMock.storage.from).toHaveBeenCalledWith('cruise-photos');
    expect(res.body.data.path).toMatch(/^sailings\/[0-9a-f-]{36}\.jpg$/);
    expect(res.body.data).toMatchObject({ token: 'tok' });
    expect(res.body.data.publicUrl.endsWith(res.body.data.path)).toBe(true);
  });

  it('finds ports to add by name', async () => {
    const res = await request(app).get('/api/cruise-catalog/admin/port-search?q=nassau');
    expect(res.body.data[0]).toMatchObject({ name: 'Nassau', country: 'Bahamas' });
  });

  it('refuses a port with blank coordinates instead of saving it at 0, 0', async () => {
    fakeDb({});
    for (const coords of [{ lat: '', lon: '' }, { lat: null, lon: null }, {}]) {
      const res = await request(app).post('/api/cruise-catalog/admin/ports').send({ name: 'Juneau', country: 'United States', ...coords });
      expect(res.status, JSON.stringify(coords)).toBe(400);
    }
  });

  it('redraws the routes of every sailing that calls at a port when the port moves', async () => {
    fakeDb({
      cruise_ports: (calls) => (calls.some(([, op]) => op === 'update')
        ? { data: { id: 'cozumel', name: 'Cozumel', country: 'Mexico', lat: 20.49, lon: -86.97 }, error: null }
        : { data: [{ id: 'miami', lat: 25.77, lon: -80.17 }, { id: 'cozumel', lat: 20.49, lon: -86.97 }], error: null }),
      cruise_sailing_days: (calls) => (calls.some(([, op, col]) => op === 'eq' && col === 'port_id')
        ? { data: [{ sailing_id: 's1' }, { sailing_id: 's1' }], error: null }
        : { data: [{ sailing_id: 's1', day: 1, port_id: 'miami' }, { sailing_id: 's1', day: 2, port_id: 'cozumel' }, { sailing_id: 's1', day: 3, port_id: 'miami' }], error: null }),
      cruise_sailings: { data: null, error: null },
    });
    const calls = [];
    const original = supabaseMock.from.getMockImplementation();
    supabaseMock.from.mockImplementation((table) => {
      const chain = original(table);
      const update = chain.update;
      chain.update = (row) => { calls.push([table, row]); return update(row); };
      return chain;
    });
    const res = await request(app).put('/api/cruise-catalog/admin/ports/cozumel').send({ name: 'Cozumel', country: 'Mexico', lat: '20.49', lon: '-86.97' });
    expect(res.status).toBe(200);
    const redraw = calls.find(([table]) => table === 'cruise_sailings');
    expect(redraw[1].route.type).toBe('LineString');
    expect(redraw[1].route.coordinates).toContainEqual([-86.97, 20.49]);
  });

  it('refuses a port with impossible coordinates', async () => {
    fakeDb({});
    const res = await request(app).post('/api/cruise-catalog/admin/ports').send({ name: 'Nowhere', country: 'Sea', lat: 120, lon: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('A port needs a name, a country, a latitude from -90 to 90 and a longitude from -180 to 180.');
  });
});
