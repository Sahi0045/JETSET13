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
        from: 'Jetsetters <noreply@jetsetterss.com>',
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
 * Generate HTML email template for cruise callback confirmation - Airbnb Style
 * @param {Object} data - Callback data
 * @returns {string} - HTML email content
 */
function generateCruiseCallbackTemplate(data) {
  const { name, phone, preferredTime = 'Not specified', message = 'None' } = data;
  const firstName = name ? name.split(' ')[0] : 'there';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body, html { margin: 0; padding: 0; font-family: 'Circular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #222222; background-color: #f7f7f7; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { padding: 32px 48px 24px; }
        .logo { font-size: 24px; font-weight: 600; color: #055B75; text-decoration: none; }
        .hero { padding: 24px 48px 32px; }
        .hero-emoji { font-size: 48px; margin-bottom: 16px; }
        .hero-title { font-size: 26px; font-weight: 600; color: #222222; margin: 0 0 8px; line-height: 1.3; }
        .hero-subtitle { font-size: 17px; color: #717171; margin: 0; }
        .content { padding: 0 48px 32px; }
        .text { font-size: 16px; color: #484848; margin: 0 0 20px; line-height: 1.6; }
        .details-card { background-color: #f7f7f7; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .details-title { font-size: 14px; font-weight: 600; color: #222222; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ebebeb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-size: 14px; color: #717171; }
        .detail-value { font-size: 14px; color: #222222; font-weight: 500; }
        .highlight-box { background-color: #f0fdf4; border-left: 3px solid #22c55e; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0; }
        .highlight-text { font-size: 15px; color: #166534; margin: 0; }
        .footer { padding: 32px 48px; text-align: center; border-top: 1px solid #ebebeb; }
        .footer-text { font-size: 12px; color: #717171; margin: 0 0 8px; }
        @media (max-width: 600px) { .header, .hero, .content, .footer { padding-left: 24px; padding-right: 24px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="#" class="logo">jetsetters</a>
        </div>
        
        <div class="hero">
          <div class="hero-emoji">🛳️</div>
          <h1 class="hero-title">We'll call you soon, ${firstName}!</h1>
          <p class="hero-subtitle">Your cruise consultation is confirmed</p>
        </div>
        
        <div class="content">
          <p class="text">
            Thanks for your interest in exploring the world by sea! Our cruise specialists have received your request and will reach out to discuss your dream voyage.
          </p>
          
          <div class="highlight-box">
            <p class="highlight-text">📞 Expect a call at <strong>${phone}</strong> during <strong>${preferredTime}</strong></p>
          </div>
          
          <div class="details-card">
            <p class="details-title">Your request details</p>
            <div class="detail-row">
              <span class="detail-label">Name</span>
              <span class="detail-value">${name}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Phone</span>
              <span class="detail-value">${phone}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Preferred time</span>
              <span class="detail-value">${preferredTime}</span>
            </div>
            ${message !== 'None' ? `
            <div class="detail-row">
              <span class="detail-label">Your message</span>
              <span class="detail-value">${message}</span>
            </div>
            ` : ''}
          </div>
          
          <p class="text">
            Have questions before we call? Reach us anytime at <strong>support@jetsetterss.com</strong> or <strong>(877) 538-7380</strong>.
          </p>
        </div>
        
        <div class="footer">
          <p class="footer-text">Sent with ❤️ from jetsetters</p>
          <p class="footer-text">© 2026 jetsetters. All rights reserved.</p>
        </div>
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
/**
 * Generate HTML email template for package callback confirmation - Airbnb Style
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

  const firstName = name ? name.split(' ')[0] : 'there';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body, html { margin: 0; padding: 0; font-family: 'Circular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #222222; background-color: #f7f7f7; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { padding: 32px 48px 24px; }
        .logo { font-size: 24px; font-weight: 600; color: #055B75; text-decoration: none; }
        .hero { padding: 24px 48px 32px; }
        .hero-emoji { font-size: 48px; margin-bottom: 16px; }
        .hero-title { font-size: 26px; font-weight: 600; color: #222222; margin: 0 0 8px; line-height: 1.3; }
        .hero-subtitle { font-size: 17px; color: #717171; margin: 0; }
        .content { padding: 0 48px 32px; }
        .text { font-size: 16px; color: #484848; margin: 0 0 20px; line-height: 1.6; }
        .details-card { background-color: #f7f7f7; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .details-title { font-size: 14px; font-weight: 600; color: #222222; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ebebeb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-size: 14px; color: #717171; }
        .detail-value { font-size: 14px; color: #222222; font-weight: 500; text-align: right; max-width: 60%; }
        .footer { padding: 32px 48px; text-align: center; border-top: 1px solid #ebebeb; }
        .footer-text { font-size: 12px; color: #717171; margin: 0 0 8px; }
        @media (max-width: 600px) { .header, .hero, .content, .footer { padding-left: 24px; padding-right: 24px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="#" class="logo">jetsetters</a>
        </div>
        
        <div class="hero">
          <div class="hero-emoji">🌴</div>
          <h1 class="hero-title">Quote request received!</h1>
          <p class="hero-subtitle">We're crafting your perfect getaway, ${firstName}</p>
        </div>
        
        <div class="content">
          <p class="text">
            Thanks for asking about our <strong>${packageName}</strong>. Our travel experts are already looking into the best options for your trip and will send you a personalized quote shortly.
          </p>
          
          <div class="details-card">
            <p class="details-title">Your trip details</p>
            <div class="detail-row">
              <span class="detail-label">Package</span>
              <span class="detail-value">${packageName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Dates</span>
              <span class="detail-value">${travelDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Travelers</span>
              <span class="detail-value">${guests}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Budget</span>
              <span class="detail-value">${budget}</span>
            </div>
            ${request !== 'None' ? `
            <div class="detail-row">
              <span class="detail-label">Special requests</span>
              <span class="detail-value">${request}</span>
            </div>
            ` : ''}
          </div>
          
          <p class="text">
            Sit tight! We'll be in touch within 24 hours. If you need anything else, just reply to this email.
          </p>
        </div>
        
        <div class="footer">
          <p class="footer-text">Sent with ❤️ from jetsetters</p>
          <p class="footer-text">© 2026 jetsetters. All rights reserved.</p>
        </div>
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
/**
 * Generate HTML email template for rental callback confirmation - Airbnb Style
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

  const firstName = name ? name.split(' ')[0] : 'there';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body, html { margin: 0; padding: 0; font-family: 'Circular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #222222; background-color: #f7f7f7; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { padding: 32px 48px 24px; }
        .logo { font-size: 24px; font-weight: 600; color: #055B75; text-decoration: none; }
        .hero { padding: 24px 48px 32px; }
        .hero-emoji { font-size: 48px; margin-bottom: 16px; }
        .hero-title { font-size: 26px; font-weight: 600; color: #222222; margin: 0 0 8px; line-height: 1.3; }
        .hero-subtitle { font-size: 17px; color: #717171; margin: 0; }
        .content { padding: 0 48px 32px; }
        .text { font-size: 16px; color: #484848; margin: 0 0 20px; line-height: 1.6; }
        .details-card { background-color: #f7f7f7; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .details-title { font-size: 14px; font-weight: 600; color: #222222; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ebebeb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-size: 14px; color: #717171; }
        .detail-value { font-size: 14px; color: #222222; font-weight: 500; text-align: right; }
        .highlight-box { background-color: #f0fdf4; border-left: 3px solid #22c55e; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0; }
        .highlight-text { font-size: 15px; color: #166534; margin: 0; }
        .footer { padding: 32px 48px; text-align: center; border-top: 1px solid #ebebeb; }
        .footer-text { font-size: 12px; color: #717171; margin: 0 0 8px; }
        @media (max-width: 600px) { .header, .hero, .content, .footer { padding-left: 24px; padding-right: 24px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="#" class="logo">jetsetters</a>
        </div>
        
        <div class="hero">
          <div class="hero-emoji">🏨</div>
          <h1 class="hero-title">Booking request received!</h1>
          <p class="hero-subtitle">We're confirming your stay at ${hotelName}</p>
        </div>
        
        <div class="content">
          <p class="text">
            Great choice, ${firstName}! We've received your request and our hotel team is working to secure your reservation.
          </p>
          
          <div class="highlight-box">
            <p class="highlight-text">📞 We'll call you at <strong>${phone}</strong> during <strong>${preferredTime}</strong></p>
          </div>
          
          <div class="details-card">
            <p class="details-title">Stay details</p>
            <div class="detail-row">
              <span class="detail-label">Property</span>
              <span class="detail-value">${hotelName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Check-in</span>
              <span class="detail-value">${checkIn}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Check-out</span>
              <span class="detail-value">${checkOut}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Guests</span>
              <span class="detail-value">${guests}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Room type</span>
              <span class="detail-value">${roomType}</span>
            </div>
          </div>
          
          <p class="text">
             We'll be in touch shortly to finalize the booking. If you have any questions, feel free to reply to this email.
          </p>
        </div>
        
        <div class="footer">
          <p class="footer-text">Sent with ❤️ from jetsetters</p>
          <p class="footer-text">© 2026 jetsetters. All rights reserved.</p>
        </div>
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
/**
 * Generate default HTML email template for callback confirmation - Airbnb Style
 * @param {Object} data - Callback data
 * @returns {string} - HTML email content
 */
function generateDefaultCallbackTemplate(data) {
  const { name, phone, email = 'Not provided' } = data;
  const firstName = name ? name.split(' ')[0] : 'there';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body, html { margin: 0; padding: 0; font-family: 'Circular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #222222; background-color: #f7f7f7; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { padding: 32px 48px 24px; }
        .logo { font-size: 24px; font-weight: 600; color: #055B75; text-decoration: none; }
        .hero { padding: 24px 48px 32px; }
        .hero-emoji { font-size: 48px; margin-bottom: 16px; }
        .hero-title { font-size: 26px; font-weight: 600; color: #222222; margin: 0 0 8px; line-height: 1.3; }
        .hero-subtitle { font-size: 17px; color: #717171; margin: 0; }
        .content { padding: 0 48px 32px; }
        .text { font-size: 16px; color: #484848; margin: 0 0 20px; line-height: 1.6; }
        .details-card { background-color: #f7f7f7; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .details-title { font-size: 14px; font-weight: 600; color: #222222; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ebebeb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-size: 14px; color: #717171; }
        .detail-value { font-size: 14px; color: #222222; font-weight: 500; text-align: right; }
        .footer { padding: 32px 48px; text-align: center; border-top: 1px solid #ebebeb; }
        .footer-text { font-size: 12px; color: #717171; margin: 0 0 8px; }
        @media (max-width: 600px) { .header, .hero, .content, .footer { padding-left: 24px; padding-right: 24px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="#" class="logo">jetsetters</a>
        </div>
        
        <div class="hero">
          <div class="hero-emoji">✨</div>
          <h1 class="hero-title">We received your request, ${firstName}!</h1>
          <p class="hero-subtitle">Thanks for contacting jetsetters</p>
        </div>
        
        <div class="content">
          <p class="text">
            We've got your details and one of our team members will be in touch shortly to help you out.
          </p>
          
          <div class="details-card">
            <p class="details-title">Contact info provided</p>
            <div class="detail-row">
              <span class="detail-label">Name</span>
              <span class="detail-value">${name}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Phone</span>
              <span class="detail-value">${phone}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Email</span>
              <span class="detail-value">${email}</span>
            </div>
          </div>
          
          <p class="text">
            In the meantime, feel free to browse our <a href="https://jetsetterss.com" style="color: #055B75; text-decoration: none;">latest deals</a>.
          </p>
        </div>
        
        <div class="footer">
          <p class="footer-text">Sent with ❤️ from jetsetters</p>
          <p class="footer-text">© 2026 jetsetters. All rights reserved.</p>
        </div>
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
/**
 * Generate professional inquiry received email template for customers - Airbnb Style
 * @param {Object} data - Inquiry data
 * @returns {string} - HTML email content
 */
export function generateInquiryReceivedTemplate(data) {
  const { customerName, inquiryType, inquiryId, customerEmail } = data;
  const firstName = customerName ? customerName.split(' ')[0] : 'there';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body, html { margin: 0; padding: 0; font-family: 'Circular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #222222; background-color: #f7f7f7; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { padding: 32px 48px 24px; }
        .logo { font-size: 24px; font-weight: 600; color: #055B75; text-decoration: none; }
        .hero { padding: 24px 48px 32px; }
        .hero-emoji { font-size: 48px; margin-bottom: 16px; }
        .hero-title { font-size: 26px; font-weight: 600; color: #222222; margin: 0 0 8px; line-height: 1.3; }
        .hero-subtitle { font-size: 17px; color: #717171; margin: 0; }
        .content { padding: 0 48px 32px; }
        .text { font-size: 16px; color: #484848; margin: 0 0 20px; line-height: 1.6; }
        .details-card { background-color: #f7f7f7; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .details-title { font-size: 14px; font-weight: 600; color: #222222; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ebebeb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-size: 14px; color: #717171; }
        .detail-value { font-size: 14px; color: #222222; font-weight: 500; text-align: right; }
        .status-badge { display: inline-block; background-color: #fff8f6; color: #c13515; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 4px; }
        .cta-section { padding: 0 48px 40px; text-align: center; }
        .cta-button { display: inline-block; background-color: #055B75; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; }
        .footer { padding: 32px 48px; text-align: center; border-top: 1px solid #ebebeb; }
        .footer-text { font-size: 12px; color: #717171; margin: 0 0 8px; }
        @media (max-width: 600px) { .header, .hero, .content, .cta-section, .footer { padding-left: 24px; padding-right: 24px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="#" class="logo">jetsetters</a>
        </div>
        
        <div class="hero">
          <div class="hero-emoji">✈️</div>
          <h1 class="hero-title">Inquiry received!</h1>
          <p class="hero-subtitle">We're reviewing your request, ${firstName}</p>
        </div>
        
        <div class="content">
          <p class="text">
            Thanks for reaching out! We've received your inquiry and our travel experts are already on it. We'll get back to you with a personalized plan soon.
          </p>
          
          <div class="details-card">
            <p class="details-title">Inquiry details</p>
            <div class="detail-row">
              <span class="detail-label">Status</span>
              <span class="detail-value"><span class="status-badge">Pending Review</span></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Inquiry ID</span>
              <span class="detail-value">#${inquiryId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Type</span>
              <span class="detail-value">${inquiryType.charAt(0).toUpperCase() + inquiryType.slice(1)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Email</span>
              <span class="detail-value">${customerEmail}</span>
            </div>
          </div>
          
          <p class="text">
            For now, just sit back and relax. We'll notify you as soon as we have an update.
          </p>
        </div>
        
        <div class="cta-section">
          <a href="${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/my-trips" class="cta-button">
            View My Inquiries
          </a>
        </div>
        
        <div class="footer">
          <p class="footer-text">Sent with ❤️ from jetsetters</p>
          <p class="footer-text">© 2026 jetsetters. All rights reserved.</p>
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
/**
 * Generate professional quote sent email template for customers - Airbnb Style
 * @param {Object} data - Quote data
 * @returns {string} - HTML email content
 */
export function generateQuoteSentTemplate(data) {
  const { customerName, quoteNumber, totalAmount, currency, expiresAt, quoteLink, breakdown } = data;
  const firstName = customerName ? customerName.split(' ')[0] : 'there';

  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD'
  }).format(totalAmount || 0);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body, html { margin: 0; padding: 0; font-family: 'Circular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #222222; background-color: #f7f7f7; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { padding: 32px 48px 24px; }
        .logo { font-size: 24px; font-weight: 600; color: #055B75; text-decoration: none; }
        .hero { padding: 24px 48px 32px; }
        .hero-emoji { font-size: 48px; margin-bottom: 16px; }
        .hero-title { font-size: 26px; font-weight: 600; color: #222222; margin: 0 0 8px; line-height: 1.3; }
        .hero-subtitle { font-size: 17px; color: #717171; margin: 0; }
        .content { padding: 0 48px 32px; }
        .text { font-size: 16px; color: #484848; margin: 0 0 20px; line-height: 1.6; }
        .quote-card { border: 1px solid #dddddd; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
        .quote-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #ebebeb; }
        .amt-label { font-size: 14px; color: #717171; display: block; }
        .amt-value { font-size: 24px; font-weight: 700; color: #222222; display: block; }
        .quote-id { font-size: 14px; color: #717171; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f7f7f7; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-size: 14px; color: #717171; }
        .detail-value { font-size: 14px; color: #222222; font-weight: 500; }
        .expiry-banner { background-color: #fff8f6; border-radius: 8px; padding: 16px; margin: 24px 0; display: flex; align-items: center; }
        .expiry-icon { font-size: 20px; margin-right: 12px; }
        .expiry-text { font-size: 14px; color: #c13515; font-weight: 500; }
        .cta-section { padding: 0 48px 40px; text-align: center; }
        .cta-button { display: inline-block; background-color: #055B75; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; }
        .footer { padding: 32px 48px; text-align: center; border-top: 1px solid #ebebeb; }
        .footer-text { font-size: 12px; color: #717171; margin: 0 0 8px; }
        @media (max-width: 600px) { .header, .hero, .content, .cta-section, .footer { padding-left: 24px; padding-right: 24px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="#" class="logo">jetsetters</a>
        </div>
        
        <div class="hero">
          <div class="hero-emoji">🎉</div>
          <h1 class="hero-title">Your quote is ready!</h1>
          <p class="hero-subtitle">We've personalized this just for you, ${firstName}</p>
        </div>
        
        <div class="content">
          <p class="text">
            Good news! Our travel team has put together a custom plan for your upcoming trip. Review the details below to see what we've arranged for you.
          </p>
          
          <div class="quote-card">
            <div class="quote-header">
              <div>
                <span class="amt-label">Total Estimate</span>
                <span class="amt-value">${formattedAmount}</span>
              </div>
              <span class="quote-id">#${quoteNumber}</span>
            </div>
            
            ${breakdown && breakdown.length > 0 ? `
              <p style="margin: 0 0 12px; font-weight: 600; font-size: 14px;">Breakdown</p>
              ${breakdown.map(item => `
              <div class="detail-row">
                <span class="detail-label">${item.description || item.name}</span>
                <span class="detail-value">${new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(item.amount || item.price || 0)}</span>
              </div>
              `).join('')}
            ` : ''}
          </div>
          
          <div class="expiry-banner">
            <span class="expiry-icon">⏰</span>
            <span class="expiry-text">This quote expires on ${expiryDate}. Book soon to lock in this price!</span>
          </div>
          
          <p class="text">
            Ready to go? Click below to finalize your booking. If you have questions, just reply to this email.
          </p>
        </div>
        
        <div class="cta-section">
          <a href="${quoteLink}" class="cta-button">
            View Quote & Book
          </a>
        </div>
        
        <div class="footer">
          <p class="footer-text">Sent with ❤️ from jetsetters</p>
          <p class="footer-text">© 2026 jetsetters. All rights reserved.</p>
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

/**
 * Generate professional booking confirmation email template
 * @param {Object} data - Booking data
 * @returns {string} - HTML email content
 */
export function generateBookingConfirmationTemplate(data) {
  const {
    customerName,
    bookingReference,
    bookingType = 'travel',
    paymentAmount,
    currency = 'USD',
    paymentStatus = 'Paid',
    bookingDetails = {},
    travelDate,
    passengers = 1
  } = data;

  // Get type-specific details
  const getBookingIcon = () => {
    switch (bookingType.toLowerCase()) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'cruise': return '🚢';
      case 'package': return '🎒';
      default: return '🌍';
    }
  };

  const getBookingTitle = () => {
    switch (bookingType.toLowerCase()) {
      case 'flight': return 'Flight Booking';
      case 'hotel': return 'Hotel Reservation';
      case 'cruise': return 'Cruise Booking';
      case 'package': return 'Travel Package';
      default: return 'Travel Booking';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

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
          border-radius: 12px; 
          overflow: hidden; 
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header { 
          background: linear-gradient(135deg, #055B75 0%, #033d4f 100%); 
          padding: 40px 25px; 
          text-align: center; 
          color: white; 
        }
        .header h1 { 
          margin: 0; 
          font-size: 32px; 
          font-weight: 700;
        }
        .header p { 
          margin: 15px 0 0; 
          font-size: 16px; 
          opacity: 0.9;
        }
        .success-badge {
          display: inline-block;
          background: rgba(255,255,255,0.2);
          padding: 8px 20px;
          border-radius: 20px;
          margin-top: 15px;
          font-weight: 600;
        }
        .content { 
          padding: 35px 30px; 
        }
        .booking-card {
          background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
          border-radius: 12px;
          padding: 25px;
          margin: 25px 0;
          text-align: center;
          border: 2px solid #4caf50;
        }
        .booking-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .booking-ref {
          font-size: 14px;
          color: #666;
          margin-bottom: 5px;
        }
        .booking-ref-value {
          font-size: 24px;
          font-weight: 700;
          color: #2e7d32;
          letter-spacing: 2px;
        }
        .amount-box {
          background-color: #fff;
          padding: 15px;
          border-radius: 8px;
          margin-top: 15px;
        }
        .amount-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
        }
        .amount-value {
          font-size: 28px;
          font-weight: 700;
          color: #055B75;
        }
        .details-section {
          background-color: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .details-section h3 {
          color: #055B75;
          margin: 0 0 15px;
          font-size: 16px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #e0e0e0;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          color: #666;
          font-size: 14px;
        }
        .detail-value {
          color: #333;
          font-weight: 600;
          font-size: 14px;
        }
        .cta-section {
          text-align: center;
          margin: 30px 0;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #055B75 0%, #033d4f 100%);
          color: white !important;
          padding: 16px 40px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          box-shadow: 0 4px 12px rgba(5, 91, 117, 0.3);
        }
        .important-info {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          border-radius: 4px;
          margin: 20px 0;
        }
        .contact-box {
          background-color: #e3f2fd;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 25px 0;
        }
        .contact-box h4 {
          color: #1565c0;
          margin: 0 0 10px;
        }
        .footer { 
          background-color: #055B75; 
          padding: 25px; 
          text-align: center; 
          color: white;
        }
        .footer p {
          margin: 5px 0;
          font-size: 13px;
        }
        .footer a {
          color: #B9D0DC;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${getBookingIcon()} Booking Confirmed!</h1>
          <p>Thank you for choosing Jetsetters</p>
          <div class="success-badge">✓ ${paymentStatus}</div>
        </div>
        
        <div class="content">
          <p>Dear ${customerName},</p>
          
          <p>Great news! Your ${getBookingTitle().toLowerCase()} has been successfully confirmed. Below are your booking details:</p>
          
          <div class="booking-card">
            <div class="booking-icon">${getBookingIcon()}</div>
            <div class="booking-ref">Booking Reference</div>
            <div class="booking-ref-value">${bookingReference}</div>
            <div class="amount-box">
              <div class="amount-label">Total Amount</div>
              <div class="amount-value">${formatCurrency(paymentAmount)}</div>
            </div>
          </div>
          
          <div class="details-section">
            <h3>📋 Booking Details</h3>
            <div class="detail-row">
              <span class="detail-label">Booking Type</span>
              <span class="detail-value">${getBookingTitle()}</span>
            </div>
            ${travelDate ? `
            <div class="detail-row">
              <span class="detail-label">Travel Date</span>
              <span class="detail-value">${formatDate(travelDate)}</span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="detail-label">Travelers</span>
              <span class="detail-value">${passengers} ${passengers === 1 ? 'Person' : 'People'}</span>
            </div>
            ${bookingDetails.origin && bookingDetails.destination ? `
            <div class="detail-row">
              <span class="detail-label">Route</span>
              <span class="detail-value">${bookingDetails.origin} → ${bookingDetails.destination}</span>
            </div>
            ` : ''}
            ${bookingDetails.hotelName ? `
            <div class="detail-row">
              <span class="detail-label">Hotel</span>
              <span class="detail-value">${bookingDetails.hotelName}</span>
            </div>
            ` : ''}
            ${bookingDetails.cruiseLine ? `
            <div class="detail-row">
              <span class="detail-label">Cruise Line</span>
              <span class="detail-value">${bookingDetails.cruiseLine}</span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="detail-label">Payment Status</span>
              <span class="detail-value" style="color: #2e7d32;">✓ ${paymentStatus}</span>
            </div>
          </div>
          
          <div class="important-info">
            <strong>⏰ Important Reminders:</strong>
            <ul style="margin: 10px 0 0; padding-left: 20px;">
              <li>Save this email for your records</li>
              <li>Check-in opens 24-48 hours before departure</li>
              <li>Carry a valid photo ID for verification</li>
              <li>Arrive at least 2 hours early (3 hours for international)</li>
            </ul>
          </div>
          
          <div class="cta-section">
            <a href="${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/my-trips" class="cta-button">
              View My Trips
            </a>
          </div>
          
          <div class="contact-box">
            <h4>Need Assistance?</h4>
            <p>Our travel experts are here to help 24/7</p>
            <p>📧 support@jetsetterss.com | 📞 (877) 538-7380</p>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Jetsetters Travel</strong></p>
          <p>Your trusted partner for unforgettable journeys</p>
          <p style="margin-top: 15px; opacity: 0.8;">This is an automated confirmation. Please do not reply to this email.</p>
          <p>© 2025 Jetsetters. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send booking confirmation email to customer
 * @param {Object} bookingData - Booking information
 * @returns {Promise} - Email send response
 */
export const sendBookingConfirmationEmail = async (bookingData) => {
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
  } = bookingData;

  if (!customerEmail) {
    console.warn('⚠️ No customer email provided for booking confirmation');
    return { success: false, error: 'No email address' };
  }

  try {
    const html = generateBookingConfirmationTemplate({
      customerName: customerName || 'Valued Customer',
      bookingReference,
      bookingType,
      paymentAmount,
      currency,
      paymentStatus: 'Paid',
      travelDate,
      passengers,
      bookingDetails
    });

    const response = await resend.emails.send({
      from: 'Jetsetters <noreply@jetsetterss.com>',
      to: [customerEmail],
      subject: `✅ Booking Confirmed - ${bookingReference} | Jetsetters`,
      html,
      text: stripHtml(html)
    });

    console.log('✅ Booking confirmation email sent to:', customerEmail);
    return { success: true, data: response };
  } catch (error) {
    console.error('❌ Error sending booking confirmation email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send booking confirmation to both customer and admin
 * @param {Object} bookingData - Booking information
 * @returns {Promise} - Combined email send response
 */
export const sendBookingNotificationEmails = async (bookingData) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'jetsetters721@gmail.com';

    // Send confirmation to customer
    const customerResult = await sendBookingConfirmationEmail(bookingData);

    // Send notification to admin
    const adminHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; }
          .header { background: #055B75; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .info-row { padding: 10px 0; border-bottom: 1px solid #ddd; }
          .label { color: #666; font-size: 12px; }
          .value { font-weight: bold; color: #333; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>🎉 New Booking Received!</h2>
        </div>
        <div class="content">
          <div class="info-row">
            <div class="label">Customer</div>
            <div class="value">${bookingData.customerName} (${bookingData.customerEmail})</div>
          </div>
          <div class="info-row">
            <div class="label">Booking Reference</div>
            <div class="value">${bookingData.bookingReference}</div>
          </div>
          <div class="info-row">
            <div class="label">Type</div>
            <div class="value">${bookingData.bookingType}</div>
          </div>
          <div class="info-row">
            <div class="label">Amount</div>
            <div class="value">${bookingData.currency || 'USD'} ${bookingData.paymentAmount}</div>
          </div>
          <div class="info-row">
            <div class="label">Travel Date</div>
            <div class="value">${bookingData.travelDate || 'TBD'}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const adminResult = await resend.emails.send({
      from: 'Jetsetters <noreply@jetsetterss.com>',
      to: [adminEmail],
      subject: `🎉 New Booking: ${bookingData.bookingReference} - ${bookingData.customerName}`,
      html: adminHtml,
      text: stripHtml(adminHtml)
    });

    console.log('✅ Booking admin notification sent to:', adminEmail);

    return {
      success: true,
      customerEmail: customerResult,
      adminNotification: { success: true, data: adminResult }
    };
  } catch (error) {
    console.error('❌ Error sending booking notification emails:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Generate professional cancellation email template
 * @param {Object} data - Cancellation data
 * @returns {string} - HTML email content
 */
export function generateCancellationTemplate(data) {
  const {
    customerName,
    bookingReference,
    bookingType = 'travel',
    refundAmount,
    cancellationFee,
    currency = 'USD'
  } = data;

  const getBookingIcon = () => {
    switch (bookingType.toLowerCase()) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'cruise': return '🚢';
      case 'package': return '🎒';
      default: return '🌍';
    }
  };

  const getBookingTitle = () => {
    switch (bookingType.toLowerCase()) {
      case 'flight': return 'Flight';
      case 'hotel': return 'Hotel';
      case 'cruise': return 'Cruise';
      case 'package': return 'Package';
      default: return 'Travel';
    }
  };

  const formatCurrency = (amount) => {
    // Check if amount is undefined, null, or somehow a string that can't be parsed
    const numAmount = Number(amount);
    if (isNaN(numAmount)) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(0);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(numAmount);
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
        .container { background-color: white; margin: 20px auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #c13515 0%, #a52811 100%); padding: 40px 25px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 32px; font-weight: 700; }
        .header p { margin: 15px 0 0; font-size: 16px; opacity: 0.9; }
        .content { padding: 35px 30px; }
        .cancellation-card { background: #fff8f6; border-radius: 12px; padding: 25px; margin: 25px 0; text-align: center; border: 2px solid #ffccc7; }
        .cancellation-icon { font-size: 48px; margin-bottom: 10px; }
        .booking-ref { font-size: 14px; color: #666; margin-bottom: 5px; }
        .booking-ref-value { font-size: 24px; font-weight: 700; color: #c13515; letter-spacing: 2px; }
        .amount-box { background-color: #fff; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #f0f0f0; }
        .amount-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .amount-label { font-size: 14px; color: #666; }
        .amount-value { font-size: 14px; font-weight: 600; color: #333; }
        .total-refund { border-top: 1px solid #e0e0e0; margin-top: 10px; padding-top: 10px; font-size: 16px; color: #2e7d32; font-weight: 700; }
        .details-section { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .contact-box { background-color: #e3f2fd; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0; }
        .contact-box h4 { color: #1565c0; margin: 0 0 10px; }
        .footer { background-color: #055B75; padding: 25px; text-align: center; color: white; }
        .footer p { margin: 5px 0; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Cancelled</h1>
          <p>Your ${getBookingTitle().toLowerCase()} booking has been successfully cancelled.</p>
        </div>
        
        <div class="content">
          <p>Dear ${customerName},</p>
          
          <p>This email is to confirm that your ${getBookingTitle().toLowerCase()} booking has been cancelled per your request.</p>
          
          <div class="cancellation-card">
            <div class="cancellation-icon">${getBookingIcon()}</div>
            <div class="booking-ref">Booking Reference</div>
            <div class="booking-ref-value">${bookingReference}</div>
            
            <div class="amount-box">
              <div class="amount-row">
                <span class="amount-label">Estimated Refund:</span>
                <span class="amount-value total-refund">${formatCurrency(refundAmount)}</span>
              </div>
              <div class="amount-row">
                <span class="amount-label">Cancellation Fee:</span>
                <span class="amount-value">${formatCurrency(cancellationFee)}</span>
              </div>
            </div>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">Please allow 5-10 business days for the refund to reflect in your account.</p>
          </div>
          
          <p>If you have any questions about this cancellation or your refund, our support team is ready to assist you.</p>
          
          <div class="contact-box">
            <h4>Need Assistance?</h4>
            <p>Our travel experts are here to help 24/7</p>
            <p>📧 support@jetsetterss.com | 📞 (877) 538-7380</p>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Jetsetters Travel</strong></p>
          <p>Your trusted partner for unforgettable journeys</p>
          <p>© 2026 Jetsetters. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send cancellation confirmation to both customer and admin
 * @param {Object} cancellationData - Cancellation information
 * @returns {Promise} - Combined email send response
 */
export const sendCancellationNotificationEmails = async (cancellationData) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'jetsetters721@gmail.com';
    const { customerEmail, customerName, bookingReference, bookingType, refundAmount, cancellationFee, currency } = cancellationData;

    if (!customerEmail) {
      console.warn('⚠️ No customer email provided for cancellation confirmation');
      return { success: false, error: 'No email address' };
    }

    // Send confirmation to customer
    const html = generateCancellationTemplate({
      customerName: customerName || 'Valued Customer',
      bookingReference,
      bookingType,
      refundAmount,
      cancellationFee,
      currency
    });

    const customerResult = await resend.emails.send({
      from: 'Jetsetters <noreply@jetsetterss.com>',
      to: [customerEmail],
      subject: `⚠️ Booking Cancelled - ${bookingReference} | Jetsetters`,
      html,
      text: stripHtml(html)
    });

    // Send notification to admin
    const adminHtml = `
      < !DOCTYPE html >
    <html>
      <head>
        <style>
          body {font - family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; }
          .header {background: #c13515; color: white; padding: 20px; text-align: center; }
          .content {padding: 20px; background: #f9f9f9; }
          .info-row {padding: 10px 0; border-bottom: 1px solid #ddd; }
          .label {color: #666; font-size: 12px; }
          .value {font - weight: bold; color: #333; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>⚠️ Booking Cancellation!</h2>
        </div>
        <div class="content">
          <div class="info-row">
            <div class="label">Customer</div>
            <div class="value">${customerName} (${customerEmail})</div>
          </div>
          <div class="info-row">
            <div class="label">Booking Reference</div>
            <div class="value">${bookingReference}</div>
          </div>
          <div class="info-row">
            <div class="label">Type</div>
            <div class="value">${bookingType}</div>
          </div>
          <div class="info-row">
            <div class="label">Refund Amount</div>
            <div class="value">${currency || 'USD'} ${refundAmount || 0}</div>
          </div>
          <div class="info-row">
            <div class="label">Cancellation Fee</div>
            <div class="value">${currency || 'USD'} ${cancellationFee || 0}</div>
          </div>
        </div>
      </body>
    </html>
    `;

    const adminResult = await resend.emails.send({
      from: 'Jetsetters <noreply@jetsetterss.com>',
      to: [adminEmail],
      subject: `⚠️ Cancellation: ${bookingReference} - ${customerName}`,
      html: adminHtml,
      text: stripHtml(adminHtml)
    });

    console.log('✅ Cancellation notification sent to:', customerEmail, 'and admin');

    return {
      success: true,
      customerEmail: customerResult,
      adminNotification: { success: true, data: adminResult }
    };
  } catch (error) {
    console.error('❌ Error sending cancellation notification emails:', error);
    return { success: false, error: error.message };
  }
};

export default emailService;

