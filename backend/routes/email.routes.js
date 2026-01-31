import express from 'express';
import emailService, { sendSubscriptionEmails, sendContactNotificationEmails } from '../services/emailService.js';

const router = express.Router();

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

export default router;
