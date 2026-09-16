/**
 * backend/controllers/gdpr.controller.js
 * Phase 7 — GDPR Compliance Tools
 * Routes: /api/gdpr/*
 */

import supabase from '../config/supabase.js';
import User from '../models/user.model.js';
import crypto from 'crypto';
import { unchangedSince } from '../utils/bookingDetailsGuard.js';

/**
 * Take the people out of a person's bookings, leaving the booking.
 *
 * A booking row is a financial record - the retention rules keep it seven years
 * - so it is not deleted. But nothing in it needs to go on naming anyone:
 * `passenger_details` holds each traveller's name, date of birth and passport
 * number, and `booking_details` carries `pending_booking_data` (the entire
 * checkout body), the contact details and the guest's name.
 *
 * Read-modify-write per row, because PostgREST cannot edit inside a jsonb
 * column. Failures are logged and skipped rather than failing the whole
 * request: a customer asking to be forgotten should not be told "try again"
 * because one row would not move.
 */
async function redactBookingsFor(userId) {
  const { data: rows, error } = await supabase
    .from('bookings')
    .select('id, booking_reference, status, payment_status, booking_details')
    .eq('user_id', userId);

  if (error) {
    console.error('GDPR: could not read bookings to redact:', error.message);
    return { redacted: 0, failed: 0, deferred: 0 };
  }

  let redacted = 0;
  let failed = 0;
  let deferred = 0;

  for (const row of rows || []) {
    const details = row.booking_details || {};

    // A booking still being made keeps everything until it is finished.
    //
    // `pending_booking_data` is not just a record of what the customer typed -
    // POST /flights/order reads the verified offer out of it
    // (flight.routes.js: `pending_booking_data.bookingData.originalOffer`) and
    // REVERSES THE CHARGE when it is absent, and the abandoned-checkout job
    // requires it to find a paid checkout at all. Stripping it from a booking
    // that is still queued or unticketed would destroy the trip the customer
    // paid for, and hide it from the one job that would have caught that.
    //
    // So a booking that is not finished is deferred: nothing about it is
    // touched, and it is counted so a human can see there is something left.
    // The retention job erases it on its own schedule.
    const unfinished = Boolean(details.queued_order)
      || Boolean(details.gds_chain && !details.pnr)
      || (row.payment_status === 'paid' && !details.pnr && row.status !== 'cancelled');
    if (unfinished) {
      console.warn('GDPR: booking still in flight, not redacted', {
        bookingReference: row.booking_reference, status: row.status,
      });
      deferred += 1;
      continue;
    }

    const {
      pending_booking_data: _pending,
      guest_info: _guest,
      contact: _contact,
      customer_email: _email,
      customer_name: _name,
      ...kept
    } = details;

    // Pinned to the row this was built from, like every other whole-column
    // write of booking_details. Without it, a chain committing a PNR between
    // this read and this write would have that PNR erased - the airline holds
    // a reservation our database can no longer find.
    let write = supabase
      .from('bookings')
      .update({
        passenger_details: [],
        // `redacted_at` is set once: re-running must not lose the first stamp.
        booking_details: { ...kept, redacted_at: details.redacted_at || new Date().toISOString() },
      })
      .eq('id', row.id);
    write = unchangedSince(write, row);

    const { data: written, error: writeError } = await write.select('id');

    if (writeError) {
      console.error('GDPR: could not redact booking', row.id, writeError.message);
      failed += 1;
    } else if (!written?.length) {
      console.warn('GDPR: booking changed while being redacted, left alone', { bookingReference: row.booking_reference });
      deferred += 1;
    } else {
      redacted += 1;
    }
  }

  console.log(`GDPR: redacted ${redacted} bookings for ${userId}`
    + `${failed ? `, ${failed} failed` : ''}${deferred ? `, ${deferred} left for later` : ''}`);
  return { redacted, failed, deferred };
}

// ─── Data Export ──────────────────────────────────────────────
// GET /api/gdpr/export-data
// Returns a full JSON package of all data for the authenticated user
export const exportUserData = async (req, res) => {
  try {
    const userId    = req.user.id;
    const userEmail = req.user.email;

    const [userRes, inquiriesRes, paymentsRes, chatRes, draftsRes, travellersRes, bookingsRes] = await Promise.all([
      supabase.from('users').select('id, email, name, first_name, last_name, created_at').eq('id', userId).single(),
      supabase.from('inquiries').select('*').or(`user_id.eq.${userId},customer_email.ilike.${userEmail}`),
      supabase.from('payments').select('id, amount, status, created_at').eq('user_id', userId),
      supabase.from('chat_sessions').select('id, created_at').eq('user_id', userId),
      supabase.from('application_drafts').select('form_type, last_saved').eq('user_id', userId),
      // The people they book for, passports included: it is their data.
      supabase.from('saved_travellers')
        .select('first_name, last_name, gender, date_of_birth, nationality, passport_number, passport_expiry, created_at')
        .eq('user_id', userId),
      // Bookings were missing entirely, and they are the largest store of this
      // person's data we hold: `passenger_details` carries every traveller's
      // name, date of birth and passport number. An export that omits them is
      // not a complete export.
      supabase.from('bookings')
        .select('booking_reference, travel_type, status, payment_status, total_amount, created_at, passenger_details')
        .eq('user_id', userId),
    ]);

    const exportPackage = {
      exported_at:   new Date().toISOString(),
      user:          userRes.data,
      inquiries:     inquiriesRes.data || [],
      payments:      paymentsRes.data || [],
      chat_sessions: chatRes.data || [],
      drafts:        draftsRes.data || [],
      saved_travellers: travellersRes.data || [],
      bookings:      bookingsRes?.data || [],
    };

    res.setHeader('Content-Disposition', `attachment; filename="jetset-data-export-${userId.slice(0, 8)}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(exportPackage);
  } catch (error) {
    console.error('GDPR export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export data' });
  }
};

// ─── Account Deletion ─────────────────────────────────────────
// DELETE /api/gdpr/delete-account
// Anonymises data + schedules hard delete in 30 days
export const requestAccountDeletion = async (req, res) => {
  try {
    const userId    = req.user.id;
    const userEmail = req.user.email;

    // Anonymise user record (keep row for FK integrity)
    const anonymisedEmail = `deleted-${crypto.randomBytes(8).toString('hex')}@deleted.invalid`;
    await supabase.from('users').update({
      email:      anonymisedEmail,
      name:       'Deleted User',
      first_name: 'Deleted',
      last_name:  'User',
      password:   crypto.randomBytes(32).toString('hex'), // random, can never match
    }).eq('id', userId);

    // Anonymise inquiries
    await supabase.from('inquiries').update({
      customer_name:  'Deleted User',
      customer_email: anonymisedEmail,
      status:         'anonymized',
    }).or(`user_id.eq.${userId},customer_email.ilike.${userEmail}`);

    // Delete drafts and chat history (no retention needed)
    await Promise.all([
      supabase.from('application_drafts').delete().eq('user_id', userId),
      supabase.from('chat_sessions').delete().eq('user_id', userId),
      // The people they booked for, with their passports: nothing to retain.
      supabase.from('saved_travellers').delete().eq('user_id', userId),
    ]);

    // Bookings were left untouched by this entirely, and they hold more of this
    // person's data than anything above: `passenger_details` carries every
    // traveller's name, date of birth and passport number, and
    // `booking_details.pending_booking_data` is the whole checkout body. The
    // row itself is a financial record and stays - the retention rules keep it
    // seven years - but nothing in it needs to keep naming a real person.
    await redactBookingsFor(userId);

    // Record deletion request for audit
    await supabase.from('audit_logs').insert([{
      actor_id:    userId,
      actor_type:  'user',
      action:      'account_deletion_requested',
      target_type: 'user',
      target_id:   userId,
      metadata:    { scheduled_hard_delete_at: new Date(Date.now() + 30 * 86_400_000).toISOString() },
    }]);

    res.json({
      success:  true,
      message:  'Your account has been anonymised. All personal data will be permanently deleted within 30 days.',
    });
  } catch (error) {
    console.error('GDPR delete account error:', error);
    res.status(500).json({ success: false, message: 'Failed to process deletion request' });
  }
};

// ─── Consent Recording ────────────────────────────────────────
// POST /api/gdpr/consent
// { type: 'marketing' | 'analytics' | 'cookies', granted: true|false }
export const recordConsent = async (req, res) => {
  try {
    const { type, granted } = req.body;

    if (!type || granted === undefined) {
      return res.status(400).json({ success: false, message: 'type and granted are required' });
    }

    const VALID_TYPES = ['marketing', 'analytics', 'cookies', 'data_processing'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `Invalid consent type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }

    await supabase.from('audit_logs').insert([{
      actor_id:    req.user?.id ?? null,
      actor_type:  req.user ? 'user' : 'anonymous',
      action:      `consent_${granted ? 'granted' : 'withdrawn'}`,
      target_type: 'consent',
      target_id:   null,
      metadata: {
        consent_type: type,
        granted,
        ip_address: req.ip,
        user_agent:  req.headers?.['user-agent']?.substring(0, 120),
      },
    }]);

    res.json({ success: true, message: `Consent ${granted ? 'recorded' : 'withdrawn'} for: ${type}` });
  } catch (error) {
    console.error('GDPR consent error:', error);
    res.status(500).json({ success: false, message: 'Failed to record consent' });
  }
};

// ─── Right to Access ──────────────────────────────────────────
// GET /api/gdpr/my-data-summary
// Returns a human-readable summary (not raw dump) for the profile page
export const getDataSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const [inquiryCount, paymentCount, draftCount] = await Promise.all([
      supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('application_drafts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    res.json({
      success: true,
      data: {
        inquiries_count: inquiryCount.count ?? 0,
        payments_count:  paymentCount.count ?? 0,
        drafts_count:    draftCount.count ?? 0,
        data_categories: ['Profile info', 'Travel inquiries', 'Payment records', 'Session/chat data'],
        retention_policy: 'Active data retained for 3 years after last activity. You may export or delete at any time.',
      },
    });
  } catch (error) {
    console.error('GDPR data summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
