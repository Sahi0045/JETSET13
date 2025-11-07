import Inquiry from '../models/inquiry.model.js';
import User from '../models/user.model.js';
import supabase from '../config/supabase.js';
// import Quote from '../models/quote.model.js';
import { sendEmail } from '../services/emailService.js';

// @desc    Create a new inquiry
// @route   POST /api/inquiries
// @access  Public
export const createInquiry = async (req, res) => {
  try {
    console.log('Received inquiry request:', req.body);
    console.log('User from auth:', req.user ? { id: req.user.id, email: req.user.email } : 'Not authenticated');

    let userId = req.user?.id || null;
    
    // If user_id is not set but user is authenticated, try to find user by email
    if (!userId && req.user?.email && req.body.customer_email) {
      try {
        const emailMatch = req.user.email.toLowerCase() === req.body.customer_email.toLowerCase();
        if (emailMatch) {
          const user = await User.findByEmail(req.user.email);
          if (user) {
            userId = user.id;
            console.log(`✅ Auto-linked inquiry to user by email: ${user.email}`);
          }
        }
      } catch (emailLookupError) {
        console.log('Could not auto-link by email:', emailLookupError.message);
      }
    }

    const inquiryData = {
      ...req.body,
      user_id: userId, // User association (from token or email match)
      status: 'pending',
      priority: 'normal'
    };

    // Remove any fields that shouldn't be set by client
    delete inquiryData.id;
    delete inquiryData.assigned_admin;
    delete inquiryData.internal_notes;
    delete inquiryData.created_at;
    delete inquiryData.updated_at;

    // Save inquiry to database
    const inquiry = await Inquiry.create(inquiryData);

    // Send confirmation email to customer (optional)
    try {
      await sendEmail({
        to: inquiry.customer_email,
        subject: 'Inquiry Received - JET SETTERS',
        template: 'inquiry_received',
        data: {
          customerName: inquiry.customer_name,
          inquiryType: inquiry.inquiry_type,
          inquiryId: inquiry.id
        }
      });
    } catch (emailError) {
      console.error('Failed to send inquiry confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    // Send notification email to admins (optional)
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@jetsetters.com',
        subject: 'New Travel Inquiry Received',
        template: 'admin_inquiry_notification',
        data: {
          customerName: inquiry.customer_name,
          customerEmail: inquiry.customer_email,
          inquiryType: inquiry.inquiry_type,
          inquiryId: inquiry.id
        }
      });
    } catch (emailError) {
      console.error('Failed to send admin notification email:', emailError);
    }

    res.status(201).json({
      success: true,
      data: inquiry,
      message: 'Your inquiry has been submitted successfully! Our travel experts will get back to you within 24 hours.'
    });
  } catch (error) {
    console.error('Create inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create inquiry',
      error: error.message
    });
  }
};

// @desc    Get all inquiries (admin only)
// @route   GET /api/inquiries
// @access  Private/Admin
export const getAllInquiries = async (req, res) => {
  try {
    const {
      status,
      inquiry_type,
      assigned_admin,
      priority,
      page = 1,
      limit = 10,
      sort = 'created_at:desc'
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (inquiry_type) filters.inquiry_type = inquiry_type;
    if (assigned_admin) filters.assigned_admin = assigned_admin;
    if (priority) filters.priority = priority;

    const options = {
      orderBy: sort,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    };

    const { inquiries, total } = await Inquiry.findAll(filters, options);

    res.json({
      success: true,
      data: inquiries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all inquiries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inquiries',
      error: error.message
    });
  }
};

// @desc    Get user's own inquiries
// @route   GET /api/inquiries/my
// @access  Private
export const getMyInquiries = async (req, res) => {
  try {
    // First, proactively find and link ALL unlinked inquiries matching user's email
    if (req.user.email) {
      try {
        // Find all inquiries with matching email but no user_id
        const { data: unlinkedInquiries, error: unlinkedError } = await supabase
          .from('inquiries')
          .select('id, customer_email')
          .ilike('customer_email', req.user.email)
          .is('user_id', null);

        if (!unlinkedError && unlinkedInquiries && unlinkedInquiries.length > 0) {
          console.log(`🔗 Auto-linking ${unlinkedInquiries.length} unlinked inquiry(ies) to user ${req.user.id}`);
          
          for (const inquiry of unlinkedInquiries) {
            try {
              await Inquiry.update(inquiry.id, { 
                user_id: req.user.id, 
                updated_at: new Date().toISOString() 
              });
              console.log(`✅ Linked inquiry ${inquiry.id.slice(-8)} to user`);
            } catch (linkErr) {
              console.warn(`⚠️ Failed to link inquiry ${inquiry.id.slice(-8)}:`, linkErr?.message);
            }
          }
        }
      } catch (linkCheckError) {
        console.warn('Error checking for unlinked inquiries:', linkCheckError.message);
      }
    }

    // Now fetch all inquiries (including newly linked ones)
    const inquiries = await Inquiry.findForUser(req.user.id, req.user.email);

    res.json({
      success: true,
      data: inquiries
    });
  } catch (error) {
    console.error('Get my inquiries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your inquiries',
      error: error.message
    });
  }
};

// @desc    Get inquiry by ID
// @route   GET /api/inquiries/:id
// @access  Private (own inquiry or admin)
export const getInquiryById = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);

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
        message: 'Not authorized to access this inquiry'
      });
    }

    res.json({
      success: true,
      data: inquiry
    });
  } catch (error) {
    console.error('Get inquiry by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inquiry',
      error: error.message
    });
  }
};

// @desc    Update inquiry (admin only)
// @route   PUT /api/inquiries/:id
// @access  Private/Admin
export const updateInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const allowedFields = [
      'status', 'assigned_admin', 'priority', 'internal_notes',
      'last_contacted_at'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    updateData.updated_at = new Date().toISOString();

    const updatedInquiry = await Inquiry.update(req.params.id, updateData);

    res.json({
      success: true,
      data: updatedInquiry,
      message: 'Inquiry updated successfully'
    });
  } catch (error) {
    console.error('Update inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update inquiry',
      error: error.message
    });
  }
};

// @desc    Delete inquiry (admin only)
// @route   DELETE /api/inquiries/:id
// @access  Private/Admin
export const deleteInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    await Inquiry.delete(req.params.id);

    res.json({
      success: true,
      message: 'Inquiry deleted successfully'
    });
  } catch (error) {
    console.error('Delete inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete inquiry',
      error: error.message
    });
  }
};

// @desc    Get inquiry statistics (admin only)
// @route   GET /api/inquiries/stats
// @access  Private/Admin
export const getInquiryStats = async (req, res) => {
  try {
    const stats = await Inquiry.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get inquiry stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inquiry statistics',
      error: error.message
    });
  }
};

// @desc    Assign inquiry to admin
// @route   PUT /api/inquiries/:id/assign
// @access  Private/Admin
export const assignInquiry = async (req, res) => {
  try {
    const { admin_id } = req.body;

    if (!admin_id) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID is required'
      });
    }

    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const updatedInquiry = await Inquiry.update(req.params.id, {
      assigned_admin: admin_id,
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      data: updatedInquiry,
      message: 'Inquiry assigned successfully'
    });
  } catch (error) {
    console.error('Assign inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign inquiry',
      error: error.message
    });
  }
};
