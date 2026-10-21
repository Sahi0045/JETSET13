/**
 * catalog.js — static travel-catalog inventory (vacation packages). Cruises
 * come from the cruise catalog in the database (services/cruiseCatalog).
 * ─────────────────────────────────────────────────────────────
 * The cruise/package catalogs have always been static data shipped with the
 * web frontend (cruiselines.json / packages.json) — there was never a real API
 * behind them, so the mobile app's /cruises and /packages calls 404'd. This
 * module owns a backend copy of that data and normalizes it into the shape the
 * clients render, so both web and mobile consume the SAME backend endpoints.
 *
 * The data is imported from .data.js modules (NOT read via fs): Vercel's
 * serverless bundler only includes files reached through static imports, so an
 * fs.readFileSync of a .json returns empty in production. Static imports are
 * always bundled.
 */

import packagesRaw from './packages.data.js';

// ── Packages ─────────────────────────────────────────────────
// Source shape (packages.data.js): { stats, dubai:{packages:[...]}, europe:{...},
// kashmir:{...}, northEast:{...} }. Package ids restart per-category, so we
// reindex to a single globally-unique id space — the id the list hands to
// PackageDetails must resolve unambiguously via GET /packages/:id.
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
