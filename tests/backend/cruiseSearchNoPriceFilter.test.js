import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import cruiseRoutes from '../../backend/routes/cruise.routes.js';
import { cruises } from '../../backend/data/catalog.js';

const app = express().use('/api/cruises', cruiseRoutes);

describe('cruise search now that the catalog carries no prices', () => {
  it('ignores a minimum price instead of returning nothing', async () => {
    const res = await request(app).get('/api/cruises/search?minPrice=500');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(cruises.length);
  });

  it('ignores a maximum price too', async () => {
    const res = await request(app).get('/api/cruises/search?maxPrice=100');
    expect(res.body.data).toHaveLength(cruises.length);
  });
});
