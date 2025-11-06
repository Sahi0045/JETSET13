import Quote from '../models/quote.model.js';
import Inquiry from '../models/inquiry.model.js';
import { sendEmail } from '../services/emailService.js';

// @desc    Create a new quote
// @route   POST /api/quotes
// @access  Private/Admin
export const createQuote = async (req, res) => {
  try {
    const {
      inquiry_id,
      title,
      description,
      total_amount,
      currency = 'USD',
      breakdown = {},
      terms_conditions,
      validity_days = 30
    } = req.body;

    // Verify inquiry exists
    const inquiry = await Inquiry.findById(inquiry_id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const quoteData = {
      inquiry_id,
      admin_id: req.user.id,
      quote_number: Quote.generateQuoteNumber(),
      title,
      description,
      total_amount: parseFloat(total_amount),
      currency,
      breakdown,
      terms_conditions,
      validity_days: parseInt(validity_days),
      status: 'draft'
    };

    const quote = await Quote.create(quoteData);

    res.status(201).json({
      success: true,
      data: quote,
      message: 'Quote created successfully'
    });
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quote',
      error: error.message
    });
  }
};

// @desc    Get all quotes (admin only)
// @route   GET /api/quotes
// @access  Private/Admin
export const getAllQuotes = async (req, res) => {
  try {
    const {
      status,
      inquiry_id,
      admin_id,
      page = 1,
      limit = 10,
      sort = 'created_at:desc'
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (inquiry_id) filters.inquiry_id = inquiry_id;
    if (admin_id) filters.admin_id = admin_id;

    const options = {
      orderBy: sort,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    };

    const { quotes, total } = await Quote.findAll(filters, options);

    res.json({
      success: true,
      data: quotes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all quotes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quotes',
      error: error.message
    });
  }
};

// @desc    Get quote by ID
// @route   GET /api/quotes/:id
// @access  Private (own quote or admin)
export const getQuoteById = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Check if user has access to this quote (owns the inquiry or is admin)
    const inquiry = await Inquiry.findById(quote.inquiry_id);
    if (!inquiry || (inquiry.user_id !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this quote'
      });
    }

    res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Get quote by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote',
      error: error.message
    });
  }
};

// @desc    Get quotes for an inquiry
// @route   GET /api/inquiries/:inquiryId/quotes
// @access  Private (own inquiry or admin)
export const getQuotesByInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.inquiryId);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    // Check if user owns this inquiry or is admin
    if (inquiry.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access these quotes'
      });
    }

    const quotes = await Quote.findByInquiryId(req.params.inquiryId);

    res.json({
      success: true,
      data: quotes
    });
  } catch (error) {
    console.error('Get quotes by inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quotes',
      error: error.message
    });
  }
};

// @desc    Update quote
// @route   PUT /api/quotes/:id
// @access  Private/Admin
export const updateQuote = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Only admin who created the quote or other admins can update
    if (quote.admin_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this quote'
      });
    }

    const allowedFields = [
      'title', 'description', 'total_amount', 'currency',
      'breakdown', 'terms_conditions', 'validity_days'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
        if (field === 'total_amount') {
          updateData[field] = parseFloat(req.body[field]);
        }
      }
    });

    updateData.updated_at = new Date().toISOString();

    const updatedQuote = await Quote.update(req.params.id, updateData);

    res.json({
      success: true,
      data: updatedQuote,
      message: 'Quote updated successfully'
    });
  } catch (error) {
    console.error('Update quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quote',
      error: error.message
    });
  }
};

// @desc    Send quote to customer
// @route   PUT /api/quotes/:id/send
// @access  Private/Admin
export const sendQuote = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Check if quote is in draft status
    if (quote.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Quote has already been sent'
      });
    }

    const sentQuote = await Quote.sendQuote(req.params.id, req.user.id);

    // Update the inquiry status to 'quoted' so it appears in my-trips
    try {
      await Inquiry.update(quote.inquiry_id, {
        status: 'quoted',
        updated_at: new Date().toISOString()
      });
      console.log(`Updated inquiry ${quote.inquiry_id} status to 'quoted'`);
    } catch (updateError) {
      console.error('Failed to update inquiry status:', updateError);
      // Don't fail the whole request if inquiry update fails
    }

    // Fetch full quote with inquiry for emailing
    let fullQuote = sentQuote;
    try {
      fullQuote = await Quote.findById(sentQuote.id);
    } catch (e) {
      // fallback to sentQuote
    }

    // Send email to customer (guard against missing inquiry info)
    try {
      const customerEmail = fullQuote?.inquiry?.customer_email;
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: `Your Travel Quote - ${fullQuote.quote_number}`,
          template: 'quote_sent',
          data: {
            customerName: fullQuote?.inquiry?.customer_name,
            quoteNumber: fullQuote.quote_number,
            totalAmount: fullQuote.total_amount,
            currency: fullQuote.currency,
            expiresAt: fullQuote.expires_at,
            quoteLink: `${process.env.FRONTEND_URL}/quotes/${fullQuote.id}`
          }
        });
      } else {
        console.warn('Skipping email: inquiry customer_email not available');
      }
    } catch (emailError) {
      console.error('Failed to send quote email:', emailError);
    }

    res.json({
      success: true,
      data: fullQuote || sentQuote,
      message: 'Quote sent successfully'
    });
  } catch (error) {
    console.error('Send quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send quote',
      error: error.message
    });
  }
};

// @desc    Accept quote (customer)
// @route   PUT /api/quotes/:id/accept
// @access  Private (customer who owns the inquiry)
export const acceptQuote = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Check if user owns the inquiry
    const inquiry = await Inquiry.findById(quote.inquiry_id);
    if (!inquiry || inquiry.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept this quote'
      });
    }

    // Check if quote is still valid
    if (quote.status !== 'sent' || new Date(quote.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Quote is no longer valid'
      });
    }

    const acceptedQuote = await Quote.acceptQuote(req.params.id);

    // Send confirmation email
    try {
      await sendEmail({
        to: inquiry.customer_email,
        subject: 'Quote Accepted - Next Steps',
        template: 'quote_accepted',
        data: {
          customerName: inquiry.customer_name,
          quoteNumber: acceptedQuote.quote_number,
          nextSteps: 'Our team will contact you shortly to finalize your booking.'
        }
      });
    } catch (emailError) {
      console.error('Failed to send quote acceptance email:', emailError);
    }

    res.json({
      success: true,
      data: acceptedQuote,
      message: 'Quote accepted successfully'
    });
  } catch (error) {
    console.error('Accept quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept quote',
      error: error.message
    });
  }
};

// @desc    Delete quote (admin only)
// @route   DELETE /api/quotes/:id
// @access  Private/Admin
export const deleteQuote = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Only admin who created the quote or other admins can delete
    if (quote.admin_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this quote'
      });
    }

    await Quote.delete(req.params.id);

    res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quote',
      error: error.message
    });
  }
};

// @desc    Get expired quotes (admin only)
// @route   GET /api/quotes/expired
// @access  Private/Admin
export const getExpiredQuotes = async (req, res) => {
  try {
    const expiredQuotes = await Quote.getExpiredQuotes();

    res.json({
      success: true,
      data: expiredQuotes
    });
  } catch (error) {
    console.error('Get expired quotes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expired quotes',
      error: error.message
    });
  }
};

// @desc    Get quotes expiring soon (admin only)
// @route   GET /api/quotes/expiring-soon
// @access  Private/Admin
export const getExpiringSoonQuotes = async (req, res) => {
  try {
    const expiringSoonQuotes = await Quote.getExpiringSoonQuotes();

    res.json({
      success: true,
      data: expiringSoonQuotes
    });
  } catch (error) {
    console.error('Get expiring soon quotes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expiring quotes',
      error: error.message
    });
  }
};
