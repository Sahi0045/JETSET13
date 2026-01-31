import { Resend } from 'resend';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to strip HTML
const stripHtml = (html) => html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { type, email, name, message, source } = req.body;

    console.log(`📧 Email API called with type: ${type}`);

    try {
        if (type === 'subscription') {
            return await handleSubscription(req, res, email, source);
        } else if (type === 'contact') {
            return await handleContact(req, res, name, email, message);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid type. Use "subscription" or "contact"' });
        }
    } catch (error) {
        console.error('📧 Email API error:', error);
        return res.status(200).json({
            success: true,
            message: 'Request processed, but email notification failed',
            error: error.message
        });
    }
}

async function handleSubscription(req, res, email, source) {
    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
    }

    console.log(`📧 Sending subscription emails for: ${email} from ${source}`);

    const welcomeHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .container { background-color: white; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0; }
        .header { background: linear-gradient(135deg, #055B75 0%, #033d4f 100%); padding: 40px 20px; text-align: center; color: white; }
        .content { padding: 30px 25px; }
        .welcome-box { background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .welcome-box h2 { color: #2e7d32; margin: 0 0 10px; }
        .benefits { background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .benefits h3 { color: #055B75; margin: 0 0 15px; }
        .benefit-item { padding: 10px 0; border-bottom: 1px solid #e0e0e0; }
        .benefit-item:last-child { border-bottom: none; }
        .footer { background-color: #f8f9fa; padding: 25px; text-align: center; font-size: 13px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✈️ Welcome to JetSetters!</h1>
          <p>You're now part of our travel community</p>
        </div>
        <div class="content">
          <div class="welcome-box">
            <h2>🎉 Subscription Confirmed!</h2>
            <p>Thank you for subscribing. Get ready for exclusive deals!</p>
          </div>
          <div class="benefits">
            <h3>🎁 What You'll Receive:</h3>
            <div class="benefit-item">✨ <strong>Exclusive Deals</strong> - Up to 50% off</div>
            <div class="benefit-item">🌍 <strong>Travel Inspiration</strong> - Curated guides</div>
            <div class="benefit-item">⏰ <strong>Early Access</strong> - Flash sales first</div>
          </div>
        </div>
        <div class="footer">
          <p><strong>JetSetters Travel</strong></p>
          <p>© 2025 JetSetters. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    const adminHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .container { background-color: white; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0; }
        .header { background: linear-gradient(135deg, #28a745 0%, #20873a 100%); padding: 25px; text-align: center; color: white; }
        .content { padding: 25px; }
        .subscriber-info { background-color: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin: 15px 0; }
        .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📬 New Newsletter Subscriber!</h2>
        </div>
        <div class="content">
          <p>Great news! Someone just subscribed to your newsletter.</p>
          <div class="subscriber-info">
            <p><strong>📧 Email:</strong> ${email}</p>
            <p><strong>📍 Source:</strong> ${source || 'website'} page</p>
            <p><strong>🕐 Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
        <div class="footer">
          <p>JetSetters Admin Notification</p>
        </div>
      </div>
    </body>
    </html>
  `;

    const adminEmail = process.env.COMPANY_EMAIL || 'jetsetters721@gmail.com';

    const [subscriberResult, adminResult] = await Promise.all([
        resend.emails.send({
            from: 'JetSetters <noreply@jetsetterss.com>',
            to: [email],
            subject: '🎉 Welcome to JetSetters Newsletter!',
            html: welcomeHtml,
            text: stripHtml(welcomeHtml)
        }),
        resend.emails.send({
            from: 'JetSetters <noreply@jetsetterss.com>',
            to: [adminEmail],
            subject: `📬 New Subscriber: ${email}`,
            html: adminHtml,
            text: stripHtml(adminHtml)
        })
    ]);

    console.log('📧 Subscription emails sent successfully');

    return res.status(200).json({
        success: true,
        message: 'Subscription emails sent successfully',
        data: { subscriberResult, adminResult }
    });
}

async function handleContact(req, res, name, email, message) {
    if (!name || !email || !message) {
        return res.status(400).json({ success: false, error: 'Name, email, and message are required' });
    }

    console.log(`📩 Sending contact emails for: ${name} (${email})`);

    const customerHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .container { background-color: white; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0; }
        .header { background: linear-gradient(135deg, #055B75 0%, #033d4f 100%); padding: 30px; text-align: center; color: white; }
        .content { padding: 25px; }
        .message-box { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #055B75; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>✉️ We've Received Your Message!</h2>
        </div>
        <div class="content">
          <p>Dear ${name},</p>
          <p>Thank you for contacting JetSetters! We've received your message and our team will get back to you within 24-48 hours.</p>
          <div class="message-box">
            <p><strong>Your Message:</strong></p>
            <p>${message}</p>
          </div>
          <p>In the meantime, feel free to explore our latest travel deals on our website!</p>
          <p>Best regards,<br>The JetSetters Team</p>
        </div>
        <div class="footer">
          <p><strong>JetSetters Travel</strong></p>
          <p>© 2025 JetSetters. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    const adminHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .container { background-color: white; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0; }
        .header { background: linear-gradient(135deg, #ff6b35 0%, #e85d26 100%); padding: 20px; text-align: center; color: white; }
        .content { padding: 25px; }
        .info-box { background-color: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #ff6b35; margin: 15px 0; }
        .message-box { background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📩 New Contact Form Submission</h2>
        </div>
        <div class="content">
          <p>You've received a new contact form submission!</p>
          <div class="info-box">
            <p><strong>👤 Name:</strong> ${name}</p>
            <p><strong>📧 Email:</strong> ${email}</p>
            <p><strong>🕐 Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div class="message-box">
            <p><strong>💬 Message:</strong></p>
            <p>${message}</p>
          </div>
          <p style="color: #666; font-size: 14px;">Please respond to this inquiry within 24-48 hours.</p>
        </div>
        <div class="footer">
          <p>JetSetters Admin Notification</p>
        </div>
      </div>
    </body>
    </html>
  `;

    const adminEmail = process.env.COMPANY_EMAIL || 'jetsetters721@gmail.com';

    const [customerResult, adminResult] = await Promise.all([
        resend.emails.send({
            from: 'JetSetters <noreply@jetsetterss.com>',
            to: [email],
            subject: "✉️ We've Received Your Message - JetSetters",
            html: customerHtml,
            text: stripHtml(customerHtml)
        }),
        resend.emails.send({
            from: 'JetSetters <noreply@jetsetterss.com>',
            to: [adminEmail],
            subject: `📩 New Contact: ${name} - ${email}`,
            html: adminHtml,
            text: stripHtml(adminHtml)
        })
    ]);

    console.log('📩 Contact emails sent successfully');

    return res.status(200).json({
        success: true,
        message: 'Contact notification emails sent successfully',
        data: { customerResult, adminResult }
    });
}
