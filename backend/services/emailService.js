import { Resend } from 'resend';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Resend with API key directly since .env is not accessible
const resend = new Resend('re_4tfvwTmv_9kPKorQAcpZmZcZ4i744cC1Q');

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
      from: 'JetSetGo <onboarding@resend.dev>',
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

export default emailService;
