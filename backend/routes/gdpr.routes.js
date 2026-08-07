/**
 * backend/routes/gdpr.routes.js
 *
 * GDPR / Play Store data-rights endpoints.
 *
 * These were previously declared inline in backend/server.js only, which meant
 * they 404'd in production (Vercel serves backend/api/index.js) and were also
 * mounted without `protect` — every handler reads req.user.id, so an
 * unauthenticated call crashed instead of returning 401.
 *
 * Google Play requires a reachable account-deletion path, so these must be
 * registered in all three entry points (server.js, backend/server.js,
 * backend/api/index.js).
 */

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {
  getDataSummary,
  exportUserData,
  requestAccountDeletion,
  recordConsent,
} from '../controllers/gdpr.controller.js';

const router = express.Router();

// Every route here operates on the caller's own data, so all require auth.
router.get('/my-data-summary', protect, getDataSummary);
router.get('/export-data', protect, exportUserData);
router.delete('/delete-account', protect, requestAccountDeletion);
router.post('/consent', protect, recordConsent);

export default router;
