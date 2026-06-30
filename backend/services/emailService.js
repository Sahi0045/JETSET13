import { Resend } from 'resend';
import dotenv from 'dotenv';
import { renderBrandedEmail, detailCard, highlightBox, paragraph, BRAND } from './emailTemplate.js';
import {
  generateCruiseCallbackTemplate,
  generatePackageCallbackTemplate,
  generateRentalCallbackTemplate,
  generateDefaultCallbackTemplate,
  generateAdminCallbackNotificationTemplate,
  generateInquiryReceivedTemplate,
  generateAdminInquiryNotificationTemplate,
  generateQuoteSentTemplate,
  generateBookingConfirmationTemplate,
  generateCancellationTemplate,
  generateVisaApplicationTemplate,
} from './email/templates.js';

// Re-export template generators for backward compatibility
export {
  generateCruiseCallbackTemplate,
  generatePackageCallbackTemplate,
  generateRentalCallbackTemplate,
  generateDefaultCallbackTemplate,
  generateAdminCallbackNotificationTemplate,
  generateInquiryReceivedTemplate,
  generateAdminInquiryNotificationTemplate,
  generateQuoteSentTemplate,
  generateBookingConfirmationTemplate,
  generateCancellationTemplate,
  generateVisaApplicationTemplate,
} from './email/templates.js';

// Load environment variables
dotenv.config();

// Initialize Resend with API key from environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

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
    // If HTML is not provided, build a branded email from the data
    if (!html) {
      const rows = data && typeof data === 'object'
        ? Object.entries(data).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), v])
        : [];
      html = renderBrandedEmail({
        preheader: subject || 'Jetsetters',
        heading: subject || 'Hello from Jetsetters',
        contentHtml: rows.length ? detailCard('', rows) : paragraph('Thank you for choosing Jetsetters.'),
      });
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
 * Send a password reset email
 * @param {string} email - Recipient email
 * @param {string} resetLink - Link to reset password
 * @returns {Promise} - Email send response
 */
export const sendPasswordResetEmail = async (email, resetLink) => {
  try {
    const subject = 'Reset your password – Jetsetters';
    const html = renderBrandedEmail({
      preheader: 'Reset your Jetsetters password',
      headerLabel: 'Account Security',
      emoji: '🔒',
      heading: 'Reset your password',
      subheading: 'Let\'s get you back into your account',
      contentHtml: `
        ${paragraph('We received a request to reset the password for your Jetsetters account. Click the button below to choose a new one.')}
        ${paragraph('<span style="font-size:13px; color:#64748B;">This link expires in 1 hour. If you didn\'t request this, you can safely ignore this email.</span>')}
      `,
      cta: { text: 'Reset Password', url: resetLink },
    });

    return await sendEmail({
      to: email,
      subject,
      html
    });
  } catch (error) {
    console.error('Error in sendPasswordResetEmail:', error);
    throw error;
  }
};

/**
 * Invite a new visa processing agent to set their password and access the panel.
 * @param {string} email     - agent's email
 * @param {string} name      - agent's display name
 * @param {string} inviteLink- one-time set-password link (token in query)
 */
export const sendAgentInviteEmail = async (email, name, inviteLink) => {
  try {
    const subject = 'You\'ve been invited as a Jetsetters Visa Agent';
    const html = renderBrandedEmail({
      preheader: 'Set your password to access the Jetsetters visa panel',
      headerLabel: 'Visa Team Invitation',
      emoji: '🛂',
      heading: `Welcome${name ? ', ' + name : ''}!`,
      subheading: 'You\'ve been added as a visa processing agent',
      contentHtml: `
        ${paragraph('A Jetsetters super admin has invited you to the visa team. You\'ll review and process the visa applications assigned to you.')}
        ${paragraph('Click below to set your password and sign in. You\'ll log in with this email address.')}
        ${paragraph('<span style="font-size:13px; color:#64748B;">This invitation link expires in 48 hours. If you weren\'t expecting this, you can ignore this email.</span>')}
      `,
      cta: { text: 'Set Your Password', url: inviteLink },
    });

    return await sendEmail({ to: email, subject, html });
  } catch (error) {
    console.error('Error in sendAgentInviteEmail:', error);
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
      let subject, html, adminSubject, adminHtml;

      switch (type) {
        case 'cruise':
          subject = 'Your Cruise Callback Request - Confirmed! 🛳️';
          html = generateCruiseCallbackTemplate(data);
          adminSubject = '🆕 New Cruise Callback Request';
          adminHtml = generateAdminCallbackNotificationTemplate(data, 'cruise');
          break;
        case 'package':
          subject = 'Your Package Quote Request - Received! 🌴';
          html = generatePackageCallbackTemplate(data);
          adminSubject = '🆕 New Package Quote Request';
          adminHtml = generateAdminCallbackNotificationTemplate(data, 'package');
          break;
        case 'rental':
          subject = 'Your Hotel Booking Request - Confirmed! 🏨';
          html = generateRentalCallbackTemplate(data);
          adminSubject = '🆕 New Hotel Booking Request';
          adminHtml = generateAdminCallbackNotificationTemplate(data, 'rental');
          break;
        default:
          subject = 'Callback Request - Confirmed! ✨';
          html = generateDefaultCallbackTemplate(data);
          adminSubject = '🆕 New Callback Request';
          adminHtml = generateAdminCallbackNotificationTemplate(data, 'general');
      }

      const adminEmail = 'jetsetters721@gmail.com';
      const customerEmail = data.email;

      const results = [];

      // 1) Send confirmation email to the customer (if they provided an email)
      if (customerEmail) {
        try {
          const customerResponse = await resend.emails.send({
            from: 'Jetsetters <noreply@jetsetterss.com>',
            to: [customerEmail],
            subject,
            html,
            text: stripHtml(html)
          });
          console.log('✅ Customer confirmation email sent to:', customerEmail, customerResponse);
          results.push({ recipient: 'customer', ...customerResponse });
        } catch (customerEmailError) {
          console.warn('⚠️ Could not send email to customer:', customerEmailError.message);
        }
      }

      // 2) Send admin notification email
      try {
        const adminResponse = await resend.emails.send({
          from: 'Jetsetters <noreply@jetsetterss.com>',
          to: [adminEmail],
          subject: adminSubject,
          html: adminHtml,
          text: stripHtml(adminHtml)
        });
        console.log('✅ Admin notification email sent:', adminResponse);
        results.push({ recipient: 'admin', ...adminResponse });
      } catch (adminEmailError) {
        console.warn('⚠️ Could not send admin notification email:', adminEmailError.message);
      }

      return results;
    } catch (error) {
      console.error('Error sending callback emails:', error);
      throw error;
    }
  }
};

/**
 * Generate HTML email template for cruise callback confirmation - Airbnb Style
 * @param {Object} data - Callback data
 * @returns {string} - HTML email content
 */





function stripHtml(html) {
  return html.replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate admin notification email when a new callback request is received
 * @param {Object} data - Callback request data
 * @param {string} type - Type of request
 * @returns {string} - HTML email content
 */





export const sendSubscriberWelcomeEmail = async (email, source = 'website') => {
  const html = renderBrandedEmail({ preheader: 'Welcome to the Jetsetters newsletter', headerLabel: 'Welcome Aboard', emoji: '\u2708\uFE0F', heading: 'Welcome to Jetsetters!', subheading: "You're now part of our travel community", contentHtml: `${paragraph('Thanks for subscribing! Get ready for exclusive deals and travel inspiration.')}${detailCard("What you'll receive", [['Exclusive deals','Up to 50% off flights, hotels & packages'],['Travel inspiration','Curated destination guides & tips'],['Early access','First to know about flash sales'],['Member perks','Subscriber-only offers']])}${paragraph(`<span style="font-size:13px;color:#64748B;">You subscribed from our ${source} page. If this wasn't you, ignore this email.</span>`)}`, cta: { text: 'Start Exploring', url: process.env.FRONTEND_URL || 'https://www.jetsetterss.com' } });

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
  const html = renderBrandedEmail({ preheader: 'New newsletter subscriber', headerLabel: 'New Subscriber', emoji: '\uD83D\uDCEC', heading: 'New newsletter subscriber', contentHtml: `${detailCard('Subscriber', [['Email', email],['Source', `${source} page`],['Time', new Date().toLocaleString()]])}` });

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
  const html = renderBrandedEmail({ preheader: "We've received your message", headerLabel: 'Message Received', emoji: '\u2709\uFE0F', heading: "We've received your message!", subheading: `Thanks for reaching out, ${name}`, contentHtml: `${paragraph('Our team will get back to you within 24\u201348 hours.')}${highlightBox(`<strong>Your message:</strong><br>${message}`, {})}` });

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
  const html = renderBrandedEmail({ preheader: 'New contact form submission', headerLabel: 'New Contact', emoji: '\uD83D\uDCE9', heading: 'New contact form submission', contentHtml: `${detailCard('From', [['Name', name],['Email', email],['Time', new Date().toLocaleString()]])}${highlightBox(`<strong>Message:</strong><br>${message}`, {})}` });

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
    const adminHtml = renderBrandedEmail({ preheader: `New booking ${bookingData.bookingReference}`, headerLabel: 'New Booking', emoji: '\uD83C\uDF89', heading: 'New booking received', subheading: bookingData.bookingReference, contentHtml: `${detailCard('Booking', [['Customer', `${bookingData.customerName} (${bookingData.customerEmail})`],['Reference', bookingData.bookingReference],['Type', bookingData.bookingType],['Amount', `${bookingData.currency || 'USD'} ${bookingData.paymentAmount}`],['Travel Date', bookingData.travelDate || 'TBD']])}` });

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
    const adminHtml = renderBrandedEmail({ preheader: `Cancellation ${bookingReference}`, headerLabel: 'Booking Cancelled', emoji: '\u26A0\uFE0F', heading: 'Booking cancellation', subheading: bookingReference, contentHtml: `${detailCard('Cancellation', [['Customer', `${customerName} (${customerEmail})`],['Reference', bookingReference],['Type', bookingType],['Refund Amount', `${currency || 'USD'} ${refundAmount || 0}`],['Cancellation Fee', `${currency || 'USD'} ${cancellationFee || 0}`]])}` });

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

/**
 * Send visa application confirmation email
 * @param {Object} appData - Application data
 * @returns {Promise} - Email send response
 */
export const sendVisaApplicationConfirmation = async (appData) => {
  try {
    const html = generateVisaApplicationTemplate(appData);
    const subject = `🛂 Visa Application Received: ${appData.application_ref}`;
    
    const response = await sendEmail({
      to: appData.personal_info.email,
      subject,
      html
    });

    return response;
  } catch (error) {
    console.error('Error sending visa confirmation email:', error);
    throw error;
  }
};

/**
 * Email the applicant when their visa application status changes. Non-fatal.
 */
export const sendVisaStatusUpdate = async (appData, status, note) => {
  try {
    const to = appData?.personal_info?.email;
    if (!to) return { skipped: true };
    const ref = appData.application_ref;
    const labels = {
      submitted: 'Submitted', documents_pending: 'Documents Pending', under_review: 'Under Review',
      additional_info_required: 'Additional Information Required', approved: 'Approved',
      rejected: 'Rejected', cancelled: 'Cancelled', completed: 'Completed',
    };
    const label = labels[status] || status;
    const frontend = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <h2 style="color:#1152d4;margin-bottom:4px">Visa application update</h2>
        <p>Your application <strong>${ref}</strong> has a new status:</p>
        <p style="font-size:18px;font-weight:bold;padding:12px 16px;background:#f1f5f9;border-radius:8px;display:inline-block">${label}</p>
        ${note ? `<p style="color:#475569">${note}</p>` : ''}
        <p style="margin-top:20px">
          <a href="${frontend}/visa/track?ref=${encodeURIComponent(ref)}"
             style="display:inline-block;background:#1152d4;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">
            Track your application
          </a>
        </p>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">Jetsetters Visa Services</p>
      </div>`;
    return await sendEmail({ to, subject: `🛂 Visa ${ref}: ${label}`, html });
  } catch (error) {
    console.error('Error sending visa status update email:', error);
    return { error: error.message };
  }
};

/**
 * Generate HTML template for visa application confirmation
 */

