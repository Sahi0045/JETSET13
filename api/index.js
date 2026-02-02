// Unified Vercel serverless function handler
// This consolidates all API routes into a single function to avoid the 12-function limit

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import route handlers
import authRoutes from '../backend/routes/auth.routes.js';
import userRoutes from '../backend/routes/user.routes.js';
import emailRoutes from '../backend/routes/email.routes.js';
import flightRoutes from '../backend/routes/flight.routes.js';
import hotelRoutes from '../backend/routes/hotel.routes.js';
import paymentRoutes from '../backend/routes/payment.routes.js';
import inquiryRoutes from '../backend/routes/inquiry.routes.js';
import quoteRoutes from '../backend/routes/quote.routes.js';
import cruiseRoutes from '../backend/routes/cruise.routes.js';
import supabaseAuthRoutes from '../backend/routes/supabaseAuth.js';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-csrf-token'],
  credentials: true
}));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/cruises', cruiseRoutes);
app.use('/api/supabase-auth', supabaseAuthRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Export for Vercel serverless
export default app;
