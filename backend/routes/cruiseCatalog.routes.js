import express from 'express';
import { admin, protect } from '../middleware/auth.middleware.js';
import {
  createLine, createPort, createSailing, createShip, getPublishedSailing, getSailingAdmin,
  listLines, listPorts, listPublishedSailings, listRegions, listSailingsAdmin, listShips,
  photoUploadUrl, portSearch, sailingSitemap, updatePort, updateSailing,
} from '../controllers/cruiseCatalog.controller.js';

const router = express.Router();

// Express 4 never answers a request whose async handler throws: the admin
// editor would spin forever instead of showing "try again".
const safe = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
  console.error('Cruise catalog: unexpected error', error?.message ?? error);
  if (!res.headersSent) res.status(500).json({ success: false, error: 'Something went wrong on our side. Try again.' });
});

router.get('/sailings', safe(listPublishedSailings));
router.get('/sailings/:slug', safe(getPublishedSailing));
router.get('/regions', safe(listRegions));
router.get('/sitemap.xml', safe(sailingSitemap));

router.get('/admin/sailings', protect, admin, safe(listSailingsAdmin));
router.get('/admin/sailings/:id', protect, admin, safe(getSailingAdmin));
router.post('/admin/sailings', protect, admin, safe(createSailing));
router.put('/admin/sailings/:id', protect, admin, safe(updateSailing));
router.get('/admin/lines', protect, admin, safe(listLines));
router.post('/admin/lines', protect, admin, safe(createLine));
router.get('/admin/ships', protect, admin, safe(listShips));
router.post('/admin/ships', protect, admin, safe(createShip));
router.get('/admin/ports', protect, admin, safe(listPorts));
router.post('/admin/ports', protect, admin, safe(createPort));
router.put('/admin/ports/:id', protect, admin, safe(updatePort));
router.get('/admin/port-search', protect, admin, safe(portSearch));
router.post('/admin/photo-upload-url', protect, admin, safe(photoUploadUrl));

export default router;
