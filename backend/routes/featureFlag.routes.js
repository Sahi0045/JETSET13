import express from 'express';
import {
  getAllFeatureFlags,
  getEnabledFeatureFlags,
  upsertFeatureFlag,
  deleteFeatureFlag
} from '../controllers/featureFlag.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public routes
router.get('/enabled', getEnabledFeatureFlags);
router.get('/', getAllFeatureFlags);

// Admin only routes
router.put('/:key', protect, admin, upsertFeatureFlag);
router.delete('/:key', protect, admin, deleteFeatureFlag);

export default router;
