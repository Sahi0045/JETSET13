import Inquiry from '../../backend/models/inquiry.model.js';
import { protect, admin } from '../../backend/middleware/auth.middleware.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { method } = req;

  try {
    // Only allow GET requests
    if (method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: `Method ${method} not allowed`
      });
    }

    // Run auth middleware (require authentication)
    await runMiddleware(req, res, protect);

    // Check if user is admin
    if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Get inquiry statistics
    const stats = await Inquiry.getStats();

    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Inquiry stats API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}
