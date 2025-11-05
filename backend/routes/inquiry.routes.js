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
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public routes
router.post('/', createInquiry);

// Protected routes (authenticated users)
router.get('/my', protect, getMyInquiries);

// Admin only routes
router.get('/stats', protect, admin, getInquiryStats);
router.get('/', protect, admin, getAllInquiries);
router.get('/:id', protect, getInquiryById);
router.put('/:id', protect, admin, updateInquiry);
router.put('/:id/assign', protect, admin, assignInquiry);
router.delete('/:id', protect, admin, deleteInquiry);

export default router;
