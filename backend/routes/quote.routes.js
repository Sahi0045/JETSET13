import express from 'express';
import {
  createQuote,
  getAllQuotes,
  getQuoteById,
  getQuotesByInquiry,
  updateQuote,
  sendQuote,
  acceptQuote,
  deleteQuote,
  getExpiredQuotes,
  getExpiringSoonQuotes
} from '../controllers/quote.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Admin only routes
router.get('/expired', protect, admin, getExpiredQuotes);
router.get('/expiring-soon', protect, admin, getExpiringSoonQuotes);
router.post('/', protect, admin, createQuote);
router.get('/', protect, admin, getAllQuotes);
router.put('/:id/send', protect, admin, sendQuote);
router.delete('/:id', protect, admin, deleteQuote);

// Protected routes (authenticated users can view their quotes)
router.get('/:id', protect, getQuoteById);
router.put('/:id', protect, admin, updateQuote);
router.put('/:id/accept', protect, acceptQuote);

// Inquiry-specific quote routes
router.get('/inquiry/:inquiryId', protect, getQuotesByInquiry);

export default router;
