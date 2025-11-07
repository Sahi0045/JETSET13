import Inquiry from '../../backend/models/inquiry.model.js';
import { optionalProtect } from '../../backend/middleware/auth.middleware.js';

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
  const { id } = query;

  try {
    // Run auth middleware
    await runMiddleware(req, res, optionalProtect);

    // GET /api/inquiries/[id] - Get inquiry by ID
    if (method === 'GET') {
      // Check if user has permission (admin or owner)
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const inquiry = await Inquiry.findById(id);

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

    // PATCH/PUT /api/inquiries/[id] - Update inquiry
    if (method === 'PATCH' || method === 'PUT') {
      // Only admin can update inquiries
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const updateData = req.body;
      const inquiry = await Inquiry.update(id, updateData);

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

    // DELETE /api/inquiries/[id] - Delete inquiry
    if (method === 'DELETE') {
      // Only admin can delete inquiries
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      await Inquiry.delete(id);

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
