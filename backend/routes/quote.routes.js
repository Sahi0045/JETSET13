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

// ============================================
// ACTION-BASED ROUTE HANDLER
// Handles requests with ?action= or ?id= query parameters
// This bridges the Vercel serverless function pattern with Express
// ============================================

// Query-param based action router (for frontend compatibility)
router.all('/', async (req, res, next) => {
    const { action, id } = req.query;
    
    // If no query params that need special handling, continue to next handler
    if (!action && !id) {
        return next();
    }
    
    console.log(`📥 Quote API: method=${req.method}, action=${action}, id=${id}`);
    
    // Handle action-based routing
    if (action === 'send' && id && req.method === 'PUT') {
        // Simulate path param for sendQuote handler
        req.params = { id };
        return protect(req, res, () => admin(req, res, () => sendQuote(req, res)));
    }
    
    if (action === 'accept' && id && req.method === 'PUT') {
        req.params = { id };
        return protect(req, res, () => acceptQuote(req, res));
    }
    
    // Handle GET with id query param
    if (id && req.method === 'GET' && !action) {
        req.params = { id };
        return protect(req, res, () => getQuoteById(req, res));
    }
    
    // Handle PUT with id query param (update quote)
    if (id && req.method === 'PUT' && !action) {
        req.params = { id };
        return protect(req, res, () => admin(req, res, () => updateQuote(req, res)));
    }
    
    // Handle DELETE with id query param
    if (id && req.method === 'DELETE') {
        req.params = { id };
        return protect(req, res, () => admin(req, res, () => deleteQuote(req, res)));
    }
    
    // Continue to standard routes if no match
    next();
});

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
