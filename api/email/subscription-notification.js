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

    console.log('📧 Subscription notification route hit');
    console.log('📧 Request body:', req.body);

    try {
        const { email, source } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }

        console.log(`📧 Sending subscription emails for: ${email} from ${source}`);

        // Send welcome email to subscriber
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

        // Send admin notification
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

        // Send both emails in parallel
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
    } catch (error) {
        console.error('📧 Error sending subscription emails:', error);

        // Return success anyway to not block the subscription flow
        return res.status(200).json({
            success: true,
            message: 'Subscription saved, but email notification failed',
            error: error.message
        });
    }
}
