import Quote from '../backend/models/quote.model.js';
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
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const quoteData = req.body;
      const quote = await Quote.create(quoteData);

      return res.status(201).json({
        success: true,
        message: 'Quote created successfully',
        data: quote
      });
    }

    // PUT /api/quotes?id=xxx - Update a quote (admin only)
    if (method === 'PUT' && query.id) {
      if (!req.user || !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const updateData = req.body;
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


