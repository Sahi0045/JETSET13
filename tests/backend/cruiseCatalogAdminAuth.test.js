import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import cruiseCatalogRoutes from '../../backend/routes/cruiseCatalog.routes.js';

// The real protect/admin middleware: nothing here is mocked.
const app = express().use(cookieParser()).use(express.json()).use('/api/cruise-catalog', cruiseCatalogRoutes);

describe('the cruise catalog admin routes', () => {
  it.each([
    ['get', '/api/cruise-catalog/admin/sailings'],
    ['post', '/api/cruise-catalog/admin/sailings'],
    ['put', '/api/cruise-catalog/admin/sailings/abc'],
    ['post', '/api/cruise-catalog/admin/lines'],
    ['post', '/api/cruise-catalog/admin/ports'],
    ['post', '/api/cruise-catalog/admin/photo-upload-url'],
  ])('rejects an anonymous %s %s', async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
  });
});
