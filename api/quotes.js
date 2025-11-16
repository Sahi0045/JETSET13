import Quote from '../backend/models/quote.model.js';
import BookingInfo from '../backend/models/bookingInfo.model.js';
import Inquiry from '../backend/models/inquiry.model.js';
import { optionalProtect } from '../backend/middleware/auth.middleware.js';

// Wrapper to convert Express middleware to Vercel handler
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { method, query } = req;

  try {
    // Run auth middleware
    await runMiddleware(req, res, optionalProtect);

    // GET /api/quotes?inquiryId=xxx - Get quotes for a specific inquiry
    if (method === 'GET' && query.inquiryId) {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const quotes = await Quote.findByInquiryId(query.inquiryId);

      return res.status(200).json({
        success: true,
        data: quotes || []
      });
    }

    // GET /api/quotes?id=xxx - Get a specific quote by ID
    if (method === 'GET' && query.id) {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const quote = await Quote.findById(query.id);

      if (!quote) {
        return res.status(404).json({
          success: false,
          message: 'Quote not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: quote
      });
    }

    // GET /api/quotes - Get all quotes (admin only)
    if (method === 'GET') {
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const quotes = await Quote.findAll();

      return res.status(200).json({
        success: true,
        data: quotes || []
      });
    }

    // POST /api/quotes - Create a new quote (admin only)
    if (method === 'POST') {
      console.log('POST /api/quotes - User check:', {
        hasUser: !!req.user,
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        userObject: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : null
      });

      if (!req.user) {
        console.error('POST /api/quotes - No user found in request');
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
          error: 'User not authenticated'
        });
      }

      if (!['admin', 'staff'].includes(req.user.role)) {
        console.error('POST /api/quotes - User role insufficient:', {
          userRole: req.user.role,
          userId: req.user.id,
          userEmail: req.user.email
        });
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
          error: `User role '${req.user.role}' is not authorized. Required: admin or staff`
        });
      }

      const quoteData = req.body;
      
      // Extract and map 'notes' to 'admin_notes' BEFORE spreading
      const { notes, ...restQuoteData } = quoteData;
      const adminNotes = notes || quoteData.admin_notes || null;
      
      // Prepare quote data with required fields
      const preparedData = {
        ...restQuoteData, // Spread without 'notes'
        admin_id: req.user.id, // Set admin_id from authenticated user
        quote_number: quoteData.quote_number || Quote.generateQuoteNumber(), // Auto-generate if missing
        status: quoteData.status || 'draft', // Default to draft
        // Handle breakdown - convert string to JSON if needed
        breakdown: typeof quoteData.breakdown === 'string' 
          ? JSON.parse(quoteData.breakdown) 
          : (quoteData.breakdown || []),
        // Ensure total_amount is a number
        total_amount: parseFloat(quoteData.total_amount) || 0,
        // Set validity_days default
        validity_days: quoteData.validity_days || 30,
        // Map 'notes' to 'admin_notes' (database column name)
        admin_notes: adminNotes
      };

      // Remove fields that shouldn't be set by client
      delete preparedData.id;
      delete preparedData.created_at;
      delete preparedData.updated_at;
      delete preparedData.sent_at;
      delete preparedData.accepted_at;
      delete preparedData.paid_at;
      delete preparedData.expires_at; // Should be set by sendQuote, not on creation
      
      // Only keep valid database columns
      const validColumns = [
        'inquiry_id', 'admin_id', 'quote_number', 'title', 'description',
        'total_amount', 'currency', 'breakdown', 'terms_conditions',
        'validity_days', 'status', 'payment_link', 'payment_status', 'admin_notes'
      ];
      
      // Filter out any fields that aren't valid columns (safety check)
      Object.keys(preparedData).forEach(key => {
        if (!validColumns.includes(key)) {
          console.warn(`⚠️ Removing invalid field from quote data: ${key}`);
          delete preparedData[key];
        }
      });

      console.log('Creating quote with prepared data:', {
        ...preparedData,
        breakdown: Array.isArray(preparedData.breakdown) ? `${preparedData.breakdown.length} items` : 'invalid'
      });

      try {
        const quote = await Quote.create(preparedData);

        return res.status(201).json({
          success: true,
          message: 'Quote created successfully',
          data: quote
        });
      } catch (createError) {
        console.error('Quote creation failed:', createError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create quote',
          error: createError.message,
          details: process.env.NODE_ENV === 'development' ? createError.stack : undefined
        });
      }
    }

    // PUT /api/quotes?id=xxx&action=send - Send a quote (admin only)
    // IMPORTANT: Check this BEFORE the generic PUT route
    if (method === 'PUT' && query.id && query.action === 'send') {
      console.log('PUT /api/quotes (send) - User check:', {
        hasUser: !!req.user,
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        quoteId: query.id
      });

      if (!req.user) {
        console.error('PUT /api/quotes (send) - No user found in request');
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
          error: 'User not authenticated'
        });
      }

      if (!['admin', 'staff'].includes(req.user.role)) {
        console.error('PUT /api/quotes (send) - User role insufficient:', {
          userRole: req.user.role,
          userId: req.user.id,
          userEmail: req.user.email
        });
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
          error: `User role '${req.user.role}' is not authorized. Required: admin or staff`
        });
      }

      try {
        console.log('Sending quote:', query.id, 'by admin:', req.user.id);
        console.log('Query params:', JSON.stringify(query));
        
        if (!query.id) {
          return res.status(400).json({
            success: false,
            message: 'Quote ID is required',
            query: query
          });
        }

        const sentQuote = await Quote.sendQuote(query.id, req.user.id);

        if (!sentQuote) {
          return res.status(404).json({
            success: false,
            message: 'Quote not found after sending'
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Quote sent successfully',
          data: sentQuote
        });
      } catch (sendError) {
        console.error('Error sending quote:', sendError);
        console.error('Error stack:', sendError.stack);
        console.error('Error details:', {
          message: sendError.message,
          name: sendError.name,
          query: query,
          adminId: req.user?.id
        });
        
        return res.status(500).json({
          success: false,
          message: 'Failed to send quote',
          error: sendError.message || 'Unknown error',
          details: process.env.NODE_ENV === 'development' ? sendError.stack : sendError.toString()
        });
      }
    }

    // PUT /api/quotes?id=xxx - Update a quote (admin only)
    // This handles general updates (not send action)
    if (method === 'PUT' && query.id && !query.action) {
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const updateData = { ...req.body };
      // Map 'notes' to 'admin_notes' if present
      if (updateData.notes !== undefined) {
        updateData.admin_notes = updateData.notes;
        delete updateData.notes;
      }
      
      const quote = await Quote.update(query.id, updateData);

      if (!quote) {
        return res.status(404).json({
          success: false,
          message: 'Quote not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Quote updated successfully',
        data: quote
      });
    }

    // DELETE /api/quotes?id=xxx - Delete a quote (admin only)
    if (method === 'DELETE' && query.id) {
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      await Quote.delete(query.id);

      return res.status(200).json({
        success: true,
        message: 'Quote deleted successfully'
      });
    }

    // POST /api/quotes?id=xxx&endpoint=booking-info - Save booking info
    if (method === 'POST' && query.id && query.endpoint === 'booking-info') {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      try {
        const quote = await Quote.findById(query.id);
        if (!quote) {
          return res.status(404).json({
            success: false,
            message: 'Quote not found'
          });
        }

        // Check authorization - user must own the inquiry
        const inquiry = await Inquiry.findById(quote.inquiry_id);
        if (!inquiry) {
          return res.status(404).json({
            success: false,
            message: 'Associated inquiry not found'
          });
        }

        // Allow inquiry owner OR admin OR email match (for legacy inquiries)
        const isInquiryOwner = inquiry.user_id && String(inquiry.user_id) === String(req.user.id);
        const isAdmin = req.user.role === 'admin';
        const isEmailMatch = inquiry.customer_email && req.user.email &&
                            inquiry.customer_email.toLowerCase() === req.user.email.toLowerCase();

        if (!isInquiryOwner && !isAdmin && !isEmailMatch) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to submit booking information for this quote'
          });
        }

        // Allow booking info for 'sent' or 'accepted' quotes
        if (quote.status !== 'accepted' && quote.status !== 'sent') {
          return res.status(400).json({
            success: false,
            message: 'Booking information can only be submitted for active or accepted quotes'
          });
        }

        const bookingData = req.body;

        // Validate required fields
        if (!bookingData.full_name || !bookingData.email || !bookingData.phone) {
          return res.status(400).json({
            success: false,
            message: 'Full name, email, and phone are required'
          });
        }

        // Whitelist of valid booking_info fields
        const validBookingInfoFields = [
          'full_name',
          'email',
          'phone',
          'date_of_birth',
          'nationality',
          'passport_number',
          'passport_expiry_date',
          'passport_issue_date',
          'passport_issuing_country',
          'emergency_contact_name',
          'emergency_contact_phone',
          'emergency_contact_relationship',
          'booking_details',
          'terms_accepted',
          'privacy_policy_accepted'
        ];

        // Filter bookingData to only include valid fields
        const filteredBookingData = {};
        for (const field of validBookingInfoFields) {
          if (bookingData[field] !== undefined) {
            filteredBookingData[field] = bookingData[field];
          }
        }

        // Prepare booking info data
        const bookingInfoData = {
          quote_id: query.id,
          inquiry_id: quote.inquiry_id,
          user_id: req.user.id,
          ...filteredBookingData
        };

        // Remove any fields that shouldn't be set by client
        delete bookingInfoData.id;
        delete bookingInfoData.created_at;
        delete bookingInfoData.updated_at;
        delete bookingInfoData.submitted_at;
        delete bookingInfoData.verified_at;
        delete bookingInfoData.verified_by;
        delete bookingInfoData.verification_notes;
        delete bookingInfoData.terms_accepted_at;
        delete bookingInfoData.privacy_policy_accepted_at;
        delete bookingInfoData.status; // Will be set below
        delete bookingInfoData.accepted_at; // Not a valid field for booking_info

        // Determine status based on terms acceptance and completeness
        const isFlightBooking = inquiry.inquiry_type === 'flight';
        const isComplete = bookingData.terms_accepted && bookingData.privacy_policy_accepted &&
                          bookingData.full_name && bookingData.email && bookingData.phone &&
                          (!isFlightBooking || (bookingData.passport_number && bookingData.passport_expiry_date));

        bookingInfoData.status = isComplete ? 'completed' : 'incomplete';

        // Check if booking info already exists
        let existingBookingInfo = await BookingInfo.findByQuoteId(query.id);
        let result;

        if (existingBookingInfo) {
          // Update existing
          result = await BookingInfo.update(existingBookingInfo.id, bookingInfoData);
        } else {
          // Create new
          result = await BookingInfo.create(bookingInfoData);
        }

        return res.status(200).json({
          success: true,
          data: result,
          message: existingBookingInfo ? 'Booking information updated successfully' : 'Booking information created successfully'
        });
      } catch (error) {
        console.error('Error saving booking info:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to save booking information',
          error: error.message
        });
      }
    }

    // GET /api/quotes?id=xxx&endpoint=booking-info - Get booking info
    if (method === 'GET' && query.id && query.endpoint === 'booking-info') {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      try {
        const quote = await Quote.findById(query.id);
        if (!quote) {
          return res.status(404).json({
            success: false,
            message: 'Quote not found'
          });
        }

        // Check if user has access to this quote (inquiry owner or admin)
        const inquiry = await Inquiry.findById(quote.inquiry_id);
        if (!inquiry) {
          return res.status(404).json({
            success: false,
            message: 'Associated inquiry not found'
          });
        }

        const isInquiryOwner = inquiry.user_id && String(inquiry.user_id) === String(req.user.id);
        const isAdmin = req.user.role === 'admin';
        const isEmailMatch = inquiry.customer_email && req.user.email &&
                            inquiry.customer_email.toLowerCase() === req.user.email.toLowerCase();

        if (!isInquiryOwner && !isAdmin && !isEmailMatch) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to access this booking information'
          });
        }

        const bookingInfo = await BookingInfo.findByQuoteId(query.id);

        if (!bookingInfo) {
          return res.status(404).json({
            success: false,
            message: 'Booking information not found'
          });
        }

        return res.status(200).json({
          success: true,
          data: bookingInfo
        });
      } catch (error) {
        console.error('Error fetching booking info:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch booking information',
          error: error.message
        });
      }
    }

    // Method not allowed
    return res.status(405).json({
      success: false,
      message: `Method ${method} not allowed`
    });

  } catch (error) {
    console.error('Quote API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}


