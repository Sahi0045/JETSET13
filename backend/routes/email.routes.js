import express from 'express';
import emailService, { sendSubscriptionEmails, sendContactNotificationEmails } from '../services/emailService.js';
import { get as cacheGet, set as cacheSet } from '../services/cache.service.js';
import { protect } from '../middleware/auth.middleware.js';
import {
  generateInquiryStatusTemplate,
  generateLoginNotificationTemplate,
  generateLogoutNotificationTemplate,
  generateQuoteReminderTemplate,
} from '../services/email/templates.js';

const router = express.Router();

const isStaff = (user) => !!user && ['admin', 'superadmin', 'agent'].includes(user.role);

// Templates a signed-in user is allowed to send to THEIR OWN address. Everything
// else on /send (quote_reminder, inquiry_status, or any recipient that isn't the
// caller) is staff-only — otherwise /send is an open relay for phishing/spam from
// the Jetsetters domain.
const SELF_NOTIFY_TYPES = new Set(['login_notification', 'logout_notification']);

// Consolidated email endpoint (matches Vercel /api/email)
router.post('/', async (req, res) => {
  const { type, email, name, message, source } = req.body;
  console.log(`📧 Email API called with type: ${type}`);

  try {
    if (type === 'subscription') {
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }
      console.log(`📧 Sending subscription emails for: ${email} from ${source}`);
      const result = await sendSubscriptionEmails(email, source || 'website');
      console.log('📧 Subscription emails sent successfully:', result);
      return res.status(200).json({ success: true, message: 'Subscription emails sent', data: result });

    } else if (type === 'contact') {
      if (!name || !email || !message) {
        return res.status(400).json({ success: false, error: 'Name, email, and message are required' });
      }
      console.log(`📩 Sending contact emails for: ${name} (${email})`);
      const result = await sendContactNotificationEmails(name, email, message);
      console.log('📩 Contact emails sent successfully:', result);
      return res.status(200).json({ success: true, message: 'Contact emails sent', data: result });

    } else {
      return res.status(400).json({ success: false, error: 'Invalid type. Use "subscription" or "contact"' });
    }
  } catch (error) {
    console.error('📧 Email API error:', error);
    return res.status(200).json({ success: true, message: 'Request processed, but email failed', error: error.message });
  }
});

// Send callback confirmation email
router.post('/send-callback-confirmation', protect, async (req, res) => {
  // Staff-only: this sends a branded email from the Jetsetters domain to an
  // arbitrary recipient with caller-supplied content — an open phishing relay if
  // left unauthenticated (mirror the /send hardening below). No web caller.
  if (!isStaff(req.user)) {
    return res.status(403).json({ success: false, error: 'Not authorized to send this email.' });
  }
  console.log('🔶 Email route hit: /send-callback-confirmation');

  try {
    const { data, type } = req.body;

    if (!data || !type) {
      console.log('❌ Missing required fields:', { data, type });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: data and type'
      });
    }

    console.log('✅ Sending email with data:', { type, data: { ...data, email: data.email || 'Not provided' } });
    const result = await emailService.sendCallbackConfirmation(data, type);
    console.log('✅ Email sent successfully:', result);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while sending email'
    });
  }
});

// Send subscription notification emails (subscriber welcome + admin notification)
router.post('/subscription-notification', async (req, res) => {
  console.log('📧 Subscription notification route hit');

  try {
    const { email, source } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`📧 Sending subscription emails for: ${email} from ${source}`);
    const result = await sendSubscriptionEmails(email, source || 'website');
    console.log('📧 Subscription emails sent successfully:', result);

    return res.status(200).json({
      success: true,
      message: 'Subscription emails sent successfully',
      data: result
    });
  } catch (error) {
    console.error('📧 Error sending subscription emails:', error);

    // Return success anyway to not block the subscription flow
    return res.status(200).json({
      success: true,
      message: 'Subscription saved, but email notification failed',
      error: error.message
    });
  }
});

// Send contact form notification emails (customer confirmation + admin notification)
router.post('/contact-notification', async (req, res) => {
  console.log('📩 Contact notification route hit');

  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and message are required'
      });
    }

    console.log(`📩 Sending contact emails for: ${name} (${email})`);
    const result = await sendContactNotificationEmails(name, email, message);
    console.log('📩 Contact emails sent successfully:', result);

    return res.status(200).json({
      success: true,
      message: 'Contact notification emails sent successfully',
      data: result
    });
  } catch (error) {
    console.error('📩 Error sending contact emails:', error);

    // Return success anyway to not block the form submission
    return res.status(200).json({
      success: true,
      message: 'Contact form saved, but email notification failed',
      error: error.message
    });
  }
});

// POST /api/email/booking-confirmation - Send booking confirmation emails
router.post('/booking-confirmation', protect, async (req, res) => {
  // Staff-only: sends a branded booking email to an arbitrary recipient with
  // caller-supplied content — a phishing relay if unauthenticated. Normal-flow
  // confirmations are sent server-side by the booking chain; this is a manual
  // admin resend. No web caller.
  if (!isStaff(req.user)) {
    return res.status(403).json({ success: false, error: 'Not authorized.' });
  }
  try {
    const {
      customerEmail,
      customerName,
      bookingReference,
      bookingType,
      paymentAmount,
      currency,
      travelDate,
      passengers,
      bookingDetails
    } = req.body;

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Customer email is required'
      });
    }

    console.log('📧 Manual booking confirmation email request:', { customerEmail, bookingReference });

    const { sendBookingNotificationEmails } = await import('../services/emailService.js');

    const result = await sendBookingNotificationEmails({
      customerEmail,
      customerName: customerName || 'Valued Customer',
      bookingReference: bookingReference || 'N/A',
      bookingType: bookingType || 'travel',
      paymentAmount: paymentAmount || 0,
      currency: currency || 'USD',
      travelDate,
      passengers: passengers || 1,
      bookingDetails: bookingDetails || {}
    });

    res.status(200).json({
      success: true,
      message: 'Booking confirmation emails sent',
      data: result
    });
  } catch (error) {
    console.error('Error sending booking confirmation email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/email/send - Generic email sending endpoint for My Trips
router.post('/send', protect, async (req, res) => {
  try {
    const { type, to, data } = req.body;

    if (!type || !to) {
      return res.status(400).json({
        success: false,
        error: 'Email type and recipient are required'
      });
    }

    // Staff may send any template to any recipient; a normal user may only send a
    // self-notification (login/logout) to their own verified address. This closes
    // the arbitrary-recipient relay while keeping the login/logout emails working.
    if (!isStaff(req.user)) {
      const ownEmail = String(req.user?.email || '').toLowerCase();
      const target = String(to).toLowerCase();
      if (!SELF_NOTIFY_TYPES.has(type) || !ownEmail || target !== ownEmail) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to send this email.'
        });
      }
    }

    console.log('📧 Generic email request:', { type, to });

    const emailService = await import('../services/emailService.js');
    let result;

    switch (type) {
      case 'quote_reminder':
        // Send quote reminder email
        result = await emailService.sendEmail({
          to,
          subject: `Reminder: your travel quote ${data.quoteNumber} expires soon`,
          html: generateQuoteReminderTemplate(data),
        });
        break;

      case 'inquiry_status':
        // Send inquiry status update email
        const statusMessages = {
          'pending': 'Your inquiry has been received and is awaiting review.',
          'processing': 'Our travel experts are working on your request.',
          'quoted': 'Great news! A quote is ready for your review.',
          'booked': 'Your booking has been confirmed!',
          'cancelled': 'Your inquiry has been cancelled.',
          'expired': 'Unfortunately, this inquiry has expired.'
        };

        result = await emailService.sendEmail({
          to,
          subject: `Update on your ${data.inquiryType || 'travel'} inquiry`,
          html: generateInquiryStatusTemplate(data),
        });
        break;

      case 'login_notification': {
        // Do not email the same person for the same session over and over.
        //
        // The client used to be the only guard, with two sessionStorage flags:
        // one to dedupe and one to mark "this SIGNED_IN is a page refresh, not
        // a real login". Both leak. sessionStorage is per-tab, so a second tab
        // is a fresh notification; and the rehydration flag was cleared right
        // after `setSession()` resolved, while the SIGNED_IN event it triggers
        // arrives later - so on a normal page load the flag was usually already
        // gone by the time the handler read it. The result was a security email
        // on essentially every visit, which trains people to ignore the one
        // that matters.
        //
        // The dedupe belongs here, where it cannot be defeated by a new tab,
        // cleared storage, or a second device. Keyed on the recipient with a
        // 12-hour window: a genuine second login within that window is not
        // worth an email, and anything outside it is.
        const dedupeKey = `login-email:${String(to).toLowerCase()}`;
        if (await cacheGet(dedupeKey)) {
          console.log('↩️ Login notification suppressed (already sent recently):', to);
          return res.json({ success: true, skipped: true, reason: 'already notified recently' });
        }
        await cacheSet(dedupeKey, { at: new Date().toISOString() }, 12 * 60 * 60);

        result = await emailService.sendEmail({
          to,
          subject: `New sign-in to your Jetsetters account`,
          html: generateLoginNotificationTemplate(data),
        });
        break;
      }

      case 'logout_notification':
        // Send logout notification email
        result = await emailService.sendEmail({
          to,
          subject: `You have been signed out of Jetsetters`,
          html: generateLogoutNotificationTemplate(data),
        });
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown email type: ${type}`
        });
    }

    res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      data: result
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

