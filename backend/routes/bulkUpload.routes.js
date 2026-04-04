import express from 'express';
import { 
  uploadMiddleware, 
  bulkUploadApplications, 
  downloadTemplate, 
  getUploadHistory,
  validateBulkFile 
} from '../controllers/bulkUpload.controller.js';

const router = express.Router();

router.post('/upload', uploadMiddleware, bulkUploadApplications);

router.post('/validate', uploadMiddleware, validateBulkFile);

router.get('/template', downloadTemplate);

router.get('/history', getUploadHistory);

export default router;