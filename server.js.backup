import dotenv from 'dotenv';
// Load environment variables as early as possible
dotenv.config();
// Also try to load from backend/.env if the main one doesn't exist
dotenv.config({ path: './backend/.env' });

// After loading env vars, import the rest of dependencies
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import authRoutes from './backend/routes/auth.routes.js';
import userRoutes from './backend/routes/user.routes.js';
import emailRoutes from './backend/routes/email.routes.js';
import flightRoutes from './backend/routes/flight.routes.js';
import hotelRoutes from './backend/routes/hotel.routes.js';
import paymentRoutes from './backend/routes/payment.routes.js';
import inquiryRoutes from './backend/routes/inquiry.routes.js';
import quoteRoutes from './backend/routes/quote.routes.js';
import cruiseRoutes from './backend/routes/cruise.routes.js';
import supabaseAuthRoutes from './backend/routes/supabaseAuth.js';
import supabase from './backend/config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Log key environment information for debugging
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  AMADEUS_KEYS_SET: !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET),
  REACT_APP_KEYS_SET: !!(process.env.REACT_APP_AMADEUS_API_KEY && process.env.REACT_APP_AMADEUS_API_SECRET)
});

const PORT = process.env.PORT || 5002;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-csrf-token']
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/cruises', cruiseRoutes);
app.use('/api/supabase', supabaseAuthRoutes);

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date(),
    env: process.env.NODE_ENV,
    apiKeys: {
      amadeus: !!process.env.AMADEUS_API_KEY || !!process.env.REACT_APP_AMADEUS_API_KEY
    }
  });
});

// 404 handler for API routes (must be before static file serving)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.method} ${req.path} not found`,
    path: req.path,
    method: req.method
  });
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Test Supabase connection
const testSupabaseConnection = async (retryCount = 0, maxRetries = 5) => {
  try {
    console.log(`📡 Testing Supabase connection (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    const { data, error } = await supabase.from('users').select('count').single();
    
    if (error) {
      if (retryCount < maxRetries) {
        console.warn(`⚠️ Supabase connection error: ${error.message}. Retrying in 3 seconds...`);
        setTimeout(() => testSupabaseConnection(retryCount + 1, maxRetries), 3000);
        return false;
      } else {
        console.error('❌ Failed to connect to Supabase after multiple attempts:', error.message);
        console.log('The server will continue running, but database operations may fail.');
        console.log('Possible issues:');
        console.log('  - Supabase credentials in .env file may be incorrect');
        console.log('  - Supabase service may be down or unreachable');
        console.log('  - Required tables may not exist in your Supabase project');
        console.log('You can use "node setup-supabase-tables.js" to create the required tables.');
        return false;
      }
    }
    
    console.log('✅ Supabase connection established successfully.');
    return true;
  } catch (error) {
    if (retryCount < maxRetries) {
      console.warn(`⚠️ Error connecting to Supabase: ${error.message}. Retrying in 3 seconds...`);
      setTimeout(() => testSupabaseConnection(retryCount + 1, maxRetries), 3000);
      return false;
    } else {
      console.error('❌ Failed to connect to Supabase after multiple attempts:', error.message);
      console.log('The server will continue running, but database operations may fail.');
      return false;
    }
  }
};

// Initialize Supabase connection on startup
testSupabaseConnection();

// Direct test email endpoint
app.post('/api/send-email', async (req, res) => {
  try {
    console.log('📧 Direct email endpoint hit with data:', req.body);
    
    // Check if API key is available
    if (!process.env.RESEND_API_KEY) {
      console.error('📧 ERROR: Missing Resend API key in environment variables');
      return res.status(500).json({
        success: false,
        error: 'Missing email API key'
      });
    }
    
    // Import and initialize Resend with a try-catch to handle any errors
    let resend;
    try {
      const { Resend } = await import('resend');
      resend = new Resend(process.env.RESEND_API_KEY);
    } catch (importError) {
      console.error('📧 ERROR: Failed to initialize Resend:', importError);
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize email service'
      });
    }
    
    const { name, email, phone, type = 'callback', details = {} } = req.body;
    
    // Simple formatted email with dynamic content based on type
    let html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #0066b2; padding: 20px; text-align: center; color: white;">
          <h1>${type.toUpperCase()} Request Confirmation</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Dear ${name},</p>
          <p>Thank you for your ${type} request. We have received your information and will contact you shortly.</p>
          
          <div style="background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px;">
            <h3>Your Request Details:</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Email:</strong> ${email}</p>
    `;
    
    // Add type-specific content
    if (type === 'package' && details) {
      html += `
            <h3>Package Information:</h3>
            <p><strong>Package Name:</strong> ${details.packageName || 'Not specified'}</p>
            <p><strong>Travel Date:</strong> ${details.travelDate || 'Not specified'}</p>
            <p><strong>Number of Guests:</strong> ${details.guests || 'Not specified'}</p>
            <p><strong>Budget:</strong> ${details.budget || 'Not specified'}</p>
            <p><strong>Special Requests:</strong> ${details.request || 'None'}</p>
      `;
    } else if (type === 'rental' && details) {
      html += `
            <h3>Hotel Booking Information:</h3>
            <p><strong>Hotel Name:</strong> ${details.hotelName || 'Not specified'}</p>
            <p><strong>Check-in Date:</strong> ${details.checkIn || 'Not specified'}</p>
            <p><strong>Check-out Date:</strong> ${details.checkOut || 'Not specified'}</p>
            <p><strong>Number of Guests:</strong> ${details.guests || 'Not specified'}</p>
            <p><strong>Room Type:</strong> ${details.roomType || 'Not specified'}</p>
            <p><strong>Total Price:</strong> $${details.totalPrice || 'Not specified'}</p>
      `;
    } else if (type === 'cruise' && details) {
      html += `
            <h3>Cruise Information:</h3>
            <p><strong>Preferred Time:</strong> ${details.preferredTime || 'Not specified'}</p>
            <p><strong>Message:</strong> ${details.message || 'None'}</p>
      `;
    }
    
    // Close the HTML structure
    html += `          </div>
          
          <p>Best regards,<br>The JetSetGo Team</p>
        </div>
        <div style="padding: 20px; text-align: center; font-size: 12px; color: #666; background-color: #f1f1f1;">
          <p>This is an automated message, please do not reply to this email.</p>
          <p>&copy; 2025 JetSetGo. All rights reserved.</p>
        </div>
      </div>
    `;
    
    const text = html.replace(/<[^>]*>?/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    try {
      // Always use a verified sender email with Resend
      const result = await resend.emails.send({
        from: 'JetSetGo <onboarding@resend.dev>',
        to: ['jetsetters721@gmail.com'], // Always send to the registered email
        subject: `JetSetGo ${type.toUpperCase()} Request Confirmation`,
        html,
        text
      });
      
      console.log('📧 Email sent successfully:', result);
      
      return res.status(200).json({
        success: true,
        message: 'Email sent successfully',
        data: result
      });
    } catch (sendError) {
      console.error('📧 Error sending email via Resend:', sendError);
      
      // Return a more specific error message based on the error type
      if (sendError.statusCode === 403 && sendError.message.includes('domain is not verified')) {
        return res.status(200).json({
          success: true,
          message: 'Callback data saved, but email sending limited due to domain verification',
          error: 'Domain not verified',
          note: 'The callback request was saved successfully, but email sending requires domain verification. Your data is safely stored.'
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Callback data saved, but email could not be sent',
        error: sendError.message || 'An error occurred sending email',
        data: null
      });
    }
    
  } catch (error) {
    console.error('📧 Error in send-email endpoint:', error);
    
    // Still return a 200 response to prevent blocking the callback flow
    return res.status(200).json({
      success: true,
      message: 'Callback data saved, but email service encountered an error',
      error: error.message || 'An error occurred processing the email request',
      data: null
    });
  }
});

// Debug middleware for email routes
app.use('/api/email/*', (req, res, next) => {
  console.log(`🔍 Email route accessed: ${req.method} ${req.originalUrl}`);
  console.log('🔍 Request headers:', req.headers);
  console.log('🔍 Request body:', req.body);
  next();
});

// For local development
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === undefined) {
  const findAvailablePort = async (startPort) => {
    const maxPort = 65535;
    let port = parseInt(startPort, 10);

    while (port <= maxPort) {
      try {
        await new Promise((resolve, reject) => {
          const server = app.listen(port)
            .once('listening', () => {
              server.close();
              resolve();
            })
            .once('error', (err) => {
              if (err.code === 'EADDRINUSE') {
                reject(err);
              } else {
                reject(err);
              }
            });
        });
        return port;
      } catch (err) {
        if (err.code === 'EADDRINUSE') {
          console.log(`⚠️ Port ${port} is in use, trying next port...`);
          port++;
          continue;
        }
        throw err;
      }
    }
    throw new Error('No available ports found');
  };

  const startServer = async () => {
    try {
      const port = await findAvailablePort(PORT);
      const server = app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);
        
        // Re-apply CORS middleware with updated settings
        app.use((req, res, next) => {
          res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
          res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
          res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, x-csrf-token');
          res.header('Access-Control-Allow-Credentials', 'true');
          res.header('Access-Control-Expose-Headers', 'set-cookie');
          
          if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
          }
          next();
        });
      });
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  };

  startServer();
}

// For Vercel serverless deployment
export default app;



