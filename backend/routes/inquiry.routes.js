import express from 'express';
import {
  createInquiry,
  getAllInquiries,
  getMyInquiries,
  getInquiryById,
  updateInquiry,
  deleteInquiry,
  getInquiryStats,
  assignInquiry
} from '../controllers/inquiry.controller.js';
import { protect, admin, optionalProtect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public routes (with optional authentication)
router.post('/', optionalProtect, createInquiry);

// Protected routes (authenticated users)
// Handle both /my (path) and ?endpoint=my (query) for compatibility
router.get('/my', protect, getMyInquiries);

// Handle query parameter endpoint=my (for Vercel compatibility)
// This must come before the admin route to catch the query parameter
router.get('/', protect, (req, res, next) => {
  // If query parameter endpoint=my, handle as getMyInquiries
  if (req.query.endpoint === 'my') {
    return getMyInquiries(req, res);
  }
  // Otherwise, continue to admin route
  next();
}, admin, getAllInquiries);

// Admin only routes
router.get('/stats', protect, admin, getInquiryStats);
router.get('/:id', protect, getInquiryById);
router.put('/:id', protect, admin, updateInquiry);
router.put('/:id/assign', protect, admin, assignInquiry);
router.delete('/:id', protect, admin, deleteInquiry);

export default router;
