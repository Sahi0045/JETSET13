import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import hotelRoutes from './routes/hotel.routes.js';
import flightRoutes from './routes/flight.routes.js';
import cruiseRoutes from './routes/cruise.routes.js';
import packageRoutes from './routes/package.routes.js';
import emailRoutes from './routes/email.routes.js';
import inquiryRoutes from './routes/inquiry.routes.js';
import quoteRoutes from './routes/quote.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import featureFlagRoutes from './routes/featureFlag.routes.js';
import geoRoutes from './routes/geo.routes.js';
import airportRoutes from './routes/airport.routes.js';
import visaRoutes from './routes/visa.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import pushRoutes from './routes/push.routes.js';
import adminRoutes from './routes/admin.routes.js';
import currencyRoutes from './routes/currency.routes.js';
import { checkQuoteExpirationHandler } from './jobs/checkQuoteExpiration.js';
import { startWorkflowEngine } from './jobs/workflowEngine.js';
import { startDataRetentionJob } from './jobs/dataRetention.job.js';
import { initializeDefaultTemplates } from './services/templateResponse.service.js';
// Shared stability modules (same behavior across all 3 entry points)
import './bootstrap/httpDefaults.js'; // global axios timeout safety net
import { validateEnv } from './config/validateEnv.js';
import { initMonitoring } from './services/monitoring.js';
import { installProcessGuards } from './bootstrap/processGuards.js';
import { apiLimiter, authLimiter, securityHeaders, responseCompression } from './middleware/security.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { readinessHandler } from './middleware/health.js';
// import
// const flightRoutes =re('./routes/flights');
// Load environment variables
dotenv.config();

// Fail fast on missing required config; warn on degraded features. Then init monitoring.
validateEnv();
initMonitoring();

const app = express();

// Behind a proxy (Render/Vercel) — trust first hop for correct client IPs / rate limiting
app.set('trust proxy', 1);

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
  origin: rawCorsOrigin === '*' ? true : (rawCorsOrigin ? rawCorsOrigin.split(',').map(o => o.trim()).filter(Boolean) : ['https://www.jetsetterss.com', 'https://jetsetterss.com']),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Security headers + response compression (before routes)
app.use(securityHeaders);
app.use(responseCompression);

app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limiting (general API + stricter on auth)
app.use(apiLimiter);
app.use('/api/auth', authLimiter);

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

// Health + deep readiness checks
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});
app.get('/api/health/ready', readinessHandler);

// Quote expiration check endpoint (manual trigger)
app.post('/api/jobs/check-quote-expiration', checkQuoteExpirationHandler);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/cruises', cruiseRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/feature-flags', featureFlagRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/airports', airportRoutes);
app.use('/api/visa', visaRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/currency', currencyRoutes);

// Bulk upload routes
import bulkUploadRoutes from './routes/bulkUpload.routes.js';
app.use('/api/bulk', bulkUploadRoutes);

// Template response routes
import templateRoutes from './routes/template.routes.js';
app.use('/api/templates', templateRoutes);

// Document templates routes
import documentRoutes from './routes/document.routes.js';
app.use('/api/documents', documentRoutes);

// Video tutorials routes
import videoRoutes from './routes/video.routes.js';
app.use('/api/videos', videoRoutes);

// Visa requirements routes
import visaRequirementsRoutes from './routes/visaRequirements.routes.js';
app.use('/api/visa-requirements', visaRequirementsRoutes);

// Simple GDPR routes (dynamic import to keep server.js clean)
app.get('/api/gdpr/my-data-summary',   async (req, res) => { const { getDataSummary }         = await import('./controllers/gdpr.controller.js'); return getDataSummary(req, res); });
app.get('/api/gdpr/export-data',       async (req, res) => { const { exportUserData }          = await import('./controllers/gdpr.controller.js'); return exportUserData(req, res); });
app.delete('/api/gdpr/delete-account', async (req, res) => { const { requestAccountDeletion }  = await import('./controllers/gdpr.controller.js'); return requestAccountDeletion(req, res); });
app.post('/api/gdpr/consent',          async (req, res) => { const { recordConsent }           = await import('./controllers/gdpr.controller.js'); return recordConsent(req, res); });


// Direct send-email endpoint (must match api/index.js implementation)
app.post('/api/send-email', async (req, res) => {
  try {
    console.log('📧 Direct email endpoint hit with data:', req.body);

    if (!process.env.RESEND_API_KEY) {
      console.error('📧 ERROR: Missing Resend API key');
      return res.status(500).json({ success: false, error: 'Missing email API key' });
    }

    let resend;
    try {
      // Use dynamic import for Resend to handle potential ESM/CJS issues
      const { Resend: ResendClient } = await import('resend');
      resend = new ResendClient(process.env.RESEND_API_KEY);
    } catch (importError) {
      console.error('📧 ERROR: Failed to initialize Resend:', importError);
      return res.status(500).json({ success: false, error: 'Failed to initialize email service' });
    }

    const { name, email, phone, type = 'callback', details = {} } = req.body;
    const adminEmail = 'jetsetters721@gmail.com';
    const preferredTime = details.preferredTime || 'Not specified';
    const message = details.message || '';

    const customerHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0066b2, #1e88e5); padding: 28px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">🛳️ Your Callback Request Is Confirmed!</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Jetsetters Travel Experts</p>
        </div>
        <div style="padding: 24px; background-color: #f9f9f9;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${name}</strong>,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6;">Thank you for reaching out! We've received your <strong>${type}</strong> callback request and our travel specialist will contact you soon.</p>
          <div style="background: white; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066b2;">
            <h3 style="margin: 0 0 14px; font-size: 14px; text-transform: uppercase; color: #0066b2;">Your Request Summary</h3>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Phone:</strong> ${phone}</p>
            ${email ? `<p style="margin: 6px 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>` : ''}
            <p style="margin: 6px 0; font-size: 14px;"><strong>Preferred Call Time:</strong> ${preferredTime}</p>
            ${message ? `<p style="margin: 6px 0; font-size: 14px;"><strong>Message:</strong> ${message}</p>` : ''}
          </div>
          <p style="font-size: 14px; color: #666;">Questions? Reach us at <strong>support@jetsetterss.com</strong> or <strong>(877) 538-7380</strong>.</p>
          <p style="font-size: 15px; color: #333;">Best regards,<br>The Jetsetters Team 🌍</p>
        </div>
        <div style="padding: 16px; text-align: center; font-size: 12px; color: #999; background: #f1f1f1; border-radius: 0 0 12px 12px;">
          <p style="margin: 0;">© 2026 Jetsetters. All rights reserved.</p>
        </div>
      </div>
    `;

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">🔔 New Callback Request</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">${type.toUpperCase()} Inquiry</p>
        </div>
        <div style="padding: 16px 24px; background: #fffbeb; border-left: 4px solid #eab308;">
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #713f12;">⚡ Action Required: Please call the customer within 24 hours</p>
        </div>
        <div style="padding: 24px; background: #f9f9f9;">
          <div style="background: #e0f2fe; padding: 18px; border-radius: 10px;">
            <h3 style="margin: 0 0 14px; font-size: 13px; color: #0369a1; text-transform: uppercase;">Customer Details</h3>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Email:</strong> ${email || 'Not provided'}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Phone:</strong> ${phone}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Preferred Call Time:</strong> ${preferredTime}</p>
            ${message ? `<p style="margin: 6px 0; font-size: 14px;"><strong>Message:</strong> ${message}</p>` : ''}
            <p style="margin: 6px 0; font-size: 14px;"><strong>Submitted:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
          </div>
        </div>
        <div style="padding: 14px; text-align: center; font-size: 12px; color: #999; background: #f1f1f1; border-radius: 0 0 12px 12px;">
          <p style="margin: 0;">Jetsetters Admin Notification</p>
        </div>
      </div>
    `;

    const results = [];

    if (email) {
      try {
        const customerResult = await resend.emails.send({
          from: 'Jetsetters <noreply@jetsetterss.com>',
          to: [email],
          subject: `✅ Your ${type.charAt(0).toUpperCase() + type.slice(1)} Callback Request - Confirmed!`,
          html: customerHtml,
        });
        console.log('📧 Customer email sent:', customerResult);
        results.push({ recipient: 'customer', data: customerResult });
      } catch (err) {
        console.warn('⚠️ Customer email failed:', err.message);
      }
    }

    try {
      const adminResult = await resend.emails.send({
        from: 'Jetsetters Notifications <noreply@jetsetterss.com>',
        to: [adminEmail],
        subject: `🆕 New ${type.toUpperCase()} Callback Request from ${name}`,
        html: adminHtml,
      });
      console.log('📧 Admin email sent:', adminResult);
      results.push({ recipient: 'admin', data: adminResult });
    } catch (err) {
      console.warn('⚠️ Admin email failed:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: results.length > 0
        ? `Emails sent to: ${results.map(r => r.recipient).join(', ')}`
        : 'Callback saved but no emails could be sent',
      data: results,
    });
  } catch (error) {
    console.error('📧 Error in send-email endpoint:', error);
    return res.status(200).json({
      success: true,
      message: 'Callback saved, but email service encountered an error',
      error: error.message,
    });
  }
});

// 404 for unmatched routes (must be after all routes)
app.use(notFoundHandler);

// Central error handler (must be last) — logs, reports 5xx to monitoring
app.use(errorHandler);

const PORT = process.env.PORT || 5004;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Allowed Origins:', corsOptions.origin.toString());
  console.log('API Base URL:', '/api');

  // Start automated workflow engine (auto-assign, SLA, escalation, retention)
  if (process.env.NODE_ENV !== 'test') {
    startWorkflowEngine().catch(e => console.error('[Workflow] Engine failed to start:', e.message));
    try { startDataRetentionJob(24); } catch(e) { console.error('[Retention] Job failed to start:', e.message); }

    // Initialize default email templates
    initializeDefaultTemplates().catch(e => console.error('[Templates] Init failed:', e.message));
  }
});

// Crash guards + graceful shutdown (drain in-flight requests on SIGTERM/SIGINT)
installProcessGuards({ server });
