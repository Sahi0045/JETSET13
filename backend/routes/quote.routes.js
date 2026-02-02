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
import Quote from '../models/quote.model.js';
import Inquiry from '../models/inquiry.model.js';
import BookingInfo from '../models/bookingInfo.model.js';

const router = express.Router();

// ============================================
// ACTION-BASED ROUTE HANDLER
// Handles requests with ?action= or ?id= query parameters
// This bridges the Vercel serverless function pattern with Express
// ============================================

// Query-param based action router (for frontend compatibility)
router.all('/', async (req, res, next) => {
    const { action, id, endpoint } = req.query;
    
    // If no query params that need special handling, continue to next handler
    if (!action && !id && !endpoint) {
        return next();
    }
    
    console.log(`📥 Quote API: method=${req.method}, action=${action}, id=${id}, endpoint=${endpoint}`);
    
    // Handle booking-info endpoint (GET and POST)
    if (endpoint === 'booking-info' && id) {
        return protect(req, res, async () => {
            try {
                const quote = await Quote.findById(id);
                if (!quote) {
                    return res.status(404).json({ success: false, message: 'Quote not found' });
                }

                const inquiry = await Inquiry.findById(quote.inquiry_id);
                if (!inquiry) {
                    return res.status(404).json({ success: false, message: 'Associated inquiry not found' });
                }

                // Check authorization
                const isInquiryOwner = inquiry.user_id && String(inquiry.user_id) === String(req.user.id);
                const isAdmin = req.user.role === 'admin' || req.user.role === 'staff';
                const isEmailMatch = inquiry.customer_email && req.user.email &&
                                    inquiry.customer_email.toLowerCase() === req.user.email.toLowerCase();

                if (!isInquiryOwner && !isAdmin && !isEmailMatch) {
                    return res.status(403).json({ success: false, message: 'Not authorized to access this booking information' });
                }

                if (req.method === 'GET') {
                    // GET booking info
                    const bookingInfo = await BookingInfo.findByQuoteId(id);
                    if (!bookingInfo) {
                        return res.status(404).json({ success: false, message: 'Booking information not found' });
                    }
                    return res.status(200).json({ success: true, data: bookingInfo });
                }

                if (req.method === 'POST') {
                    // POST booking info - save/update
                    if (quote.status !== 'accepted' && quote.status !== 'sent') {
                        return res.status(400).json({ success: false, message: 'Booking information can only be submitted for active or accepted quotes' });
                    }

                    const bookingData = req.body;
                    if (!bookingData.full_name || !bookingData.email || !bookingData.phone) {
                        return res.status(400).json({ success: false, message: 'Full name, email, and phone are required' });
                    }

                    // Whitelist valid fields
                    const validFields = ['full_name', 'email', 'phone', 'date_of_birth', 'nationality',
                        'passport_number', 'passport_expiry_date', 'passport_issue_date', 'passport_issuing_country',
                        'govt_id_type', 'govt_id_number', 'govt_id_issue_date', 'govt_id_expiry_date',
                        'govt_id_issuing_authority', 'govt_id_issuing_country', 'emergency_contact_name',
                        'emergency_contact_phone', 'emergency_contact_relationship', 'booking_details',
                        'terms_accepted', 'privacy_policy_accepted'];

                    const filteredData = {};
                    const dateFields = ['date_of_birth', 'passport_expiry_date', 'passport_issue_date', 'govt_id_issue_date', 'govt_id_expiry_date'];
                    
                    for (const field of validFields) {
                        if (bookingData[field] !== undefined) {
                            if (dateFields.includes(field) && bookingData[field] === '') {
                                filteredData[field] = null;
                            } else {
                                filteredData[field] = bookingData[field];
                            }
                        }
                    }

                    const bookingInfoData = {
                        quote_id: id,
                        inquiry_id: quote.inquiry_id,
                        user_id: req.user.id,
                        ...filteredData
                    };

                    // Determine status
                    const isFlightBooking = inquiry.inquiry_type === 'flight';
                    const hasRequiredFields = bookingData.full_name && bookingData.email && bookingData.phone;
                    const hasTermsAccepted = bookingData.terms_accepted && bookingData.privacy_policy_accepted;
                    const hasGovtIdInfo = bookingData.govt_id_type && bookingData.govt_id_number;
                    const hasPassportInfo = bookingData.passport_number && bookingData.passport_expiry_date;
                    const isComplete = hasRequiredFields && hasTermsAccepted && hasGovtIdInfo && (!isFlightBooking || hasPassportInfo);
                    bookingInfoData.status = isComplete ? 'completed' : 'incomplete';

                    // Check if exists and update/create
                    const existingBookingInfo = await BookingInfo.findByQuoteId(id);
                    let result;
                    if (existingBookingInfo) {
                        result = await BookingInfo.update(existingBookingInfo.id, bookingInfoData);
                    } else {
                        result = await BookingInfo.create(bookingInfoData);
                    }

                    return res.status(200).json({
                        success: true,
                        data: result,
                        message: existingBookingInfo ? 'Booking information updated successfully' : 'Booking information created successfully',
                        status: result?.status || bookingInfoData.status
                    });
                }

                return res.status(405).json({ success: false, message: 'Method not allowed' });
            } catch (error) {
                console.error('Booking info error:', error);
                return res.status(500).json({ success: false, message: 'Failed to process booking information', error: error.message });
            }
        });
    }
    
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
    if (id && req.method === 'GET' && !action && !endpoint) {
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
