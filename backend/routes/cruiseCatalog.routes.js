import express from 'express';
import { admin, protect } from '../middleware/auth.middleware.js';
import {
  createLine, createPort, createSailing, createShip, getPublishedSailing, getSailingAdmin,
  listLines, listPorts, listPublishedSailings, listRegions, listSailingsAdmin, listShips,
  photoUploadUrl, portSearch, updatePort, updateSailing,
} from '../controllers/cruiseCatalog.controller.js';

const router = express.Router();

router.get('/sailings', listPublishedSailings);
router.get('/sailings/:slug', getPublishedSailing);
router.get('/regions', listRegions);

router.get('/admin/sailings', protect, admin, listSailingsAdmin);
router.get('/admin/sailings/:id', protect, admin, getSailingAdmin);
router.post('/admin/sailings', protect, admin, createSailing);
router.put('/admin/sailings/:id', protect, admin, updateSailing);
router.get('/admin/lines', protect, admin, listLines);
router.post('/admin/lines', protect, admin, createLine);
router.get('/admin/ships', protect, admin, listShips);
router.post('/admin/ships', protect, admin, createShip);
router.get('/admin/ports', protect, admin, listPorts);
router.post('/admin/ports', protect, admin, createPort);
router.put('/admin/ports/:id', protect, admin, updatePort);
router.get('/admin/port-search', protect, admin, portSearch);
router.post('/admin/photo-upload-url', protect, admin, photoUploadUrl);

export default router;
