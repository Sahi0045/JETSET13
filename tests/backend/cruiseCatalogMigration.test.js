import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRUISE_REGIONS, regionByKey } from '../../shared/cruiseRegions.js';

const sql = readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261021120000_cruise_catalog.sql'), 'utf8');

const TABLES = ['cruise_lines', 'cruise_ships', 'cruise_ports', 'cruise_sailings', 'cruise_sailing_days', 'cruise_sailing_dates'];

describe('the cruise catalog migration', () => {
  it.each(TABLES)('%s has RLS on', (table) => {
    expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  });

  it('creates no policies', () => expect(sql).not.toMatch(/create policy/i));

  it('keeps the save function from anon and signed-in callers', () => {
    expect(sql).toMatch(/revoke execute on function public\.cruise_save_sailing\(jsonb, jsonb, jsonb\) from public, anon, authenticated/i);
  });

  it('makes a public photo bucket', () => expect(sql).toMatch(/'cruise-photos'[\s\S]*true/));

  it('only allows draft or published', () => expect(sql).toMatch(/status in \('draft', ?'published'\)/i));
});

describe('the starter port list', () => {
  const seeded = [...sql.matchAll(/\('((?:[^']|'')+)', '((?:[^']|'')+)', (-?\d+\.\d+), (-?\d+\.\d+)\)/g)]
    .map(([, name, country, lat, lon]) => ({ name: name.replace(/''/g, "'"), country: country.replace(/''/g, "'"), lat: Number(lat), lon: Number(lon) }));

  it('seeds at least 100 cruise ports, once each, without overwriting staff edits', () => {
    expect(seeded.length).toBeGreaterThanOrEqual(100);
    expect(new Set(seeded.map((p) => `${p.name}|${p.country}`)).size).toBe(seeded.length);
    expect(sql).toMatch(/on conflict \(name, country\) do nothing/i);
  });

  it('places every seeded port on the globe', () => {
    for (const port of seeded) {
      expect(Math.abs(port.lat), port.name).toBeLessThanOrEqual(90);
      expect(Math.abs(port.lon), port.name).toBeLessThanOrEqual(180);
    }
  });

  it('covers the ports the sea-route list lacks', () => {
    const names = seeded.map((p) => p.name);
    for (const name of ['Juneau', 'Skagway', 'Ketchikan', 'Cozumel', 'Costa Maya', 'Key West', 'Grand Cayman', 'Labadee', 'CocoCay', 'Puerto Vallarta', 'Cabo San Lucas', 'Hilo', 'Santorini', 'Mykonos', 'Kotor', 'Naples', 'Copenhagen']) {
      expect(names, name).toContain(name);
    }
  });
});

describe('cruise regions', () => {
  it('lists 15 regions with coordinates', () => {
    expect(CRUISE_REGIONS).toHaveLength(15);
    for (const region of CRUISE_REGIONS) {
      expect(Math.abs(region.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(region.lon)).toBeLessThanOrEqual(180);
    }
    expect(regionByKey('alaska').name).toBe('Alaska');
    expect(regionByKey('nowhere')).toBeNull();
  });
});
