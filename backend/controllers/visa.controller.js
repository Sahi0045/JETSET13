import { VisaApplication, VisaConsultation, VisaRequirements, VisaMessage } from '../models/visa.model.js';
import { sendVisaApplicationConfirmation, sendVisaStatusUpdate } from '../services/emailService.js';
import supabase from '../config/supabase.js';
import crypto from 'crypto';
import axios from 'axios';
import { ARC_PAY_CONFIG, getArcPayAuthConfig } from '../routes/payment/arcpay.config.js';
import { reverseArcPaymentForOrder } from '../routes/payment/operations.handlers.js';

// Refund a paid visa application's service fee via ARC (VOID if unsettled, else REFUND),
// then mark the application 'refunded' + add a timeline note. Reuses the same gateway
// reversal helper as flights/membership. Returns the reversal result.
async function refundVisaApplication(app, reason = 'Visa application cancelled') {
  if (!app || app.payment_status !== 'paid') {
    return { reversed: false, refunded: false, action: 'NONE', reason: 'no captured payment to refund' };
  }
  const reversal = await reverseArcPaymentForOrder(app.application_ref, {
    amount: app.amount,
    currency: 'USD',
    reason,
  });
  if (reversal.reversed) {
    await VisaApplication.update(app.id, { payment_status: 'refunded' });
    await VisaApplication.addTimelineEvent(app.id, {
      status: app.status,
      note: `Service fee refunded (${reversal.action}).`,
      by: 'System',
    });
  }
  return { ...reversal, refunded: !!reversal.reversed };
}

// Map common country name variants to the canonical form stored in visa_requirements
// (so "USA"/"US"/"America" → "United States", "UK"/"Britain" → "United Kingdom", etc.).
const COUNTRY_ALIASES = {
  'usa': 'United States', 'us': 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
  'america': 'United States', 'united states of america': 'United States', 'the united states': 'United States',
  'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'britain': 'United Kingdom', 'great britain': 'United Kingdom',
  'england': 'United Kingdom', 'gb': 'United Kingdom',
  'uae': 'UAE', 'u.a.e.': 'UAE', 'united arab emirates': 'UAE', 'emirates': 'UAE', 'dubai': 'UAE',
  'korea': 'South Korea', 'south korea': 'South Korea',
  'bharat': 'India', 'hindustan': 'India',
  'prc': 'China', "people's republic of china": 'China',
};

function normalizeCountry(s) {
  if (!s) return s;
  const t = String(s).trim().replace(/\s+/g, ' ');
  return COUNTRY_ALIASES[t.toLowerCase()] || t;
}

// True if an ARC order has been captured/paid.
function isArcOrderPaid(order) {
  if (!order) return false;
  if (['CAPTURED', 'PARTIALLY_CAPTURED'].includes(order.status)) return true;
  const txns = Array.isArray(order.transaction) ? order.transaction : [];
  return txns.some((t) => {
    const type = t.transaction?.type;
    const ok = t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
    return ok && ['PAYMENT', 'CAPTURE'].includes(type);
  });
}

// ═══════════════════════════════════════════════════════════════
//  APPLICATION CONTROLLERS
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/visa/applications
 * Submit a new visa application.
 * Body: { personalInfo, travelDetails, serviceTier, userId?, documents?, paymentStatus? }
 */
export const submitApplication = async (req, res) => {
  try {
    console.log('--- submitApplication request body ---', JSON.stringify(req.body, null, 2));
    const { personalInfo, travelDetails, serviceTier, userId, documents, paymentStatus, notes } = req.body;

    // Basic validation
    if (!personalInfo || !travelDetails) {
      return res.status(400).json({
        success: false,
        message: 'personalInfo and travelDetails are required',
      });
    }

    const requiredPersonal = ['firstName', 'lastName', 'email', 'nationality', 'passportNumber'];
    const missing = requiredPersonal.filter((f) => !personalInfo[f]);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required personal info fields: ${missing.join(', ')}`,
      });
    }

    if (!travelDetails.destination) {
      return res.status(400).json({
        success: false,
        message: 'travelDetails.destination is required',
      });
    }

    // Use userId from body, or authUserId from token if available
    const effectiveUserId = userId || req.user?.authUserId;

    const application = await VisaApplication.create({
      personalInfo,
      travelDetails,
      serviceTier: serviceTier || 'standard',
      userId: effectiveUserId || null,
      documents: documents || null,
      paymentStatus: paymentStatus || 'pending',
      notes: notes || null,
    });

    console.log(`✅ Visa application created: ${application.application_ref}`);

    // Send confirmation email asynchronously
    sendVisaApplicationConfirmation(application).catch(err => {
      console.error('Failed to send initial visa confirmation email:', err);
    });

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: {
        id: application.id,
        applicationRef: application.application_ref,
        status: application.status,
        serviceTier: application.service_tier,
        amount: application.amount,
        createdAt: application.created_at,
      },
    });
  } catch (err) {
    console.error('submitApplication error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to submit application',
      error: process.env.NODE_ENV === 'development' ? err : undefined
    });
  }
};

/**
 * POST /api/visa/applications/:id/checkout
 * Create an ARC Pay hosted-checkout session for the application's service fee.
 * The application's `application_ref` is the ARC order id; `amount` comes from the
 * server-side tier price (never trust a client amount). Returns { checkoutUrl }.
 */
export const createApplicationCheckout = async (req, res) => {
  try {
    const { id } = req.params;
    const app = await VisaApplication.findById(id);
    if (!app) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    if (app.payment_status === 'paid') {
      return res.json({ success: true, alreadyPaid: true, message: 'This application is already paid.' });
    }

    const amount = parseFloat(app.amount || 0);
    if (!(amount > 0)) {
      return res.status(400).json({ success: false, message: 'No payable amount for this application.' });
    }

    // Return to wherever checkout started (localhost in dev, prod in prod).
    const origin = req.get('origin') || req.body?.returnOrigin || process.env.FRONTEND_URL || 'http://localhost:5173';
    const ref = app.application_ref;
    const authConfig = getArcPayAuthConfig();
    const sessionUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/session`;

    const resp = await axios.post(
      sessionUrl,
      {
        apiOperation: 'INITIATE_CHECKOUT',
        interaction: {
          operation: 'PURCHASE',
          returnUrl: `${origin}/visa/success?id=${app.id}&ref=${encodeURIComponent(ref)}&tier=${app.service_tier}&payment=success`,
          cancelUrl: `${origin}/visa/apply?payment=cancelled`,
          merchant: { name: 'Jetsetter Travel' },
          displayControl: { billingAddress: 'MANDATORY', customerEmail: 'MANDATORY' },
          timeout: 900,
        },
        order: {
          id: ref,
          reference: ref,
          amount: amount.toFixed(2),
          currency: 'USD',
          description: `Visa service (${app.service_tier}) - ${ref}`,
        },
        ...(app.personal_info?.email ? { customer: { email: app.personal_info.email } } : {}),
      },
      { headers: authConfig.headers, timeout: 30000 }
    );

    const sessionId = resp.data?.session?.id || resp.data?.sessionId || resp.data?.id;
    if (!sessionId) {
      console.error('Visa checkout: no session id from ARC', resp.data);
      return res.status(502).json({ success: false, message: 'Failed to create payment session.' });
    }

    return res.json({
      success: true,
      checkoutUrl: `https://api.arcpay.travel/checkout/pay/${sessionId}`,
      sessionId,
      orderId: ref,
      amount: amount.toFixed(2),
    });
  } catch (err) {
    console.error('createApplicationCheckout error:', err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to start payment.',
      error: err.response?.data?.error?.explanation || err.message,
    });
  }
};

/**
 * POST /api/visa/applications/:id/payment-complete
 * Verify the ARC order and mark the application paid. Idempotent — only flips a
 * still-pending application, and only when ARC confirms the order was captured.
 */
export const completeApplicationPayment = async (req, res) => {
  try {
    const { id } = req.params;
    let app = await VisaApplication.findById(id);
    if (!app && req.body?.ref) app = await VisaApplication.findByRef(req.body.ref);
    if (!app) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    if (app.payment_status === 'paid') {
      return res.json({ success: true, paymentStatus: 'paid', alreadyPaid: true });
    }

    const authConfig = getArcPayAuthConfig();
    const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${encodeURIComponent(app.application_ref)}`;
    const orderResp = await axios.get(orderUrl, {
      headers: authConfig.headers,
      timeout: 30000,
      validateStatus: () => true,
    });

    if (orderResp.status !== 200 || !isArcOrderPaid(orderResp.data)) {
      return res.json({ success: false, paymentStatus: 'pending', message: 'Payment not completed or still processing.' });
    }

    await VisaApplication.update(app.id, { payment_status: 'paid' });
    await VisaApplication.addTimelineEvent(app.id, {
      status: app.status, // keep current status; payment just funds the queue
      note: 'Payment received — your application is now in the processing queue.',
      by: 'System',
    });

    return res.json({ success: true, paymentStatus: 'paid' });
  } catch (err) {
    console.error('completeApplicationPayment error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Failed to verify payment.' });
  }
};

/**
 * GET /api/visa/admin/verify
 * Confirms the caller holds a real admin/agent token (route runs `protect`, which
 * verifies the JWT). The visa admin panel calls this on load so a spoofed/edited
 * localStorage session can't render the admin UI — only a server-validated admin can.
 */
export const verifyAdmin = async (req, res) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'agent') {
    return res.status(403).json({ success: false, message: 'Not authorized for the visa admin panel.' });
  }
  return res.json({ success: true, role, email: req.user?.email || req.user?.user_email || null });
};

/**
 * GET /api/visa/applications
 * List all applications (admin). Supports query filters:
 * ?status=&serviceTier=&priority=&destination=&limit=&offset=&orderBy=
 */
export const getApplications = async (req, res) => {
  try {
    const { status, serviceTier, priority, destination, paymentStatus, limit, offset, orderBy } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (serviceTier) filters.serviceTier = serviceTier;
    if (priority) filters.priority = priority;
    if (destination) filters.destination = destination;
    if (paymentStatus) filters.paymentStatus = paymentStatus;

    const options = {};
    if (limit) options.limit = limit;
    if (offset) options.offset = offset;
    if (orderBy) options.orderBy = orderBy;

    const { applications, total } = await VisaApplication.findAll(filters, options);

    return res.json({
      success: true,
      total,
      count: applications.length,
      data: applications,
    });
  } catch (err) {
    console.error('getApplications error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch applications',
    });
  }
};

/**
 * GET /api/visa/applications/stats
 * Aggregated statistics for admin dashboard.
 */
export const getStats = async (req, res) => {
  try {
    const [appStats, consultStats] = await Promise.all([
      VisaApplication.getStats(),
      VisaConsultation.getStats(),
    ]);

    return res.json({
      success: true,
      data: {
        applications: appStats,
        consultations: consultStats,
      },
    });
  } catch (err) {
    console.error('getStats error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch stats',
    });
  }
};

/**
 * GET /api/visa/applications/my
 * Get all applications for the authenticated user.
 * Requires userId query param or auth header (simplified — no auth middleware assumed).
 * ?userId=<uuid> or ?email=<email>
 */
export const getUserApplications = async (req, res) => {
  try {
    const { userId, email } = req.query;
    // Use authUserId and email from protect middleware if available
    const effectiveUserId = req.user?.authUserId || userId;
    const effectiveEmail = req.user?.email || email;

    if (!effectiveUserId && !effectiveEmail) {
      return res.status(400).json({
        success: false,
        message: 'userId or email query parameter is required (or must be authenticated)',
      });
    }

    // Use a Map to store unique applications by ID (to handle overlaps)
    const appsMap = new Map();

    // 1. Search by userId
    if (effectiveUserId) {
      const byId = await VisaApplication.findByUserId(effectiveUserId);
      byId.forEach(app => appsMap.set(app.id, app));
    }

    // 2. Search by email (as a robust fallback/supplement)
    if (effectiveEmail) {
      const byEmail = await VisaApplication.findByEmail(effectiveEmail);
      byEmail.forEach(app => appsMap.set(app.id, app));
    }

    // Final list sorted by newest first
    const applications = Array.from(appsMap.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    return res.json({
      success: true,
      total: applications.length,
      data: applications,
    });
  } catch (err) {
    console.error('getUserApplications error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch user applications',
    });
  }
};



/**
 * GET /api/visa/applications/track
 * Public endpoint to track an application by reference number and optional email.
 * ?ref=VISA-2026-00001&email=optional@email.com
 */
export const trackApplication = async (req, res) => {
  try {
    const { ref, email } = req.query;

    if (!ref && !email) {
      return res.status(400).json({
        success: false,
        message: 'ref (application reference) or email is required',
      });
    }

    let application = null;

    if (ref) {
      application = await VisaApplication.findByRef(ref);
    }

    // If not found by ref but email provided, try by email
    if (!application && email) {
      const results = await VisaApplication.findByEmail(email);
      application = results.length > 0 ? results : null;

      if (Array.isArray(application)) {
        return res.json({
          success: true,
          multiple: true,
          data: application,
        });
      }
    }

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'No application found with the provided reference or email',
      });
    }

    // Return public-safe fields only
    return res.json({
      success: true,
      data: {
        id: application.id,
        applicationRef: application.application_ref,
        status: application.status,
        priority: application.priority,
        serviceTier: application.service_tier,
        destination: application.travel_details?.destination,
        visaType: application.travel_details?.visaType,
        applicantName: `${application.personal_info?.firstName || ''} ${application.personal_info?.lastName || ''}`.trim(),
        submittedAt: application.created_at,
        lastUpdate: application.updated_at,
        timeline: application.timeline,
        documents: application.documents,
        amount: application.amount,
        paymentStatus: application.payment_status,
      },
    });
  } catch (err) {
    console.error('trackApplication error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to track application',
    });
  }
};

/**
 * GET /api/visa/applications/:id
 * Get full application details by UUID (admin or authenticated owner).
 */
export const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await VisaApplication.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    return res.json({
      success: true,
      data: application,
    });
  } catch (err) {
    console.error('getApplicationById error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch application',
    });
  }
};

/**
 * PUT /api/visa/applications/:id
 * Update application fields (admin).
 * Body: any updatable fields from the allowed list in the model.
 */
export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await VisaApplication.update(id, req.body);

    return res.json({
      success: true,
      message: 'Application updated successfully',
      data: updated,
    });
  } catch (err) {
    console.error('updateApplication error:', err);
    const status = err.message === 'Application not found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to update application',
    });
  }
};

/**
 * PATCH /api/visa/applications/:id/cancel
 * Cancel an application.
 */
export const cancelApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = req.body?.reason || 'Cancelled by applicant';

    const app = await VisaApplication.findById(id);
    if (!app) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // Staged refund policy: the service fee is refunded in full ONLY while the application
    // is still pre-processing. Once our team has started review/submission, refunds are
    // handled by staff (the admin Refund action) — mirrors Atlys/VisaHQ stage-based rules.
    const PRE_REVIEW = ['submitted', 'documents_pending', 'additional_info_required'];
    let refund = { refunded: false, action: 'NONE' };
    if (app.payment_status === 'paid' && PRE_REVIEW.includes(app.status)) {
      refund = await refundVisaApplication(app, `Applicant cancellation: ${reason}`);
    }

    const updated = await VisaApplication.cancel(id);

    return res.json({
      success: true,
      message: 'Application cancelled successfully',
      data: updated,
      refund: {
        refunded: refund.refunded,
        action: refund.action,
        note: refund.refunded
          ? 'Your visa service fee has been refunded to your original payment method.'
          : app.payment_status === 'paid'
            ? 'Your application is already in processing — service-fee refunds at this stage are handled by our team; please contact support.'
            : 'No payment on file to refund.',
      },
    });
  } catch (err) {
    console.error('cancelApplication error:', err);
    const status = err.message === 'Application not found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to cancel application',
    });
  }
};

/**
 * POST /api/visa/applications/:id/refund  (admin)
 * Discretionary / on-rejection refund of the service fee.
 */
export const refundApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = req.body?.reason || 'Refund issued by admin';

    const app = await VisaApplication.findById(id);
    if (!app) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    if (app.payment_status === 'refunded') {
      return res.json({ success: true, alreadyRefunded: true, message: 'Already refunded.' });
    }
    if (app.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'This application has no captured payment to refund.' });
    }

    const reversal = await refundVisaApplication(app, reason);
    if (!reversal.refunded) {
      return res.status(502).json({
        success: false,
        message: 'Refund could not be processed at the gateway. It may have already settled — try again shortly or contact support.',
        details: reversal,
      });
    }
    return res.json({ success: true, refunded: true, action: reversal.action, message: 'Refund issued.' });
  } catch (err) {
    console.error('refundApplication error:', err);
    return res.status(500).json({ success: false, message: 'Failed to issue refund.' });
  }
};

/**
 * POST /api/visa/applications/:id/documents
 * Update / add a document record on an application.
 * Body: { docName: string, status: 'pending'|'uploaded'|'verified'|'rejected', fileUrl?: string }
 */
export const uploadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { docName, status: docStatus, fileUrl } = req.body;

    if (!docName) {
      return res.status(400).json({ success: false, message: 'docName is required' });
    }

    const updated = await VisaApplication.updateDocument(id, docName, {
      status: docStatus || 'uploaded',
      file_url: fileUrl || null,
    });

    return res.json({
      success: true,
      message: 'Document updated successfully',
      data: updated,
    });
  } catch (err) {
    console.error('uploadDocument error:', err);
    const status = err.message === 'Application not found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to update document',
    });
  }
};

/**
 * POST /api/visa/applications/:id/timeline
 * Add a timeline event (admin action).
 * Body: { status, note, by }
 */
export const addTimelineEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { status: eventStatus, note, by } = req.body;

    if (!eventStatus) {
      return res.status(400).json({ success: false, message: 'status is required in request body' });
    }

    const updated = await VisaApplication.addTimelineEvent(id, {
      status: eventStatus,
      note: note || '',
      by: by || 'Admin',
    });

    // Notify the applicant of the status change (non-blocking).
    sendVisaStatusUpdate(updated, eventStatus, note).catch((e) =>
      console.error('Failed to send visa status email:', e.message));

    return res.json({
      success: true,
      message: 'Timeline event added successfully',
      data: updated,
    });
  } catch (err) {
    console.error('addTimelineEvent error:', err);
    const status = err.message === 'Application not found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to add timeline event',
    });
  }
};

/**
 * DELETE /api/visa/applications/:id
 * Permanently delete an application (admin only).
 */
export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    await VisaApplication.delete(id);

    return res.json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (err) {
    console.error('deleteApplication error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete application',
    });
  }
};

/**
 * POST /api/visa/applications/:id/resend-email
 */
export const resendConfirmationEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await VisaApplication.findById(id);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (!application.personal_info?.email) {
      return res.status(400).json({ success: false, message: 'No email address found for this application' });
    }

    await sendVisaApplicationConfirmation(application);

    return res.json({
      success: true,
      message: 'Confirmation email resent successfully',
    });
  } catch (err) {
    console.error('resendConfirmationEmail error:', err);
    const status = err.message === 'Application not found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to resend email',
    });
  }
};

// ═══════════════════════════════════════════════════════════════
//  CONSULTATION CONTROLLERS
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/visa/consultations
 * Book a new consultation slot.
 * Body: { consultantName, consultantRole, bookingDate, bookingTime, customerName, customerEmail, userId?, amount?, notes? }
 */
export const bookConsultation = async (req, res) => {
  try {
    const { consultantName, consultantRole, bookingDate, bookingTime, customerName, customerEmail } = req.body;

    const required = { consultantName, consultantRole, bookingDate, bookingTime, customerName, customerEmail };
    const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    const consultation = await VisaConsultation.create({
      ...req.body,
      userId: req.body.userId || req.user?.authUserId || null,
    });

    console.log(`✅ Visa consultation booked: ${consultation.id} — ${consultantName} on ${bookingDate} at ${bookingTime}`);

    return res.status(201).json({
      success: true,
      message: 'Consultation booked successfully',
      data: {
        id: consultation.id,
        consultantName: consultation.consultant_name,
        consultantRole: consultation.consultant_role,
        bookingDate: consultation.booking_date,
        bookingTime: consultation.booking_time,
        status: consultation.status,
        amount: consultation.amount,
        createdAt: consultation.created_at,
      },
    });
  } catch (err) {
    console.error('bookConsultation error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to book consultation',
    });
  }
};

/**
 * GET /api/visa/consultations
 * List all consultations (admin). Supports ?status=&date=&consultantName=&limit=&offset=
 */
export const getConsultations = async (req, res) => {
  try {
    const { status, date, consultantName, limit, offset, orderBy } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (date) filters.date = date;
    if (consultantName) filters.consultantName = consultantName;

    const options = {};
    if (limit) options.limit = limit;
    if (offset) options.offset = offset;
    if (orderBy) options.orderBy = orderBy;

    const { consultations, total } = await VisaConsultation.findAll(filters, options);

    return res.json({
      success: true,
      total,
      count: consultations.length,
      data: consultations,
    });
  } catch (err) {
    console.error('getConsultations error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch consultations',
    });
  }
};

/**
 * GET /api/visa/consultations/my
 * Get consultations for a user. ?userId=<uuid> or ?email=<email>
 */
export const getUserConsultations = async (req, res) => {
  try {
    const { userId, email } = req.query;
    // Use authUserId and email from protect middleware if available
    const effectiveUserId = req.user?.authUserId || userId;
    const effectiveEmail = req.user?.email || email;

    if (!effectiveUserId && !effectiveEmail) {
      return res.status(400).json({
        success: false,
        message: 'userId or email query parameter is required (or must be authenticated)',
      });
    }

    // Use a Map to store unique consultations by ID
    const consultationsMap = new Map();

    // 1. Search by userId
    if (effectiveUserId) {
      const byId = await VisaConsultation.findByUserId(effectiveUserId);
      byId.forEach(c => consultationsMap.set(c.id, c));
    }

    // 2. Search by email
    if (effectiveEmail) {
      const byEmail = await VisaConsultation.findByEmail(effectiveEmail);
      byEmail.forEach(c => consultationsMap.set(c.id, c));
    }

    // Final list sorted by newest first
    const consultations = Array.from(consultationsMap.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    return res.json({
      success: true,
      total: consultations.length,
      data: consultations,
    });

  } catch (err) {
    console.error('getUserConsultations error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch user consultations',
    });
  }
};

/**
 * GET /api/visa/consultations/:id
 * Get consultation by UUID.
 */
export const getConsultationById = async (req, res) => {
  try {
    const consultation = await VisaConsultation.findById(req.params.id);

    if (!consultation) {
      return res.status(404).json({ success: false, message: 'Consultation not found' });
    }

    return res.json({ success: true, data: consultation });
  } catch (err) {
    console.error('getConsultationById error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch consultation',
    });
  }
};

/**
 * PUT /api/visa/consultations/:id
 * Update a consultation (admin). Body: any updatable fields.
 */
export const updateConsultation = async (req, res) => {
  try {
    const updated = await VisaConsultation.update(req.params.id, req.body);

    return res.json({
      success: true,
      message: 'Consultation updated successfully',
      data: updated,
    });
  } catch (err) {
    console.error('updateConsultation error:', err);
    const status = err.message === 'Consultation not found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to update consultation',
    });
  }
};

/**
 * PATCH /api/visa/consultations/:id/cancel
 * Cancel a consultation.
 */
export const cancelConsultation = async (req, res) => {
  try {
    const updated = await VisaConsultation.cancel(req.params.id);

    return res.json({
      success: true,
      message: 'Consultation cancelled successfully',
      data: updated,
    });
  } catch (err) {
    console.error('cancelConsultation error:', err);
    const status = err.message === 'Consultation not found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to cancel consultation',
    });
  }
};

// ═══════════════════════════════════════════════════════════════
//  MESSAGING CONTROLLERS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/visa/applications/:id/messages
 */
export const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await VisaMessage.findByApplication(id);
    return res.json({ success: true, data: messages });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/visa/applications/:id/messages
 */
export const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await VisaMessage.create({
      ...req.body,
      applicationId: id,
    });
    return res.status(201).json({ success: true, data: message });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/visa/messages/threads
 * Admin messaging hub thread list.
 */
export const getMessageThreads = async (req, res) => {
  try {
    const threads = await VisaMessage.getThreadSummaries();
    return res.json({ success: true, data: threads });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
//  REQUIREMENTS CONTROLLERS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/visa/requirements/check
 * ?nationality=&destination=
 */
export const checkEligibility = async (req, res) => {
  try {
    const { nationality, destination } = req.query;
    if (!nationality || !destination) {
      return res.status(400).json({ success: false, message: 'nationality and destination are required' });
    }
    const nat = normalizeCountry(nationality);
    const dest = normalizeCountry(destination);
    const requirement = await VisaRequirements.check(nat, dest);

    // No published rule for this pair → don't show "nothing found". Return a helpful
    // "our experts will confirm" result so the user can still proceed to apply.
    if (!requirement) {
      return res.json({
        success: true,
        data: null,
        needsReview: true,
        normalized: { nationality: nat, destination: dest },
        message: `We don't have instant published requirements for ${nat} → ${dest} yet, but our visa experts will confirm the exact visa type, documents, fees and processing time for your trip. Start an application and we'll guide you through it.`,
      });
    }
    return res.json({ success: true, data: requirement, normalized: { nationality: nat, destination: dest } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/visa/requirements
 */
export const getRequirements = async (req, res) => {
  try {
    const { nationality, destination, active, search, limit, orderBy } = req.query;
    const { requirements, total } = await VisaRequirements.findAll(
      { nationality, destination, active: active === 'true' ? true : active === 'false' ? false : undefined, search },
      { limit, orderBy }
    );
    return res.json({ success: true, data: requirements, total });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/visa/requirements
 */
export const createRequirement = async (req, res) => {
  try {
    const requirement = await VisaRequirements.create(req.body);
    return res.status(201).json({ success: true, data: requirement });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/visa/requirements/:id
 */
export const updateRequirement = async (req, res) => {
  try {
    const requirement = await VisaRequirements.update(req.params.id, req.body);
    return res.json({ success: true, data: requirement });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
/**
 * POST /api/visa/upload
 * Internal utility to upload a file to Supabase Storage and return the URL.
 * Middleware: multer (req.file)
 */
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    const { buffer, originalname, mimetype } = req.file;
    const fileExt = originalname.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `documents/${fileName}`;
    const BUCKET = 'visa-documents';
    const contentType = mimetype || 'application/octet-stream';

    // IMPORTANT: upload the raw Buffer WITH an explicit contentType — do NOT wrap it in a
    // Blob. supabase-js sends a Blob as multipart/form-data; on some runtimes (notably
    // Vercel serverless) the storage backend stores that multipart envelope verbatim instead
    // of parsing it, so the saved "image" is actually `------formdata-undici-…\r\nContent-
    // Disposition…\r\n\r\n<png>` and won't render. A Buffer + contentType is sent as raw
    // bytes (no FormData), which is correct on every runtime.
    const doUpload = () =>
      supabase.storage.from(BUCKET).upload(filePath, buffer, { upsert: true, contentType });

    let { error: uploadError } = await doUpload();
    if (uploadError) {
      // Bucket missing — message casing/shape varies ("Bucket not found", 404). Create it
      // as PRIVATE (these are passport/bank documents — must not be public) and retry.
      const msg = (uploadError.message || '').toLowerCase();
      const missing = msg.includes('bucket not found') || `${uploadError.statusCode}` === '404' || uploadError.status === 404;
      if (missing) {
        await supabase.storage.createBucket(BUCKET, { public: false });
        ({ error: uploadError } = await doUpload());
      }
      if (uploadError) throw uploadError;
    }

    // Private bucket → return a short-lived signed URL for immediate preview, and store the
    // stable PATH (the frontend saves this as file_url). Viewing later re-signs on demand
    // via GET /api/visa/document-url, so links never become permanently public.
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60);

    return res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        path: filePath,
        url: signed?.signedUrl || null,
        fileName: originalname,
      },
    });
  } catch (err) {
    console.error('uploadFile error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to upload file',
    });
  }
};

/**
 * GET /api/visa/document-url?path=documents/<file>
 * Returns a short-lived signed URL to view a private document. `protect` ensures the
 * caller is authenticated (admin staff verifying, or the applicant). Also tolerates a
 * full legacy public URL by extracting the path.
 */
export const getDocumentUrl = async (req, res) => {
  try {
    let { path } = req.query;
    if (!path) return res.status(400).json({ success: false, message: 'path is required' });

    // Legacy/full-URL tolerance: pull the storage path out of a getPublicUrl-style URL.
    const marker = '/visa-documents/';
    if (path.includes(marker)) path = path.split(marker)[1].split('?')[0];

    const { data, error } = await supabase.storage
      .from('visa-documents')
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      return res.status(404).json({ success: false, message: 'Document not found or link could not be generated.' });
    }
    return res.json({ success: true, url: data.signedUrl });
  } catch (err) {
    console.error('getDocumentUrl error:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate document link.' });
  }
};
