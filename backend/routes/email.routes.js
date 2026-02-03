import express from 'express';
import emailService, { sendSubscriptionEmails, sendContactNotificationEmails } from '../services/emailService.js';

const router = express.Router();

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
router.post('/send-callback-confirmation', async (req, res) => {
  console.log('🔶 Email route hit: /send-callback-confirmation');
  console.log('🔶 Request body:', req.body);

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
  console.log('📧 Request body:', req.body);

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
  console.log('📩 Request body:', req.body);

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
router.post('/booking-confirmation', async (req, res) => {
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
router.post('/send', async (req, res) => {
  try {
    const { type, to, data } = req.body;

    if (!type || !to) {
      return res.status(400).json({
        success: false,
        error: 'Email type and recipient are required'
      });
    }

    console.log('📧 Generic email request:', { type, to });

    const emailService = await import('../services/emailService.js');
    let result;

    switch (type) {
      case 'quote_reminder':
        // Send quote reminder email
        result = await emailService.sendEmail({
          to,
          subject: `⏰ Reminder: Your Travel Quote is Expiring Soon - ${data.quoteNumber}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #055B75 0%, #0066b2 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0;">Quote Reminder</h1>
              </div>
              <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 12px 12px;">
                <p style="font-size: 16px; color: #333;">Hi ${data.customerName},</p>
                <p style="font-size: 16px; color: #333;">Your travel quote <strong>#${data.quoteNumber}</strong> is expiring soon!</p>
                <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; font-size: 18px; font-weight: bold; color: #856404;">
                    ⚠️ Expires: ${new Date(data.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Quote Total:</strong> $${data.totalAmount} ${data.currency}</p>
                  <p style="margin: 5px 0;"><strong>Inquiry Type:</strong> ${data.inquiryType}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.quoteUrl}" style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                    💳 Complete Payment Now
                  </a>
                </div>
                <p style="color: #666; font-size: 14px; text-align: center;">
                  Don't miss out on this offer! Complete your booking before it expires.
                </p>
              </div>
            </div>
          `
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
          subject: `📋 Inquiry Status Update - ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #055B75 0%, #0066b2 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0;">Inquiry Status Update</h1>
              </div>
              <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 12px 12px;">
                <p style="font-size: 16px; color: #333;">Hi ${data.customerName},</p>
                <p style="font-size: 16px; color: #333;">Here's the latest update on your ${data.inquiryType} inquiry:</p>
                <div style="background: #e0f2fe; border-left: 4px solid #0066b2; padding: 20px; margin: 20px 0;">
                  <p style="margin: 0; font-size: 18px; font-weight: bold; color: #055B75;">
                    Status: ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}
                  </p>
                  <p style="margin: 10px 0 0; color: #333;">
                    ${statusMessages[data.status] || 'Your inquiry is being processed.'}
                  </p>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Inquiry ID:</strong> ${data.inquiryId.slice(-8).toUpperCase()}</p>
                  <p style="margin: 5px 0;"><strong>Type:</strong> ${data.inquiryType}</p>
                  <p style="margin: 5px 0;"><strong>Created:</strong> ${new Date(data.createdAt).toLocaleDateString()}</p>
                  ${data.hasQuotes ? '<p style="margin: 5px 0; color: #22c55e;"><strong>✓ Quote Available</strong></p>' : ''}
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.viewUrl}" style="background: linear-gradient(135deg, #055B75 0%, #0066b2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                    View Full Details
                  </a>
                </div>
              </div>
            </div>
          `
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

