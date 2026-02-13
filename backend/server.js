import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import hotelRoutes from './routes/hotel.routes.js';
import flightRoutes from './routes/flight.routes.js';
import cruiseRoutes from './routes/cruise.routes.js';
import emailRoutes from './routes/email.routes.js';
import inquiryRoutes from './routes/inquiry.routes.js';
import quoteRoutes from './routes/quote.routes.js';
import featureFlagRoutes from './routes/featureFlag.routes.js';
import geoRoutes from './routes/geo.routes.js';
import airportRoutes from './routes/airport.routes.js';
import { checkQuoteExpirationHandler } from './jobs/checkQuoteExpiration.js';
// import 
// const flightRoutes =re('./routes/flights');
// Load environment variables
dotenv.config();

const app = express();

// Debugging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  if (process.env.NODE_ENV === 'development') {
    const redactedHeaders = { ...req.headers };
    if (redactedHeaders.authorization) {
      redactedHeaders.authorization = 'Bearer ***';
    }
    if (redactedHeaders.cookie) {
      redactedHeaders.cookie = '***';
    }

    const redactedBody = req.body ? { ...req.body } : undefined;
    if (redactedBody) {
      if (redactedBody.password) redactedBody.password = '***';
      if (redactedBody.cardDetails) {
        redactedBody.cardDetails = {
          ...redactedBody.cardDetails,
          cardNumber: redactedBody.cardDetails.cardNumber ? '***' : undefined,
          cvv: redactedBody.cardDetails.cvv ? '***' : undefined
        };
      }
      if (redactedBody.cardNumber) redactedBody.cardNumber = '***';
      if (redactedBody.cvv) redactedBody.cvv = '***';
    }

    console.log('Headers:', redactedHeaders);
    if (redactedBody) {
      console.log('Body:', redactedBody);
    }
  }

  next();
});

// CORS configuration
const rawCorsOrigin = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || '').trim();

const corsOptions = {
  origin: rawCorsOrigin === '*' ? true : (rawCorsOrigin ? rawCorsOrigin.split(',').map(o => o.trim()).filter(Boolean) : ['https://www.jetsetterss.com']),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test route
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    cors: {
      origin: req.headers.origin,
      allowedOrigins: corsOptions.origin
    }
  });
});

// Quote expiration check endpoint (manual trigger)
app.post('/api/jobs/check-quote-expiration', checkQuoteExpirationHandler);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/cruises', cruiseRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/feature-flags', featureFlagRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/airports', airportRoutes);

// 404 handler for undefined routes (must be after all routes)
app.use((req, res, next) => {
  console.log('404 - Route not found:', req.method, req.path);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  if (err.message.includes('Not allowed by CORS')) {
    return res.status(403).json({
      success: false,
      message: 'CORS error: Origin not allowed',
      allowedOrigins: corsOptions.origin
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Allowed Origins:', corsOptions.origin.toString());
  console.log('API Base URL:', '/api');
}); 
