import express from 'express';
import { packages, packageStats } from '../data/catalog.js';

const router = express.Router();

const norm = (s) => String(s || '').toLowerCase();

// Search / filter packages. Returns the full list when no filters are supplied,
// so the mobile PackageListScreen (which calls searchPackages() with no args)
// gets everything. Response shape: { success, data: [...], meta }.
router.get('/search', (req, res) => {
  const { destination, location, category, packageType, minPrice, maxPrice } = req.query;
  let results = [...packages];

  if (destination) results = results.filter(
    (p) => norm(p.destination).includes(norm(destination)) || norm(p.category).includes(norm(destination))
  );
  if (location) results = results.filter((p) => norm(p.location).includes(norm(location)));
  if (category) results = results.filter((p) => norm(p.category) === norm(category));
  if (packageType) results = results.filter((p) => norm(p.packageType).includes(norm(packageType)));
  if (minPrice) results = results.filter((p) => Number(p.price || 0) >= Number(minPrice));
  if (maxPrice) results = results.filter((p) => Number(p.price || 0) <= Number(maxPrice));

  res.json({ success: true, data: results, meta: { total: results.length } });
});

// Full catalog + stats.
router.get('/', (req, res) => {
  res.json({ success: true, data: packages, stats: packageStats, total: packages.length });
});

// Package details by globally-unique id. Declared after /search so the literal
// path isn't captured by the :id param.
router.get('/:id', (req, res) => {
  const pkg = packages.find((p) => String(p.id) === String(req.params.id));
  if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });
  res.json({ success: true, data: pkg });
});

export default router;
