import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Resend client
let resend = null;

const initializeResend = () => {
    if (!resend && process.env.RESEND_API_KEY) {
        try {
            resend = new Resend(process.env.RESEND_API_KEY);
            console.log('✅ Resend email service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Resend:', error.message);
        }
    }
    return resend;
};

/**
 * Format inquiry type for display
 */
const formatInquiryType = (type) => {
    const types = {
        flight: 'Flight',
        hotel: 'Hotel',
        cruise: 'Cruise',
        package: 'Package',
        general: 'General Inquiry'
    };
    return types[type] || type;
};

/**
 * Format inquiry details based on type
 */
const formatInquiryDetails = (inquiry) => {
    const type = inquiry.inquiry_type || inquiry.travel_type;

    switch (type) {
        case 'flight':
            return `
        <strong>Flight Details:</strong><br/>
        • Route: ${inquiry.origin || 'N/A'} → ${inquiry.destination || 'N/A'}<br/>
        • Departure: ${inquiry.departure_date || 'N/A'}<br/>
        ${inquiry.return_date ? `• Return: ${inquiry.return_date}<br/>` : ''}
        • Passengers: ${inquiry.passengers || inquiry.adults || 1}<br/>
        • Class: ${inquiry.cabin_class || 'Economy'}
      `;

        case 'hotel':
            return `
        <strong>Hotel Details:</strong><br/>
        • Destination: ${inquiry.destination || inquiry.city || 'N/A'}<br/>
        • Check-in: ${inquiry.check_in_date || 'N/A'}<br/>
        • Check-out: ${inquiry.check_out_date || 'N/A'}<br/>
        • Rooms: ${inquiry.rooms || 1}<br/>
        • Guests: ${inquiry.guests || inquiry.adults || 1}
      `;

        case 'cruise':
            return `
        <strong>Cruise Details:</strong><br/>
        • Destination: ${inquiry.destination || 'N/A'}<br/>
        • Departure Date: ${inquiry.departure_date || 'N/A'}<br/>
        • Duration: ${inquiry.duration || 'N/A'}<br/>
        • Passengers: ${inquiry.passengers || 1}
      `;

        case 'package':
            return `
        <strong>Package Details:</strong><br/>
        • Destination: ${inquiry.destination || 'N/A'}<br/>
        • Start Date: ${inquiry.start_date || 'N/A'}<br/>
        • End Date: ${inquiry.end_date || 'N/A'}<br/>
        • Travelers: ${inquiry.travelers || inquiry.adults || 1}
      `;

        case 'general':
        default:
            return `
        <strong>Inquiry Details:</strong><br/>
        ${inquiry.subject ? `• Subject: ${inquiry.subject}<br/>` : ''}
        ${inquiry.message ? `• Message: ${inquiry.message.substring(0, 200)}${inquiry.message.length > 200 ? '...' : ''}` : ''}
      `;
    }
};

/**
 * Generate admin notification email HTML
 */
const generateAdminEmailHTML = (inquiry) => {
    const inquiryType = formatInquiryType(inquiry.inquiry_type || inquiry.travel_type);
    const customerName = inquiry.customer_name || 'Guest Customer';
    const customerEmail = inquiry.customer_email || 'N/A';
    const customerPhone = inquiry.customer_phone || 'N/A';
    const createdAt = inquiry.created_at ? new Date(inquiry.created_at).toLocaleString() : new Date().toLocaleString();
    const inquiryId = inquiry.id ? inquiry.id.substring(0, 8) : 'N/A';

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New ${inquiryType} Request</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          margin: -30px -30px 20px -30px;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .badge {
          display: inline-block;
          background-color: #fbbf24;
          color: #78350f;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 8px;
        }
        .section {
          margin: 20px 0;
          padding: 15px;
          background-color: #f9fafb;
          border-radius: 6px;
          border-left: 4px solid #667eea;
        }
        .section h2 {
          margin-top: 0;
          font-size: 16px;
          color: #667eea;
        }
        .info-row {
          margin: 8px 0;
        }
        .label {
          font-weight: 600;
          color: #4b5563;
        }
        .button {
          display: inline-block;
          background-color: #667eea;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          margin-top: 20px;
          font-weight: 600;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          color: #9ca3af;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 New ${inquiryType} Request</h1>
          <span class="badge">ACTION REQUIRED</span>
        </div>
        
        <p>A new travel request has been submitted and requires your attention.</p>
        
        <div class="section">
          <h2>Customer Information</h2>
          <div class="info-row"><span class="label">Name:</span> ${customerName}</div>
          <div class="info-row"><span class="label">Email:</span> ${customerEmail}</div>
          <div class="info-row"><span class="label">Phone:</span> ${customerPhone}</div>
        </div>
        
        <div class="section">
          <h2>Request Details</h2>
          ${formatInquiryDetails(inquiry)}
        </div>
        
        <div class="section">
          <h2>Request Information</h2>
          <div class="info-row"><span class="label">Request ID:</span> ${inquiryId}</div>
          <div class="info-row"><span class="label">Submitted:</span> ${createdAt}</div>
          <div class="info-row"><span class="label">Status:</span> Pending Review</div>
        </div>
        
        <p style="margin-top: 20px;">
          <strong>Next Steps:</strong><br/>
          1. Review the request details in the admin panel<br/>
          2. Contact the customer if additional information is needed<br/>
          3. Create and send a customized quote
        </p>
        
        <div class="footer">
          <p>This is an automated notification from JetSetGo Travel Platform<br/>
          Please do not reply to this email</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate customer confirmation email HTML
 */
const generateCustomerEmailHTML = (inquiry) => {
    const inquiryType = formatInquiryType(inquiry.inquiry_type || inquiry.travel_type);
    const customerName = inquiry.customer_name || 'Valued Customer';
    const firstName = customerName.split(' ')[0];
    const inquiryId = inquiry.id ? inquiry.id.substring(0, 8) : 'N/A';

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Request Confirmation</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          margin: -30px -30px 20px -30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .success-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .section {
          margin: 20px 0;
          padding: 15px;
          background-color: #f0fdf4;
          border-radius: 6px;
          border-left: 4px solid #10b981;
        }
        .info-box {
          background-color: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 15px;
          margin: 15px 0;
        }
        .reference {
          font-size: 18px;
          font-weight: 700;
          color: #1e40af;
          text-align: center;
          margin: 10px 0;
        }
        .timeline {
          margin: 20px 0;
        }
        .timeline-item {
          display: flex;
          align-items: flex-start;
          margin: 10px 0;
        }
        .timeline-icon {
          background-color: #10b981;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          flex-shrink: 0;
          font-weight: bold;
        }
        .timeline-content {
          flex: 1;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
        }
        .contact-info {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 6px;
          margin: 15px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="success-icon">✅</div>
          <h1>Request Received Successfully!</h1>
        </div>
        
        <p>Dear ${firstName},</p>
        
        <p>Thank you for choosing <strong>JetSetGo</strong> for your travel needs. We're thrilled to help you plan your perfect trip!</p>
        
        <div class="section">
          <p style="margin: 0;">
            ✨ Your <strong>${inquiryType}</strong> request has been successfully submitted to our travel experts.
          </p>
        </div>
        
        <div class="info-box">
          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">Your Reference Number:</p>
          <div class="reference">#${inquiryId.toUpperCase()}</div>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px;">Please keep this for your records</p>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">What Happens Next?</h3>
        
        <div class="timeline">
          <div class="timeline-item">
            <div class="timeline-icon">1</div>
            <div class="timeline-content">
              <strong>Review in Progress</strong><br/>
              <span style="color: #6b7280; font-size: 14px;">Our travel experts are reviewing your request</span>
            </div>
          </div>
          
          <div class="timeline-item">
            <div class="timeline-icon">2</div>
            <div class="timeline-content">
              <strong>Personalized Quote</strong><br/>
              <span style="color: #6b7280; font-size: 14px;">We'll prepare a customized quote within 24 hours</span>
            </div>
          </div>
          
          <div class="timeline-item">
            <div class="timeline-icon">3</div>
            <div class="timeline-content">
              <strong>Confirmation</strong><br/>
              <span style="color: #6b7280; font-size: 14px;">You'll receive an email with your detailed quote</span>
            </div>
          </div>
        </div>
        
        <div class="contact-info">
          <h4 style="margin-top: 0; color: #1f2937;">Questions or Need Help?</h4>
          <p style="margin: 5px 0; font-size: 14px;">
            📧 Email: <strong>support@jetsetgo.com</strong><br/>
            📱 Phone: <strong>+1 (555) 123-4567</strong><br/>
            🕒 Hours: Monday - Friday, 9:00 AM - 6:00 PM EST
          </p>
        </div>
        
        <p style="margin-top: 25px;">
          You can track the status of your request anytime by logging into your account and visiting the "My Trips" section.
        </p>
        
        <div class="footer">
          <p><strong>JetSetGo Travel</strong><br/>
          Making Your Travel Dreams Come True ✈️</p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 15px;">
            This is an automated confirmation. Please do not reply to this email.<br/>
            For assistance, contact us using the information above.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Send admin notification email
 */
export const sendAdminNotification = async (inquiry) => {
    const client = initializeResend();

    if (!client) {
        console.warn('⚠️ Resend not initialized - skipping admin notification');
        return { success: false, error: 'Resend not configured' };
    }

    const inquiryType = formatInquiryType(inquiry.inquiry_type || inquiry.travel_type);
    const customerName = inquiry.customer_name || 'Guest Customer';

    try {
        // For testing, send to registered email (free tier limitation)
        // In production with verified domain, change to actual admin email
        const adminEmail = process.env.ADMIN_EMAIL || 'jetsetters721@gmail.com';

        const result = await client.emails.send({
            from: 'JetSetGo <onboarding@resend.dev>',
            to: adminEmail,
            subject: `🔔 New ${inquiryType} Request from ${customerName}`,
            html: generateAdminEmailHTML(inquiry)
        });

        console.log('✅ Admin notification sent:', result.id);
        return { success: true, id: result.id };
    } catch (error) {
        console.error('❌ Failed to send admin notification:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send customer confirmation email
 */
export const sendCustomerConfirmation = async (inquiry) => {
    const client = initializeResend();

    if (!client) {
        console.warn('⚠️ Resend not initialized - skipping customer confirmation');
        return { success: false, error: 'Resend not configured' };
    }

    if (!inquiry.customer_email) {
        console.warn('⚠️ No customer email provided - skipping confirmation');
        return { success: false, error: 'No customer email' };
    }

    const inquiryType = formatInquiryType(inquiry.inquiry_type || inquiry.travel_type);

    try {
        const result = await client.emails.send({
            from: 'JetSetGo <onboarding@resend.dev>',
            to: inquiry.customer_email,
            subject: `✅ Your ${inquiryType} Request Has Been Received`,
            html: generateCustomerEmailHTML(inquiry)
        });

        console.log('✅ Customer confirmation sent:', result.id);
        return { success: true, id: result.id };
    } catch (error) {
        console.error('❌ Failed to send customer confirmation:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send both admin notification and customer confirmation
 */
export const sendInquiryEmails = async (inquiry) => {
    console.log('📧 Sending inquiry notification emails...');

    // Send both emails concurrently
    const [adminResult, customerResult] = await Promise.allSettled([
        sendAdminNotification(inquiry),
        sendCustomerConfirmation(inquiry)
    ]);

    const results = {
        admin: adminResult.status === 'fulfilled' ? adminResult.value : { success: false, error: adminResult.reason },
        customer: customerResult.status === 'fulfilled' ? customerResult.value : { success: false, error: customerResult.reason }
    };

    console.log('📧 Email sending results:', {
        admin: results.admin.success ? '✅' : '❌',
        customer: results.customer.success ? '✅' : '❌'
    });

    return results;
};

export default {
    sendAdminNotification,
    sendCustomerConfirmation,
    sendInquiryEmails
};
