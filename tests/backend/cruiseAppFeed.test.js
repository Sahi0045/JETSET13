import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { supabaseMock } from './setup.js';
import cruiseRoutes from '../../backend/routes/cruise.routes.js';

const app = express().use(express.json()).use('/api/cruises', cruiseRoutes);

const PUBLISHED = [{
  slug: 'western-caribbean-7-nights-ab12', title: 'Western Caribbean', headline: null, region: 'caribbean', nights: 7,
  from_price_usd: 849, price_checked_on: '2099-01-01', updated_at: '2026-10-20T10:00:00Z',
  photos: [{ url: 'https://cdn.example/a.jpg', credit: 'RC' }], route: null,
  line: { name: 'Royal Caribbean' }, ship: { name: 'Wonder of the Seas' },
  dates: [{ sail_date: '2099-02-01' }, { sail_date: '2099-01-10' }],
  days: [
    { day: 1, port: { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 } },
    { day: 2, port: { name: 'Cozumel', country: 'Mexico', lat: 20.49, lon: -86.97 } },
    { day: 3, port: { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 } },
  ],
}];

const filters = [];
beforeEach(() => {
  filters.length = 0;
  supabaseMock.from.mockImplementation(() => {
    const chain = {};
    for (const op of ['select', 'order']) chain[op] = () => chain;
    chain.eq = (...args) => { filters.push(args); return chain; };
    chain.then = (resolve) => resolve({ data: PUBLISHED, error: null });
    return chain;
  });
});

describe('the cruises the mobile app reads', () => {
  it('come from the published catalog, in the shape the app shows', async () => {
    const res = await request(app).get('/api/cruises');
    expect(res.status).toBe(200);
    expect(filters).toContainEqual(['status', 'published']);
    expect(res.body.data).toEqual([{
      id: 'western-caribbean-7-nights-ab12',
      name: 'Western Caribbean',
      cruise_line: 'Royal Caribbean',
      ship: 'Wonder of the Seas',
      duration: 7,
      departure_port: 'Miami',
      destinations: ['Cozumel'],
      image: 'https://cdn.example/a.jpg',
      departure_date: '2099-01-10',
    }]);
  });

  it('carry no price fields for the app to show as fact', async () => {
    const res = await request(app).get('/api/cruises');
    for (const key of ['price', 'priceValue', 'price_per_person', 'rating', 'reviews']) expect(res.body.data[0]).not.toHaveProperty(key);
  });

  it('search by port and by line, and look up one by its id', async () => {
    expect((await request(app).get('/api/cruises/search?destination=cozumel')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/cruises/search?destination=alaska')).body.data).toHaveLength(0);
    expect((await request(app).get('/api/cruises/search?cruiseLine=royal')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/cruises/details/western-caribbean-7-nights-ab12')).body.data.name).toBe('Western Caribbean');
    expect((await request(app).get('/api/cruises/details/nope')).status).toBe(404);
  });
});
