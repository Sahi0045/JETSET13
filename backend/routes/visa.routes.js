import express from 'express';
import multer from 'multer';
import { protect, admin, optionalProtect } from '../middleware/auth.middleware.js';
import {
  // Application controllers
  submitApplication,
  getApplications,
  getStats,
  getUserApplications,
  trackApplication,
  getApplicationById,
  updateApplication,
  cancelApplication,
  uploadDocument,
  addTimelineEvent,
  resendConfirmationEmail,
  deleteApplication,
  createApplicationCheckout,
  completeApplicationPayment,
  verifyAdmin,
  refundApplication,
  // Consultation controllers
  bookConsultation,
  getConsultations,
  getUserConsultations,
  getConsultationById,
  updateConsultation,
  cancelConsultation,
  // Messaging controllers
  getMessages,
  sendMessage,
  getMessageThreads,
  // Requirements controllers
  checkEligibility,
  getRequirements,
  createRequirement,
  updateRequirement,
  uploadFile,
} from '../controllers/visa.controller.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// ─── Visa Applications ───────────────────────────────────────────────────────

/**
 * POST   /api/visa/applications
 * Submit a new visa application.
 */
router.post('/applications', optionalProtect, submitApplication);

/**
 * GET    /api/visa/applications
 * List all applications (admin).
 * Query: ?status=&serviceTier=&priority=&destination=&paymentStatus=&limit=&offset=&orderBy=
 */
router.get('/applications', protect, admin, getApplications);

/**
 * GET    /api/visa/applications/stats
 * Dashboard statistics for admin.
 * IMPORTANT: must be defined BEFORE /:id to avoid "stats" being matched as an id.
 */
router.get('/applications/stats', protect, admin, getStats);

/**
 * GET    /api/visa/applications/my
 * Applications belonging to the current user.
 * Query: ?userId=<uuid> OR ?email=<email>
 */
router.get('/applications/my', protect, getUserApplications);

/**
 * GET    /api/visa/applications/track
 * Public tracking endpoint.
 * Query: ?ref=VISA-2026-00001 OR ?email=<email>
 */
router.get('/applications/track', optionalProtect, trackApplication);

/**
 * GET    /api/visa/applications/:id
 * Get a single application by UUID.
 */
router.get('/applications/:id', optionalProtect, getApplicationById);

/**
 * PUT    /api/visa/applications/:id
 * Update application fields (admin or owner).
 */
router.put('/applications/:id', protect, admin, updateApplication);

/**
 * PATCH  /api/visa/applications/:id/cancel
 * Cancel an application.
 */
router.patch('/applications/:id/cancel', protect, cancelApplication);

/**
 * POST /api/visa/applications/:id/refund — admin issues a service-fee refund
 * (on rejection or discretionary). Reverses the ARC payment + marks 'refunded'.
 */
router.post('/applications/:id/refund', protect, admin, refundApplication);

/**
 * POST   /api/visa/applications/:id/documents
 * Update or add a document entry on an application.
 * Body: { docName, status, fileUrl? }
 */
router.post('/applications/:id/documents', protect, uploadDocument);

/**
 * POST /api/visa/applications/:id/checkout         → start ARC Pay payment (returns checkoutUrl)
 * POST /api/visa/applications/:id/payment-complete → verify ARC order, mark application paid
 * Public (optionalProtect): the applicant pays right after creating the application.
 */
router.post('/applications/:id/checkout', optionalProtect, createApplicationCheckout);
router.post('/applications/:id/payment-complete', optionalProtect, completeApplicationPayment);

/**
 * GET /api/visa/admin/verify — server-side admin/agent session check for the panel guard.
 * `protect` verifies the JWT; the handler checks the role.
 */
router.get('/admin/verify', protect, verifyAdmin);

/**
 * POST   /api/visa/applications/:id/timeline
 * Admin: append a status/timeline event to an application.
 * Body: { status, note, by }
 */
router.post('/applications/:id/timeline', protect, admin, addTimelineEvent);
router.post('/applications/:id/resend-email', optionalProtect, resendConfirmationEmail);

/**
 * DELETE /api/visa/applications/:id
 * Permanently delete an application (admin only).
 */
router.delete('/applications/:id', protect, admin, deleteApplication);

/**
 * POST /api/visa/upload
 * Upload a document to storage.
 */
router.post('/upload', optionalProtect, upload.single('file'), uploadFile);

// ─── Visa Consultations ──────────────────────────────────────────────────────

/**
 * POST   /api/visa/consultations
 * Book a consultation slot.
 */
router.post('/consultations', optionalProtect, bookConsultation);

/**
 * GET    /api/visa/consultations
 * List all consultations (admin).
 * Query: ?status=&date=&consultantName=&limit=&offset=
 */
router.get('/consultations', protect, admin, getConsultations);

/**
 * GET    /api/visa/consultations/stats
 * Consultation statistics (served via combined /applications/stats above).
 * Expose separately if needed.
 */
router.get('/consultations/stats', protect, admin, getStats);

/**
 * GET    /api/visa/consultations/my
 * Get consultations for a user.
 * Query: ?userId=<uuid> OR ?email=<email>
 */
router.get('/consultations/my', protect, getUserConsultations);

/**
 * GET    /api/visa/consultations/:id
 * Get a single consultation by UUID.
 */
router.get('/consultations/:id', protect, getConsultationById);

/**
 * PUT    /api/visa/consultations/:id
 * Update a consultation (admin).
 */
router.put('/consultations/:id', protect, admin, updateConsultation);

/**
 * PATCH  /api/visa/consultations/:id/cancel
 * Cancel a consultation.
 */
router.patch('/consultations/:id/cancel', protect, cancelConsultation);

// ─── Messaging Hub ──────────────────────────────────────────────────────────

/**
 * GET    /api/visa/applications/:id/messages
 * Get chat history for an application.
 */
router.get('/applications/:id/messages', protect, getMessages);

/**
 * POST   /api/visa/applications/:id/messages
 * Send a message within an application thread.
 */
router.post('/applications/:id/messages', protect, sendMessage);

/**
 * GET    /api/visa/messages/threads
 * List all application message threads (admin).
 */
router.get('/messages/threads', protect, admin, getMessageThreads);

// ─── Visa Requirements ───────────────────────────────────────────────────────

/**
 * GET    /api/visa/requirements/check
 * Public check for visa eligibility.
 * ?nationality=&destination=
 */
router.get('/requirements/check', checkEligibility);

/**
 * GET    /api/visa/requirements
 * List requirements (admin).
 */
router.get('/requirements', protect, admin, getRequirements);

/**
 * POST   /api/visa/requirements
 * Create/add a requirement (admin).
 */
router.post('/requirements', protect, admin, createRequirement);

/**
 * PUT    /api/visa/requirements/:id
 * Update a requirement (admin).
 */
router.put('/requirements/:id', protect, admin, updateRequirement);

export default router;
