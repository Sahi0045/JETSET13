import Inquiry from '../models/inquiry.model.js';
import User from '../models/user.model.js';
import supabase from '../config/supabase.js';
// import Quote from '../models/quote.model.js';
import { sendEmail, generateInquiryReceivedTemplate, generateAdminInquiryNotificationTemplate } from '../services/emailService.js';

// @desc    Create a new inquiry
// @route   POST /api/inquiries
// @access  Public
export const createInquiry = async (req, res) => {
  try {
    console.log('📥 Received inquiry request:', {
      inquiry_type: req.body.inquiry_type,
      customer_email: req.body.customer_email,
      customer_name: req.body.customer_name
    });
    console.log('👤 User from auth:', req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : 'Not authenticated');

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
        console.log('⚠️ Could not auto-link by email:', emailLookupError.message);
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

    console.log('💾 Saving inquiry to database...');
    // Save inquiry to database
    const inquiry = await Inquiry.create(inquiryData);
    console.log('✅ Inquiry created successfully:', { id: inquiry.id, inquiry_type: inquiry.inquiry_type });

    // Send confirmation email to customer with professional template
    try {
      const customerEmailHtml = generateInquiryReceivedTemplate({
        customerName: inquiry.customer_name,
        inquiryType: inquiry.inquiry_type,
        inquiryId: inquiry.id,
        customerEmail: inquiry.customer_email
      });

      await sendEmail({
        to: inquiry.customer_email,
        subject: '✈️ Inquiry Received - JetSet Travel',
        html: customerEmailHtml
      });
      console.log('✅ Confirmation email sent to customer:', inquiry.customer_email);
    } catch (emailError) {
      console.error('❌ Failed to send inquiry confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    // Send notification email to admins with professional template
    try {
      const adminEmail = process.env.ADMIN_EMAIL || 'jetsetters721@gmail.com';
      
      const adminEmailHtml = generateAdminInquiryNotificationTemplate({
        customerName: inquiry.customer_name,
        customerEmail: inquiry.customer_email,
        inquiryType: inquiry.inquiry_type,
        inquiryId: inquiry.id,
        travelDetails: inquiry.travel_details || inquiry.message || 'No additional details provided'
      });

      await sendEmail({
        to: adminEmail,
        subject: '🔔 New Travel Inquiry - Action Required',
        html: adminEmailHtml
      });
      console.log('✅ Admin notification email sent to:', adminEmail);
    } catch (emailError) {
      console.error('❌ Failed to send admin notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      data: inquiry,
      message: 'Your inquiry has been submitted successfully! Our travel experts will get back to you within 24 hours.'
    });
  } catch (error) {
    console.error('❌ Create inquiry error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    
    // Provide more detailed error message in development
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Failed to create inquiry. Please try again or contact support.';
    
    res.status(500).json({
      success: false,
      message: 'Failed to create inquiry',
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.details,
        code: error.code 
      })
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

    // SIMPLE RULE: If inquiry appears in user's list, they can view it
    // Check if user is admin - always allow
    const isAdmin = req.user.role === 'admin' || req.user.role === 'staff';
    
    if (isAdmin) {
      console.log('✅ Admin access granted (Express)');
      // Return inquiry immediately for admin
      return res.json({
        success: true,
        data: inquiry
      });
    }
    
    // For regular users: use SAME logic as findForUser
    // findForUser returns inquiries where: user_id matches OR customer_email matches (ilike)
    const userEmail = req.user.email || req.user.user_email || (req.user.user_metadata && req.user.user_metadata.email);
    
    // Normalize emails for comparison (trim, lowercase, remove any whitespace)
    const normalizeEmail = (email) => {
      if (!email) return '';
      return String(email).trim().toLowerCase().replace(/\s+/g, '');
    };
    
    const normalizedUserEmail = normalizeEmail(userEmail);
    const normalizedInquiryEmail = normalizeEmail(inquiry.customer_email);
    
    const matchesByUserId = inquiry.user_id && req.user.id && String(inquiry.user_id) === String(req.user.id);
    const matchesByEmail = normalizedInquiryEmail && normalizedUserEmail && normalizedInquiryEmail === normalizedUserEmail;
    
    console.log('🔍 Access check (Express):', {
      inquiryId: req.params.id?.slice(-8),
      userId: req.user.id,
      userEmail: userEmail,
      normalizedUserEmail: normalizedUserEmail,
      inquiryUserId: inquiry.user_id,
      inquiryEmail: inquiry.customer_email,
      normalizedInquiryEmail: normalizedInquiryEmail,
      matchesByUserId,
      matchesByEmail,
      willAllow: matchesByUserId || matchesByEmail
    });

    if (!matchesByUserId && !matchesByEmail) {
      console.error('❌ Access denied (Express) - inquiry not owned by user', {
        reason: 'Neither user_id nor email match',
        userEmail: userEmail,
        inquiryEmail: inquiry.customer_email,
        userId: req.user.id,
        inquiryUserId: inquiry.user_id
      });
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this inquiry'
      });
    }
    
    console.log('✅ Access granted (Express) - inquiry matches user');
    
    // Auto-link inquiry if it matches by email but doesn't have user_id
    if (!inquiry.user_id && matchesByEmail) {
      try {
        await Inquiry.update(req.params.id, { 
          user_id: req.user.id,
          updated_at: new Date().toISOString()
        });
        console.log(`✅ Auto-linked inquiry ${req.params.id.slice(-8)} to user ${req.user.id}`);
      } catch (linkErr) {
        console.warn(`⚠️ Failed to auto-link inquiry:`, linkErr.message);
      }
    }

    res.json({
      success: true,
      data: inquiry
    });
  } catch (error) {
    console.error('Get inquiry by ID error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inquiry',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
