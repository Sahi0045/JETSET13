import express from 'express';
import { 
  uploadMiddleware, 
  bulkUploadApplications, 
  downloadTemplate, 
  getUploadHistory,
  validateBulkFile 
} from '../controllers/bulkUpload.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Ingesting/validating bulk application files is an admin operation; history is
// scoped to the caller (the controller reads req.user.id). Auth runs before the
// multer upload middleware so an unauthorized request never gets parsed. Only
// the blank-template download stays public.
router.post('/upload', protect, admin, uploadMiddleware, bulkUploadApplications);

router.post('/validate', protect, admin, uploadMiddleware, validateBulkFile);

router.get('/template', downloadTemplate);

router.get('/history', protect, getUploadHistory);

export default router;