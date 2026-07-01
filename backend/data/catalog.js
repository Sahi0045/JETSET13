/**
 * catalog.js — static travel-catalog inventory (cruises & vacation packages).
 * ─────────────────────────────────────────────────────────────
 * The cruise/package catalogs have always been static data shipped with the
 * web frontend (cruiselines.json / packages.json) — there was never a real API
 * behind them, so the mobile app's /cruises and /packages calls 404'd. This
 * module owns a backend copy of that data and normalizes it into the shape the
 * clients render, so both web and mobile consume the SAME backend endpoints.
 *
 * JSON is read via fs (not import assertions) to stay portable across the three
 * entry points (server.js, backend/server.js, Vercel handler).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dataDir = path.dirname(fileURLToPath(import.meta.url));

function loadJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf-8'));
  } catch (err) {
    console.error(`[catalog] Failed to load ${name}:`, err.message);
    return null;
  }
}

// ── Cruises ──────────────────────────────────────────────────
// Source shape (cruiselines.json): { cruiseLines: [{ id, name, image,
// priceValue, duration, destinations[], departurePorts[], rating, ... }] }.
// The mobile CruiseResultsScreen reads both camelCase and snake_case with
// fallbacks, so we expose both to be safe.
const cruiseLinesRaw = (loadJson('cruiselines.json') || {}).cruiseLines || [];

export const cruises = cruiseLinesRaw.map((c, i) => ({
  id: c.id || i + 1,
  name: c.description || c.name,
  cruise_line: c.name,
  cruiseLine: c.name,
  ship: c.ship || null,
  image: c.image,
  logo: c.logo || null,
  duration: c.duration,
  departure_port: (c.departurePorts && c.departurePorts[0]) || 'Various Ports',
  departurePort: (c.departurePorts && c.departurePorts[0]) || 'Various Ports',
  departurePorts: c.departurePorts || [],
  departure_date: c.departure_date || null,
  departureDate: c.departure_date || null,
  destinations: c.destinations || [],
  price_per_person: c.priceValue,
  priceValue: c.priceValue,
  price: c.price,
  rating: c.rating,
  reviews: c.reviews,
  description: c.longDescription || c.description,
  amenities: c.amenities || [],
  cabin_types: c.cabin_types || [],
}));

// ── Packages ─────────────────────────────────────────────────
// Source shape (packages.json): { stats, dubai:{packages:[...]}, europe:{...},
// kashmir:{...}, northEast:{...} }. Package ids restart per-category, so we
// reindex to a single globally-unique id space — the id the list hands to
// PackageDetails must resolve unambiguously via GET /packages/:id.
const packagesRaw = loadJson('packages.json') || {};
const PKG_CATEGORIES = ['dubai', 'europe', 'kashmir', 'northEast'];

export const packages = [];
let pkgSeq = 1;
for (const cat of PKG_CATEGORIES) {
  const group = packagesRaw[cat];
  if (group && Array.isArray(group.packages)) {
    for (const p of group.packages) {
      packages.push({ ...p, id: pkgSeq++, categoryId: p.id, category: cat });
    }
  }
}

export const packageStats = packagesRaw.stats || {};
