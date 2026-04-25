/**
 * backend/routes/analytics.routes.js
 * Phase 3 — Analytics routes (admin only)
 */

import express from 'express';
import { protect, admin } from '../middleware/auth.middleware.js';
import {
  getConversionRates,
  getProcessingTimes,
  getRevenue,
  getAgentPerformance,
  getSLAStatus,
  getDashboardOverview,
} from '../controllers/analytics.controller.js';
import { getAuditLogs } from '../middleware/auditLog.middleware.js';

const router = express.Router();

// All analytics routes require admin access
router.use(protect, admin);

router.get('/dashboard',          getDashboardOverview);
router.get('/conversion',         getConversionRates);
router.get('/processing-times',   getProcessingTimes);
router.get('/revenue',            getRevenue);
router.get('/agent-performance',  getAgentPerformance);
router.get('/sla',                getSLAStatus);
router.get('/audit-logs',         getAuditLogs);

export default router;
