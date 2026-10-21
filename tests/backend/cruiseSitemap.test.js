import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { supabaseMock } from './setup.js';
import cruiseCatalogRoutes from '../../backend/routes/cruiseCatalog.routes.js';

const app = express().use('/api/cruise-catalog', cruiseCatalogRoutes);

const filters = [];
beforeEach(() => {
  filters.length = 0;
  supabaseMock.from.mockImplementation(() => {
    const chain = {};
    for (const op of ['select', 'order']) chain[op] = () => chain;
    chain.eq = (...args) => { filters.push(args); return chain; };
    chain.then = (resolve) => resolve({
      data: [
        { slug: 'western-caribbean-7-nights-ab12', title: 'W', region: 'caribbean', nights: 7, photos: [], updated_at: '2026-10-20T10:00:00Z', dates: [{ sail_date: '2099-01-01' }], days: [] },
        { slug: 'sailed-already-3-nights-cd34', title: 'Old', region: 'bahamas', nights: 3, photos: [], updated_at: '2026-01-01T10:00:00Z', dates: [{ sail_date: '2020-01-01' }], days: [] },
      ],
      error: null,
    });
    return chain;
  });
});

describe('the sitemap of published sailings', () => {
  it('lists each sailing customers can still book, with the day it last changed', async () => {
    const res = await request(app).get('/api/cruise-catalog/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(filters).toContainEqual(['status', 'published']);
    expect(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(res.text).toContain('<loc>https://www.jetsetterss.com/cruise/western-caribbean-7-nights-ab12</loc>');
    expect(res.text).toContain('<lastmod>2026-10-20</lastmod>');
    expect(res.text).not.toContain('sailed-already');
  });
});

describe('the public address of the sailing sitemap', () => {
  it('reaches the API on Vercel and on the Node servers', async () => {
    const { readFile } = await import('node:fs/promises');
    const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
    expect(vercel.rewrites).toContainEqual({ source: '/sitemap-cruise-sailings.xml', destination: '/api/index.js' });
    for (const file of ['backend/api/index.js', 'server.js', 'backend/server.js']) {
      expect(await readFile(file, 'utf8'), file).toMatch(/\.get\(\s*["']\/sitemap-cruise-sailings\.xml["'],\s*sailingSitemap\s*\)/);
    }
  });
});
