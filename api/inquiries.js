import Inquiry from '../backend/models/inquiry.model.js';
import { optionalProtect } from '../backend/middleware/auth.middleware.js';

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

        // Check if user is admin or the owner of the inquiry
        const isAdmin = ['admin', 'staff'].includes(req.user.role);
        const isOwner = inquiry.user_id === req.user.id;

        if (!isAdmin && !isOwner) {
          return res.status(403).json({
            success: false,
            message: 'Access denied'
          });
        }

        return res.status(200).json({
          success: true,
          data: inquiry
        });
      }

      // Check if getting specific user's inquiries
      if (query.endpoint === 'my') {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }

        const inquiries = await Inquiry.findByUserId(req.user.id);

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

      const updateData = req.body;
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
