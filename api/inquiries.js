import Inquiry from '../backend/models/inquiry.model.js';
import { optionalProtect } from '../backend/middleware/auth.middleware.js';
import { sendInquiryEmails } from '../backend/services/email.service.js';

// Note: Supabase connection is already initialized in inquiry.model.js

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
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
    // POST /api/inquiries - Create new inquiry
    if (method === 'POST') {
      // Run auth middleware (optional - allows both authenticated and guest)
      await runMiddleware(req, res, optionalProtect);

      const inquiryData = req.body;

      // If user is authenticated, associate inquiry with user
      if (req.user) {
        inquiryData.user_id = req.user.id;
        inquiryData.customer_email = req.user.email;
        inquiryData.customer_name = req.user.firstName && req.user.lastName
          ? `${req.user.firstName} ${req.user.lastName}`
          : inquiryData.customer_name;

        console.log('✅ Creating authenticated inquiry for user:', req.user.email);
      } else {
        console.log('ℹ️ Creating guest inquiry');
      }

      // Create inquiry
      const inquiry = await Inquiry.create(inquiryData);

      // Send email notifications (non-blocking - don't fail if emails fail)
      console.log('📧 Triggering email notifications for inquiry:', inquiry.id);
      sendInquiryEmails(inquiry).catch(emailError => {
        // Log error but don't fail the request
        console.error('⚠️ Email notification error (non-blocking):', emailError.message);
      });

      return res.status(201).json({
        success: true,
        message: 'Your inquiry has been submitted successfully! Our travel experts will get back to you within 24 hours.',
        data: { inquiry }
      });
    }

    // GET /api/inquiries - Get all inquiries (admin only) or user's inquiries
    if (method === 'GET') {
      // Run auth middleware
      await runMiddleware(req, res, optionalProtect);

      // Check if getting a specific inquiry by ID
      if (query.id) {
        try {
          if (!req.user) {
            return res.status(401).json({
              success: false,
              message: 'Authentication required'
            });
          }

          const inquiry = await Inquiry.findById(query.id);

          if (!inquiry) {
            return res.status(404).json({
              success: false,
              message: 'Inquiry not found'
            });
          }

          // SIMPLE RULE: If inquiry appears in user's list, they can view it
          // Check if user is admin - always allow
          const isAdmin = ['admin', 'staff'].includes(req.user.role);

          if (isAdmin) {
            console.log('✅ Admin access granted');
            // Return inquiry immediately for admin
            return res.status(200).json({
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

          console.log('🔍 Access check:', {
            inquiryId: query.id?.slice(-8),
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
            console.error('❌ Access denied - inquiry not owned by user', {
              reason: 'Neither user_id nor email match',
              userEmail: userEmail,
              inquiryEmail: inquiry.customer_email,
              userId: req.user.id,
              inquiryUserId: inquiry.user_id
            });
            return res.status(403).json({
              success: false,
              message: 'Access denied'
            });
          }

          console.log('✅ Access granted - inquiry matches user');

          // Auto-link inquiry if it matches by email but doesn't have user_id
          if (!inquiry.user_id && matchesByEmail) {
            try {
              await Inquiry.update(query.id, {
                user_id: req.user.id,
                updated_at: new Date().toISOString()
              });
              console.log(`✅ Auto-linked inquiry ${query.id.slice(-8)} to user ${req.user.id}`);
            } catch (linkErr) {
              console.warn(`⚠️ Failed to auto-link inquiry:`, linkErr.message);
            }
          }

          return res.status(200).json({
            success: true,
            data: inquiry
          });
        } catch (error) {
          console.error('❌ Error fetching inquiry by ID:', error.message);
          console.error('Error stack:', error.stack);
          return res.status(500).json({
            success: false,
            message: 'Failed to fetch inquiry',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
          });
        }
      }

      // Check if getting specific user's inquiries
      if (query.endpoint === 'my') {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }

        // Use findForUser to get inquiries by both user_id AND email (same as Express route)
        const userEmail = req.user.email || req.user.user_email || (req.user.user_metadata && req.user.user_metadata.email);
        const inquiries = await Inquiry.findForUser(req.user.id, userEmail);

        return res.status(200).json({
          success: true,
          data: inquiries // Return array directly for consistency
        });
      }

      // Check if getting stats
      if (query.endpoint === 'stats') {
        if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
          return res.status(403).json({
            success: false,
            message: 'Admin access required'
          });
        }

        const stats = await Inquiry.getStats();

        return res.status(200).json({
          success: true,
          data: stats
        });
      }

      // Admin - get all inquiries with filters
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const limit = parseInt(query.limit) || 50;
      const sort = query.sort || 'created_at:desc';

      const result = await Inquiry.findAll({}, {
        orderBy: sort,
        limit: limit
      });

      return res.status(200).json({
        success: true,
        data: { inquiries: result.inquiries || result }
      });
    }

    // PUT/PATCH /api/inquiries?id=xxx - Update inquiry
    if (method === 'PUT' || method === 'PATCH') {
      await runMiddleware(req, res, optionalProtect);

      if (!query.id) {
        return res.status(400).json({
          success: false,
          message: 'Inquiry ID is required'
        });
      }

      // Only admin can update inquiries
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      // Whitelist of allowed fields for update
      const allowedFields = [
        'status',
        'priority',
        'assigned_admin',
        'internal_notes',
        'last_contacted_at'
      ];

      // Valid values for status and priority
      const validStatuses = ['pending', 'processing', 'quoted', 'booked', 'cancelled', 'expired'];
      const validPriorities = ['low', 'normal', 'high', 'urgent'];

      // Filter and clean update data
      const updateData = {};
      const rawData = req.body;

      allowedFields.forEach(field => {
        if (rawData[field] !== undefined) {
          // Validate status
          if (field === 'status' && rawData[field] && !validStatuses.includes(rawData[field])) {
            console.warn(`Invalid status value: ${rawData[field]}, skipping`);
            return;
          }

          // Validate priority
          if (field === 'priority' && rawData[field] && !validPriorities.includes(rawData[field])) {
            console.warn(`Invalid priority value: ${rawData[field]}, skipping`);
            return;
          }

          // Convert empty strings to null for optional fields
          if (rawData[field] === '' && (field === 'assigned_admin' || field === 'priority')) {
            updateData[field] = null;
          } else if (rawData[field] === '' && field === 'internal_notes') {
            updateData[field] = null;
          } else if (rawData[field] === '' && field === 'status') {
            // Status should not be empty, skip if empty
            return;
          } else {
            updateData[field] = rawData[field];
          }
        }
      });

      // Add updated_at timestamp
      updateData.updated_at = new Date().toISOString();

      // Validate that at least one field is being updated
      if (Object.keys(updateData).length === 1 && updateData.updated_at) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      try {
        const inquiry = await Inquiry.update(query.id, updateData);

        if (!inquiry) {
          return res.status(404).json({
            success: false,
            message: 'Inquiry not found'
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Inquiry updated successfully',
          data: inquiry
        });
      } catch (updateError) {
        console.error('Error updating inquiry:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update inquiry',
          error: process.env.NODE_ENV === 'development' ? updateError.message : 'Internal server error'
        });
      }
    }

    // DELETE /api/inquiries?id=xxx - Delete inquiry
    if (method === 'DELETE') {
      await runMiddleware(req, res, optionalProtect);

      if (!query.id) {
        return res.status(400).json({
          success: false,
          message: 'Inquiry ID is required'
        });
      }

      // Only admin can delete inquiries
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      await Inquiry.delete(query.id);

      return res.status(200).json({
        success: true,
        message: 'Inquiry deleted successfully'
      });
    }

    // Method not allowed
    return res.status(405).json({
      success: false,
      message: `Method ${method} not allowed`
    });

  } catch (error) {
    console.error('Inquiry API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}
