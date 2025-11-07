import Quote from '../../../backend/models/quote.model.js';
import { optionalProtect } from '../../../backend/middleware/auth.middleware.js';

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

  const { method, query } = req;
  const { inquiryId } = query;

  try {
    // Run auth middleware
    await runMiddleware(req, res, optionalProtect);

    // GET /api/quotes/inquiry/[inquiryId] - Get quotes for an inquiry
    if (method === 'GET') {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const quotes = await Quote.findByInquiryId(inquiryId);

      return res.status(200).json({
        success: true,
        data: quotes || []
      });
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
