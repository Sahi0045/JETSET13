import { Resend } from 'resend';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Resend with API key from environment variable
const resend = new Resend(process.env.RESEND_API_KEY || 're_4tfvwTmv_9kPKorQAcpZmZcZ4i744cC1Q');

/**
 * Generic email sending function
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Template name (optional)
 * @param {Object} options.data - Template data (optional)
 * @param {string} options.html - HTML content (optional, if not using template)
 * @param {string} options.text - Plain text content (optional)
 * @returns {Promise} - Email send response
 */
export const sendEmail = async ({ to, subject, template, data, html, text }) => {
  try {
    // If HTML is not provided, generate a simple HTML email
    if (!html) {
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background-color: #0066b2; padding: 20px; text-align: center; color: white; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background-color: #f1f1f1; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${subject}</h1>
          </div>
          <div class="content">
            ${data ? Object.entries(data).map(([key, value]) => `<p><strong>${key}:</strong> ${value}</p>`).join('') : '<p>Thank you for your inquiry.</p>'}
          </div>
          <div class="footer">
            <p>This is an automated message from JetSetGo.</p>
            <p>&copy; 2025 JetSetGo. All rights reserved.</p>
          </div>
        </body>
        </html>
      `;
    }

    // Generate plain text if not provided
    if (!text) {
      text = html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
    }

    const response = await resend.emails.send({
      from: 'JetSetters <noreply@jetsetterss.com>',
      to: [to],
      subject,
      html,
      text
    });

    console.log('Email sent successfully:', response);
    return response;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Email service for sending notifications
 */
const emailService = {
  /**
   * Send a confirmation email after a callback request
   * @param {Object} data - Callback request data
   * @param {string} type - Type of callback request (cruise, package, rental)
   * @returns {Promise} - Email send response
   */
  sendCallbackConfirmation: async (data, type) => {
    try {
      // Different email templates based on callback type
      let subject, html;

      switch (type) {
        case 'cruise':
          subject = 'Your Cruise Callback Request Confirmation';
          html = generateCruiseCallbackTemplate(data);
          break;
        case 'package':
          subject = 'Your Package Quote Request Confirmation';
          html = generatePackageCallbackTemplate(data);
          break;
        case 'rental':
          subject = 'Your Hotel Booking Request Confirmation';
          html = generateRentalCallbackTemplate(data);
          break;
        default:
          subject = 'Callback Request Confirmation';
          html = generateDefaultCallbackTemplate(data);
      }

      // For Resend free tier, we must use the registered email address
      // Original requester's email from data is shown in the template
      const registeredEmail = 'jetsetters721@gmail.com';

      // Send the email using Resend
      const response = await resend.emails.send({
        from: 'JetSetGo <onboarding@resend.dev>',
        to: [registeredEmail], // Send to the email registered with Resend
        subject,
        html,
        text: stripHtml(html)
      });

      console.log('Email sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
};

/**
 * Generate HTML email template for cruise callback confirmation
 * @param {Object} data - Callback data
 * @returns {string} - HTML email content
 */
function generateCruiseCallbackTemplate(data) {
  const { name, phone, preferredTime = 'Not specified', message = 'None' } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background-color: #0066b2; padding: 20px; text-align: center; color: white; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background-color: #f1f1f1; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Cruise Callback Request Confirmation</h1>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Thank you for requesting a callback about our cruise offerings. We have received your request and a member of our team will call you at <strong>${phone}</strong> during your preferred time: <strong>${preferredTime}</strong>.</p>
        
        <div class="details">
          <h3>Your Request Details:</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Preferred Time:</strong> ${preferredTime}</p>
          <p><strong>Message:</strong> ${message}</p>
        </div>
        
        <p>If you need to make any changes to your request or have any questions before we call, please contact us at support@jetsetgo.com or call us at +1 (555) 123-4567.</p>
        
        <p>We look forward to helping you plan your perfect cruise!</p>
        
        <p>Best regards,<br>The JetSetGo Team</p>
      </div>
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2025 JetSetGo. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate HTML email template for package callback confirmation
 * @param {Object} data - Callback data
 * @returns {string} - HTML email content
 */
function generatePackageCallbackTemplate(data) {
  const {
    name,
    email,
    phone,
    request = 'None',
    packageName = 'Travel Package',
    budget = 'Not specified',
    travelDate = 'Not specified',
    guests = 'Not specified'
  } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background-color: #2B4D6F; padding: 20px; text-align: center; color: white; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background-color: #f1f1f1; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Travel Package Quote Request</h1>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Thank you for requesting a quote for our <strong>${packageName}</strong>. We have received your request and will prepare a customized quote based on your requirements.</p>
        
        <div class="details">
          <h3>Your Request Details:</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Package:</strong> ${packageName}</p>
          <p><strong>Travel Date:</strong> ${travelDate}</p>
          <p><strong>Guests:</strong> ${guests}</p>
          <p><strong>Budget Range:</strong> ${budget}</p>
          <p><strong>Special Requests:</strong> ${request}</p>
        </div>
        
        <p>A travel expert will contact you within 24 hours to discuss your requirements and provide you with a detailed quote.</p>
        
        <p>If you have any questions in the meantime, please feel free to contact us at support@jetsetgo.com or call us at +1 (555) 123-4567.</p>
        
        <p>We look forward to helping you plan your perfect getaway!</p>
        
        <p>Best regards,<br>The JetSetGo Team</p>
      </div>
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2025 JetSetGo. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate HTML email template for rental callback confirmation
 * @param {Object} data - Callback data
 * @returns {string} - HTML email content
 */
function generateRentalCallbackTemplate(data) {
  const {
    name,
    phone,
    preferredTime = 'Not specified',
    message = 'None',
    hotelName = 'Not specified',
    checkIn = 'Not specified',
    checkOut = 'Not specified',
    guests = 'Not specified',
    roomType = 'Not specified',
    totalPrice = 'Not specified'
  } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background-color: #0061ff; padding: 20px; text-align: center; color: white; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background-color: #f1f1f1; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .price { font-size: 24px; color: #0061ff; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Hotel Booking Request Confirmation</h1>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Thank you for your interest in booking at <strong>${hotelName}</strong>. We have received your callback request and a member of our team will call you at <strong>${phone}</strong> during your preferred time: <strong>${preferredTime}</strong>.</p>
        
        <div class="details">
          <h3>Your Booking Details:</h3>
          <p><strong>Hotel:</strong> ${hotelName}</p>
          <p><strong>Check-in Date:</strong> ${checkIn}</p>
          <p><strong>Check-out Date:</strong> ${checkOut}</p>
          <p><strong>Guests:</strong> ${guests}</p>
          <p><strong>Room Type:</strong> ${roomType}</p>
          <p><strong>Total Price:</strong> <span class="price">$${totalPrice}</span></p>
        </div>
        
        <div class="details">
          <h3>Your Contact Information:</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Preferred Callback Time:</strong> ${preferredTime}</p>
          <p><strong>Message:</strong> ${message}</p>
        </div>
        
        <p>If you need to make any changes to your request or have any questions before we call, please contact us at support@jetsetgo.com or call us at +1 (555) 123-4567.</p>
        
        <p>We look forward to confirming your booking and ensuring you have a wonderful stay at ${hotelName}!</p>
        
        <p>Best regards,<br>The JetSetGo Team</p>
      </div>
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2025 JetSetGo. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate default HTML email template for callback confirmation
 * @param {Object} data - Callback data
 * @returns {string} - HTML email content
 */
function generateDefaultCallbackTemplate(data) {
  const { name, phone, email = 'Not provided' } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background-color: #333; padding: 20px; text-align: center; color: white; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background-color: #f1f1f1; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Request Confirmation</h1>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Thank you for contacting JetSetGo. We have received your request and a member of our team will contact you shortly.</p>
        
        <p>Your contact information:</p>
        <p>Name: ${name}</p>
        <p>Phone: ${phone}</p>
        <p>Email: ${email}</p>
        
        <p>Best regards,<br>The JetSetGo Team</p>
      </div>
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2025 JetSetGo. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Strip HTML tags from a string
 * @param {string} html - HTML string
 * @returns {string} - Plain text version
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate professional inquiry received email template for customers
 * @param {Object} data - Inquiry data
 * @returns {string} - HTML email content
 */
export function generateInquiryReceivedTemplate(data) {
  const { customerName, inquiryType, inquiryId, customerEmail } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: #f4f4f4;
        }
        .container { 
          background-color: white; 
          margin: 20px auto; 
          border-radius: 10px; 
          overflow: hidden; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header { 
          background: linear-gradient(135deg, #0066b2 0%, #004d8a 100%); 
          padding: 30px 20px; 
          text-align: center; 
          color: white; 
        }
        .header h1 { 
          margin: 0; 
          font-size: 28px; 
          font-weight: 600;
        }
        .header p { 
          margin: 10px 0 0; 
          font-size: 14px; 
          opacity: 0.9;
        }
        .content { 
          padding: 30px 25px; 
        }
        .content p { 
          margin: 15px 0; 
          font-size: 15px;
        }
        .info-box { 
          background-color: #f8f9fa; 
          padding: 20px; 
          margin: 20px 0; 
          border-radius: 8px; 
          border-left: 4px solid #0066b2;
        }
        .info-box h3 { 
          margin: 0 0 15px; 
          color: #0066b2; 
          font-size: 18px;
        }
        .info-row { 
          display: flex; 
          padding: 8px 0; 
          border-bottom: 1px solid #e0e0e0;
        }
        .info-row:last-child { 
          border-bottom: none;
        }
        .info-label { 
          font-weight: 600; 
          min-width: 140px; 
          color: #555;
        }
        .info-value { 
          color: #333;
        }
        .cta-button { 
          display: inline-block; 
          background-color: #0066b2; 
          color: white !important; 
          padding: 14px 30px; 
          text-decoration: none; 
          border-radius: 6px; 
          margin: 20px 0; 
          font-weight: 600;
          transition: background-color 0.3s;
        }
        .cta-button:hover { 
          background-color: #004d8a;
        }
        .highlight { 
          background-color: #fff3cd; 
          padding: 15px; 
          border-left: 4px solid #ffc107; 
          margin: 20px 0; 
          border-radius: 4px;
        }
        .footer { 
          background-color: #f8f9fa; 
          padding: 25px; 
          text-align: center; 
          font-size: 13px; 
          color: #666; 
          border-top: 1px solid #e0e0e0;
        }
        .footer p { 
          margin: 8px 0;
        }
        .contact-info { 
          margin: 15px 0;
        }
        .contact-info a { 
          color: #0066b2; 
          text-decoration: none;
        }
        @media only screen and (max-width: 600px) {
          .info-row { 
            flex-direction: column;
          }
          .info-label { 
            margin-bottom: 5px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✈️ Inquiry Received!</h1>
          <p>Thank you for choosing JetSet</p>
        </div>
        
        <div class="content">
          <p>Dear ${customerName},</p>
          
          <p>We have successfully received your travel inquiry and our expert team is reviewing your request. We're excited to help you plan your perfect journey!</p>
          
          <div class="info-box">
            <h3>📋 Your Inquiry Details</h3>
            <div class="info-row">
              <div class="info-label">Inquiry Type:</div>
              <div class="info-value">${inquiryType.charAt(0).toUpperCase() + inquiryType.slice(1)}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Inquiry ID:</div>
              <div class="info-value">#${inquiryId}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Email:</div>
              <div class="info-value">${customerEmail}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Status:</div>
              <div class="info-value">Pending Review</div>
            </div>
          </div>
          
          <div class="highlight">
            <strong>⏰ What happens next?</strong>
            <p style="margin: 10px 0 0;">Our travel experts will review your inquiry and send you a personalized quote within <strong>24 hours</strong>. You'll receive an email notification as soon as your quote is ready.</p>
          </div>
          
          <p>In the meantime, feel free to explore more travel options on our website or contact us if you have any questions.</p>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://jetset-app.com'}/my-trips" class="cta-button">
              View My Trips
            </a>
          </div>
          
          <div class="contact-info">
            <p><strong>Need immediate assistance?</strong></p>
            <p>📧 Email: <a href="mailto:support@jetset.com">support@jetset.com</a></p>
            <p>📞 Phone: +1 (555) 123-4567</p>
            <p>💬 Live Chat: Available on our website</p>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>JetSet Travel Agency</strong></p>
          <p>Your trusted partner for unforgettable journeys</p>
          <p style="margin-top: 15px; color: #999;">This is an automated confirmation. Please do not reply to this email.</p>
          <p>&copy; 2025 JetSet. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate professional inquiry notification email template for admins
 * @param {Object} data - Inquiry data
 * @returns {string} - HTML email content
 */
export function generateAdminInquiryNotificationTemplate(data) {
  const { customerName, customerEmail, inquiryType, inquiryId, travelDetails } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: #f4f4f4;
        }
        .container { 
          background-color: white; 
          margin: 20px auto; 
          border-radius: 10px; 
          overflow: hidden; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header { 
          background: linear-gradient(135deg, #dc3545 0%, #a52834 100%); 
          padding: 30px 20px; 
          text-align: center; 
          color: white; 
        }
        .header h1 { 
          margin: 0; 
          font-size: 26px; 
          font-weight: 600;
        }
        .badge { 
          display: inline-block; 
          background-color: #ffc107; 
          color: #000; 
          padding: 5px 15px; 
          border-radius: 20px; 
          font-size: 12px; 
          font-weight: 600; 
          margin-top: 10px;
        }
        .content { 
          padding: 30px 25px; 
        }
        .alert { 
          background-color: #fff3cd; 
          border-left: 4px solid #ffc107; 
          padding: 15px; 
          margin: 20px 0; 
          border-radius: 4px;
        }
        .customer-info { 
          background-color: #e7f3ff; 
          padding: 20px; 
          margin: 20px 0; 
          border-radius: 8px; 
          border-left: 4px solid #0066b2;
        }
        .customer-info h3 { 
          margin: 0 0 15px; 
          color: #0066b2; 
          font-size: 18px;
        }
        .info-row { 
          padding: 8px 0; 
          border-bottom: 1px solid #d0e7ff;
        }
        .info-row:last-child { 
          border-bottom: none;
        }
        .info-label { 
          font-weight: 600; 
          color: #0066b2; 
          display: inline-block; 
          min-width: 140px;
        }
        .cta-button { 
          display: inline-block; 
          background-color: #dc3545; 
          color: white !important; 
          padding: 14px 30px; 
          text-decoration: none; 
          border-radius: 6px; 
          margin: 20px 0; 
          font-weight: 600;
          text-align: center;
        }
        .footer { 
          background-color: #f8f9fa; 
          padding: 25px; 
          text-align: center; 
          font-size: 13px; 
          color: #666; 
          border-top: 1px solid #e0e0e0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 New Travel Inquiry</h1>
          <span class="badge">ACTION REQUIRED</span>
        </div>
        
        <div class="content">
          <div class="alert">
            <strong>⚠️ New inquiry received!</strong> A customer is waiting for your response.
          </div>
          
          <p>A new travel inquiry has been submitted and requires your attention.</p>
          
          <div class="customer-info">
            <h3>👤 Customer Information</h3>
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span>${customerName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span>${customerEmail}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Inquiry Type:</span>
              <span>${inquiryType.charAt(0).toUpperCase() + inquiryType.slice(1)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Inquiry ID:</span>
              <span>#${inquiryId}</span>
            </div>
            ${travelDetails ? `
            <div class="info-row">
              <span class="info-label">Details:</span>
              <span>${travelDetails}</span>
            </div>
            ` : ''}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://jetset-app.com'}/admin/inquiries/${inquiryId}" class="cta-button">
              View Inquiry & Create Quote
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;"><strong>Response Time:</strong> Please respond within 24 hours to maintain customer satisfaction.</p>
        </div>
        
        <div class="footer">
          <p><strong>JetSet Admin Panel</strong></p>
          <p>&copy; 2025 JetSet. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate professional quote sent email template for customers
 * @param {Object} data - Quote data
 * @returns {string} - HTML email content
 */
export function generateQuoteSentTemplate(data) {
  const { customerName, quoteNumber, totalAmount, currency, expiresAt, quoteLink, breakdown } = data;

  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: #f4f4f4;
        }
        .container { 
          background-color: white; 
          margin: 20px auto; 
          border-radius: 10px; 
          overflow: hidden; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header { 
          background: linear-gradient(135deg, #28a745 0%, #20873a 100%); 
          padding: 30px 20px; 
          text-align: center; 
          color: white; 
        }
        .header h1 { 
          margin: 0; 
          font-size: 28px; 
          font-weight: 600;
        }
        .header p { 
          margin: 10px 0 0; 
          font-size: 14px; 
          opacity: 0.9;
        }
        .content { 
          padding: 30px 25px; 
        }
        .quote-summary { 
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); 
          padding: 25px; 
          margin: 25px 0; 
          border-radius: 10px; 
          text-align: center; 
          border: 2px solid #28a745;
        }
        .quote-number { 
          font-size: 14px; 
          color: #666; 
          margin-bottom: 10px;
        }
        .total-amount { 
          font-size: 42px; 
          font-weight: 700; 
          color: #28a745; 
          margin: 15px 0;
        }
        .currency { 
          font-size: 24px; 
          vertical-align: super;
        }
        .expiry-notice { 
          background-color: #fff3cd; 
          border-left: 4px solid #ffc107; 
          padding: 15px; 
          margin: 20px 0; 
          border-radius: 4px;
        }
        .breakdown { 
          margin: 20px 0;
        }
        .breakdown-item { 
          display: flex; 
          justify-content: space-between; 
          padding: 12px 15px; 
          background-color: #f8f9fa; 
          margin: 8px 0; 
          border-radius: 6px;
        }
        .cta-button { 
          display: inline-block; 
          background-color: #28a745; 
          color: white !important; 
          padding: 16px 40px; 
          text-decoration: none; 
          border-radius: 8px; 
          margin: 25px 0; 
          font-weight: 600; 
          font-size: 16px;
          box-shadow: 0 4px 6px rgba(40, 167, 69, 0.3);
        }
        .footer { 
          background-color: #f8f9fa; 
          padding: 25px; 
          text-align: center; 
          font-size: 13px; 
          color: #666; 
          border-top: 1px solid #e0e0e0;
        }
        .contact-info { 
          margin: 20px 0; 
          padding: 15px; 
          background-color: #f8f9fa; 
          border-radius: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Your Travel Quote is Ready!</h1>
          <p>We've prepared a personalized quote just for you</p>
        </div>
        
        <div class="content">
          <p>Dear ${customerName},</p>
          
          <p>Great news! Our travel experts have prepared your personalized quote. We've carefully selected the best options for your journey.</p>
          
          <div class="quote-summary">
            <div class="quote-number">Quote Number: <strong>${quoteNumber}</strong></div>
            <div class="total-amount">
              <span class="currency">${currency}</span> ${totalAmount.toLocaleString()}
            </div>
            <p style="margin: 10px 0 0; color: #666;">Total Estimated Cost</p>
          </div>
          
          ${breakdown && breakdown.length > 0 ? `
          <div class="breakdown">
            <h3 style="color: #28a745; margin-bottom: 15px;">💰 Cost Breakdown</h3>
            ${breakdown.map(item => `
              <div class="breakdown-item">
                <span>${item.description || item.name}</span>
                <strong>${currency} ${(item.amount || item.price || 0).toLocaleString()}</strong>
              </div>
            `).join('')}
          </div>
          ` : ''}
          
          <div class="expiry-notice">
            <strong>⏰ Important:</strong> This quote is valid until <strong>${expiryDate}</strong>. 
            Book before this date to secure these prices and availability!
          </div>
          
          <div style="text-align: center;">
            <a href="${quoteLink}" class="cta-button">
              View Full Quote & Book Now
            </a>
          </div>
          
          <div class="contact-info">
            <p><strong>Have questions about your quote?</strong></p>
            <p>Our travel experts are here to help!</p>
            <p>📧 Email: support@jetset.com | 📞 Phone: +1 (555) 123-4567</p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            <strong>Next Steps:</strong><br>
            1. Review your quote details<br>
            2. Contact us if you have any questions<br>
            3. Book your trip before the quote expires
          </p>
        </div>
        
        <div class="footer">
          <p><strong>JetSet Travel Agency</strong></p>
          <p>Creating unforgettable travel experiences since 2020</p>
          <p style="margin-top: 15px; color: #999;">This quote was generated based on your inquiry. Prices subject to availability.</p>
          <p>&copy; 2025 JetSet. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send newsletter subscription welcome email to subscriber
 * @param {string} email - Subscriber email
 * @param {string} source - Source page (flights, hotels, packages, etc.)
 * @returns {Promise} - Email send response
 */
export const sendSubscriberWelcomeEmail = async (email, source = 'website') => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: #f4f4f4;
        }
        .container { 
          background-color: white; 
          margin: 20px auto; 
          border-radius: 10px; 
          overflow: hidden; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header { 
          background: linear-gradient(135deg, #055B75 0%, #033d4f 100%); 
          padding: 40px 20px; 
          text-align: center; 
          color: white; 
        }
        .header h1 { 
          margin: 0; 
          font-size: 28px; 
          font-weight: 600;
        }
        .header p { 
          margin: 15px 0 0; 
          font-size: 16px; 
          opacity: 0.9;
        }
        .content { 
          padding: 30px 25px; 
        }
        .welcome-box {
          background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 20px 0;
        }
        .welcome-box h2 {
          color: #2e7d32;
          margin: 0 0 10px;
        }
        .benefits {
          background-color: #f8f9fa;
          padding: 20px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .benefits h3 {
          color: #055B75;
          margin: 0 0 15px;
        }
        .benefit-item {
          padding: 10px 0;
          border-bottom: 1px solid #e0e0e0;
        }
        .benefit-item:last-child {
          border-bottom: none;
        }
        .cta-button { 
          display: inline-block; 
          background-color: #055B75; 
          color: white !important; 
          padding: 14px 30px; 
          text-decoration: none; 
          border-radius: 6px; 
          margin: 20px 0; 
          font-weight: 600;
        }
        .footer { 
          background-color: #f8f9fa; 
          padding: 25px; 
          text-align: center; 
          font-size: 13px; 
          color: #666; 
          border-top: 1px solid #e0e0e0;
        }
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
            <p>Thank you for subscribing to our newsletter. Get ready for exclusive deals and travel inspiration!</p>
          </div>
          
          <p>Dear Traveler,</p>
          
          <p>Welcome aboard! You've successfully subscribed to the JetSetters newsletter. We're excited to have you join our community of travel enthusiasts.</p>
          
          <div class="benefits">
            <h3>🎁 What You'll Receive:</h3>
            <div class="benefit-item">✨ <strong>Exclusive Deals</strong> - Up to 50% off on flights, hotels & packages</div>
            <div class="benefit-item">🌍 <strong>Travel Inspiration</strong> - Curated destination guides and tips</div>
            <div class="benefit-item">⏰ <strong>Early Access</strong> - Be first to know about flash sales</div>
            <div class="benefit-item">🎫 <strong>Member Perks</strong> - Special offers just for subscribers</div>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://jetsetterss.com'}" class="cta-button">
              Start Exploring
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            You subscribed from our ${source} page. If you didn't subscribe, please ignore this email.
          </p>
        </div>
        
        <div class="footer">
          <p><strong>JetSetters Travel</strong></p>
          <p>Your journey to extraordinary destinations starts here</p>
          <p style="margin-top: 15px;">
            <a href="${process.env.FRONTEND_URL || 'https://jetsetterss.com'}/unsubscribe?email=${email}" style="color: #999;">Unsubscribe</a>
          </p>
          <p>&copy; 2025 JetSetters. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    // Send directly to subscriber using verified domain
    const response = await resend.emails.send({
      from: 'JetSetters <noreply@jetsetterss.com>',
      to: [email],
      subject: '🎉 Welcome to JetSetters Newsletter!',
      html,
      text: stripHtml(html)
    });

    console.log('Subscriber welcome email sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending subscriber welcome email:', error);
    throw error;
  }
};

/**
 * Send admin notification email when someone subscribes
 * @param {string} email - Subscriber email
 * @param {string} source - Source page
 * @returns {Promise} - Email send response
 */
export const sendAdminSubscriptionNotification = async (email, source = 'website') => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto;
        }
        .container { 
          background-color: white; 
          border-radius: 10px; 
          overflow: hidden; 
          border: 1px solid #e0e0e0;
        }
        .header { 
          background: linear-gradient(135deg, #28a745 0%, #20873a 100%); 
          padding: 25px; 
          text-align: center; 
          color: white; 
        }
        .content { 
          padding: 25px; 
        }
        .subscriber-info {
          background-color: #e8f5e9;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #28a745;
          margin: 15px 0;
        }
        .footer { 
          background-color: #f8f9fa; 
          padding: 15px; 
          text-align: center; 
          font-size: 12px; 
          color: #666;
        }
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
            <p><strong>📍 Source:</strong> ${source} page</p>
            <p><strong>🕐 Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            This subscriber has been added to your mailing list and will receive future newsletters and promotions.
          </p>
        </div>
        
        <div class="footer">
          <p>JetSetters Admin Notification</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const adminEmail = process.env.COMPANY_EMAIL || 'jetsetters721@gmail.com';

    const response = await resend.emails.send({
      from: 'JetSetters <noreply@jetsetterss.com>',
      to: [adminEmail],
      subject: `📬 New Subscriber: ${email}`,
      html,
      text: stripHtml(html)
    });

    console.log('Admin notification email sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending admin notification email:', error);
    throw error;
  }
};

/**
 * Send both subscriber welcome and admin notification emails
 * @param {string} email - Subscriber email
 * @param {string} source - Source page
 * @returns {Promise} - Combined email send response
 */
export const sendSubscriptionEmails = async (email, source = 'website') => {
  try {
    const [subscriberResult, adminResult] = await Promise.all([
      sendSubscriberWelcomeEmail(email, source),
      sendAdminSubscriptionNotification(email, source)
    ]);

    return {
      success: true,
      subscriberEmail: subscriberResult,
      adminNotification: adminResult
    };
  } catch (error) {
    console.error('Error sending subscription emails:', error);
    throw error;
  }
};

/**
 * Send contact form confirmation email to customer
 * @param {string} name - Customer name
 * @param {string} email - Customer email
 * @param {string} message - Customer message
 * @returns {Promise} - Email send response
 */
export const sendContactConfirmationEmail = async (name, email, message) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
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

  try {
    const response = await resend.emails.send({
      from: 'JetSetters <noreply@jetsetterss.com>',
      to: [email],
      subject: '✉️ We\'ve Received Your Message - JetSetters',
      html,
      text: stripHtml(html)
    });

    console.log('Contact confirmation email sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending contact confirmation email:', error);
    throw error;
  }
};

/**
 * Send contact form notification to admin
 * @param {string} name - Customer name
 * @param {string} email - Customer email
 * @param {string} message - Customer message
 * @returns {Promise} - Email send response
 */
export const sendContactAdminNotification = async (name, email, message) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
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

  try {
    const adminEmail = process.env.COMPANY_EMAIL || 'jetsetters721@gmail.com';

    const response = await resend.emails.send({
      from: 'JetSetters <noreply@jetsetterss.com>',
      to: [adminEmail],
      subject: `📩 New Contact: ${name} - ${email}`,
      html,
      text: stripHtml(html)
    });

    console.log('Contact admin notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending contact admin notification:', error);
    throw error;
  }
};

/**
 * Send both contact confirmation and admin notification emails
 * @param {string} name - Customer name
 * @param {string} email - Customer email
 * @param {string} message - Customer message
 * @returns {Promise} - Combined email send response
 */
export const sendContactNotificationEmails = async (name, email, message) => {
  try {
    const [customerResult, adminResult] = await Promise.all([
      sendContactConfirmationEmail(name, email, message),
      sendContactAdminNotification(name, email, message)
    ]);

    return {
      success: true,
      customerEmail: customerResult,
      adminNotification: adminResult
    };
  } catch (error) {
    console.error('Error sending contact notification emails:', error);
    throw error;
  }
};

export default emailService;
