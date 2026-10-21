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
