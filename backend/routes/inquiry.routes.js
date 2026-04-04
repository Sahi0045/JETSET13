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
import { auditLog, bulkAuditLog } from '../middleware/auditLog.middleware.js';
import supabase from '../config/supabase.js';

const router = express.Router();

// Public routes (with optional authentication)
router.post('/', optionalProtect, createInquiry);

// Protected routes (authenticated users)
// Handle both /my (path) and ?endpoint=my (query) for compatibility
router.get('/my', protect, getMyInquiries);

// Handle query parameter endpoint=my (for Vercel compatibility)
// Also handle query parameter id=... for inquiry details
// This must come before the admin route to catch the query parameters
router.get('/', protect, (req, res, next) => {
  // If query parameter endpoint=my, handle as getMyInquiries
  if (req.query.endpoint === 'my') {
    return getMyInquiries(req, res);
  }
  // If query parameter id is present, handle as getInquiryById
  if (req.query.id) {
    // Temporarily set params.id for the controller
    req.params.id = req.query.id;
    return getInquiryById(req, res);
  }
  // Otherwise, continue to admin route
  next();
}, admin, getAllInquiries);

// Admin only routes
router.get('/stats', protect, admin, getInquiryStats);
router.get('/:id', protect, getInquiryById);
router.put('/:id', protect, admin, auditLog('inquiry_updated', 'inquiry'), updateInquiry);
router.put('/:id/assign', protect, admin, auditLog('inquiry_assigned', 'inquiry'), assignInquiry);
router.delete('/:id', protect, admin, auditLog('inquiry_deleted', 'inquiry'), deleteInquiry);

// Bulk update (admin only)
router.put('/bulk-update', protect, admin, bulkAuditLog('bulk_status_update', 'inquiry'), async (req, res) => {
  try {
    const { ids, status } = req.body;
    const VALID = ['pending', 'in_progress', 'approved', 'rejected', 'cancelled'];

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array is required' });
    }
    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${VALID.join(', ')}` });
    }

    const { error } = await supabase
      .from('inquiries')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (error) throw new Error(error.message);

    res.json({ success: true, message: `${ids.length} inquiries updated to "${status}"`, updated: ids.length });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
