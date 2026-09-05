/**
 * Branded email template generators for Jetsetters transactional emails.
 * Each returns email-client-safe HTML built on the shared layout in ../emailTemplate.js
 */
import { renderBrandedEmail, detailCard, highlightBox, paragraph, BRAND } from '../emailTemplate.js';

export function generateCruiseCallbackTemplate(data) {
  const { name, phone, preferredTime = 'Not specified', message = 'None' } = data;
  const firstName = name ? name.split(' ')[0] : 'there';
  return renderBrandedEmail({
    preheader: 'Your cruise consultation is confirmed',
    headerLabel: 'Cruise Enquiry', emoji: '\uD83D\uDEA2',
    heading: `We'll call you soon, ${firstName}!`, subheading: 'Your cruise consultation is confirmed',
    contentHtml: `
      ${paragraph('Thanks for your interest in exploring the world by sea! Our cruise specialists will reach out to plan your dream voyage.')}
      ${highlightBox(`\uD83D\uDCDE Expect a call at <strong>${phone}</strong> during <strong>${preferredTime}</strong>`, { bg: '#f0fdf4', border: '#22c55e', color: '#166534' })}
      ${detailCard('Your request', [['Name', name], ['Phone', phone], ['Preferred time', preferredTime], message !== 'None' ? ['Message', message] : null].filter(Boolean))}
      ${paragraph('Questions before we call? Reach us at <strong>support@jetsetterss.com</strong> or <strong>(877) 538-7380</strong>.')}
    `,
  });
}

export function generatePackageCallbackTemplate(data) {
  const { name, phone, request = 'None', packageName = 'Travel Package', budget = 'Not specified', travelDate = 'Not specified', guests = 'Not specified' } = data;
  const firstName = name ? name.split(' ')[0] : 'there';
  return renderBrandedEmail({
    preheader: 'Quote request received',
    headerLabel: 'Package Quote', emoji: '\uD83C\uDF34',
    heading: 'Quote request received!', subheading: `We're crafting your perfect getaway, ${firstName}`,
    contentHtml: `
      ${paragraph(`Thanks for asking about our <strong>${packageName}</strong>. Our travel experts will send you a personalized quote shortly.`)}
      ${detailCard('Your trip', [['Package', packageName], ['Dates', travelDate], ['Travelers', guests], ['Budget', budget], request !== 'None' ? ['Special requests', request] : null].filter(Boolean))}
      ${paragraph("We'll be in touch within 24 hours.")}
    `,
  });
}

export function generateRentalCallbackTemplate(data) {
  const { name, phone, preferredTime = 'Not specified', hotelName = 'Not specified', checkIn = 'Not specified', checkOut = 'Not specified', guests = 'Not specified', roomType = 'Not specified' } = data;
  const firstName = name ? name.split(' ')[0] : 'there';
  return renderBrandedEmail({
    preheader: 'Your hotel booking request is received',
    headerLabel: 'Hotel Booking', emoji: '\uD83C\uDFE8',
    heading: 'Booking request received!', subheading: `We're confirming your stay at ${hotelName}`,
    contentHtml: `
      ${paragraph(`Great choice, ${firstName}! Our hotel team is working to secure your reservation.`)}
      ${highlightBox(`\uD83D\uDCDE We'll call you at <strong>${phone}</strong> during <strong>${preferredTime}</strong>`, { bg: '#f0fdf4', border: '#22c55e', color: '#166534' })}
      ${detailCard('Stay details', [['Property', hotelName], ['Check-in', checkIn], ['Check-out', checkOut], ['Guests', guests], ['Room type', roomType]])}
    `,
  });
}

export function generateDefaultCallbackTemplate(data) {
  const { name, phone, email = 'Not provided' } = data;
  const firstName = name ? name.split(' ')[0] : 'there';
  return renderBrandedEmail({
    preheader: 'We received your request',
    emoji: '\u2728', heading: `We received your request, ${firstName}!`, subheading: 'Thanks for contacting Jetsetters',
    contentHtml: `
      ${paragraph("We've got your details and a team member will be in touch shortly.")}
      ${detailCard('Contact info', [['Name', name], ['Phone', phone], ['Email', email]])}
    `,
  });
}

export function generateAdminCallbackNotificationTemplate(data, type) {
  const { name, email = 'Not provided', phone, preferredTime = 'Not specified', message = 'None' } = data;
  const labels = { cruise: '\uD83D\uDEA2 Cruise', package: '\uD83C\uDF34 Package', rental: '\uD83C\uDFE8 Hotel', general: '\u2728 General' };
  const label = labels[type] || '\u2728 General';
  return renderBrandedEmail({
    preheader: `New ${label} callback request`,
    headerLabel: 'New Lead', emoji: '\uD83D\uDD14',
    heading: 'New callback request', subheading: label,
    contentHtml: `
      ${detailCard('Lead details', [['Type', label], ['Name', name], ['Phone', phone], ['Email', email], ['Preferred time', preferredTime], message !== 'None' ? ['Message', message] : null].filter(Boolean))}
      ${paragraph(`<span style="font-size:13px;color:#64748B;">Received ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>`)}
    `,
  });
}

export function generateInquiryReceivedTemplate(data) {
  const { customerName, inquiryType = 'travel', inquiryId } = data;
  return renderBrandedEmail({
    preheader: 'We received your inquiry',
    headerLabel: 'Inquiry Received', emoji: '\uD83D\uDCE9',
    heading: `Thanks, ${customerName || 'there'}!`, subheading: 'We received your inquiry',
    contentHtml: `
      ${paragraph('Our travel experts have received your inquiry and will get back to you shortly.')}
      ${detailCard('Inquiry', [['Reference', inquiryId], ['Type', inquiryType]])}
    `,
  });
}

export function generateAdminInquiryNotificationTemplate(data) {
  const { customerName, customerEmail, inquiryType = 'travel', inquiryId, travelDetails } = data;
  const details = travelDetails ? (typeof travelDetails === 'string' ? travelDetails : JSON.stringify(travelDetails)) : null;
  return renderBrandedEmail({
    preheader: 'New inquiry received',
    headerLabel: 'New Inquiry', emoji: '\uD83D\uDD14',
    heading: 'New inquiry received', subheading: inquiryType,
    contentHtml: `
      ${detailCard('Inquiry', [['Reference', inquiryId], ['Customer', customerName], ['Email', customerEmail], ['Type', inquiryType], details ? ['Details', details] : null].filter(Boolean))}
    `,
  });
}

export function generateQuoteSentTemplate(data) {
  const { customerName, quoteNumber, totalAmount, currency = 'USD', expiresAt, quoteLink } = data;
  const fmt = (a) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(a || 0);
  return renderBrandedEmail({
    preheader: `Your quote ${quoteNumber || ''} is ready`,
    headerLabel: 'Your Quote', emoji: '\uD83E\uDDFE',
    heading: 'Your travel quote is ready', subheading: `Prepared for ${customerName || 'you'}`,
    contentHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0;"><tr><td align="center" style="background:#f0f9fc;border:1px solid #d6ebf3;border-radius:12px;padding:22px;">
        <div style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.04em;">Quote ${quoteNumber || ''}</div>
        <div style="font-size:28px;font-weight:800;color:${BRAND.primaryDark};margin-top:6px;">${fmt(totalAmount)}</div>
        ${expiresAt ? `<div style="font-size:12px;color:${BRAND.muted};margin-top:8px;">Valid until ${new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>` : ''}
      </td></tr></table>
      ${paragraph("Review your personalized quote and confirm when you're ready.")}
    `,
    cta: quoteLink ? { text: 'View Quote', url: quoteLink } : null,
  });
}

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

  const icon = ({ flight: '✈️', hotel: '🏨', cruise: '🚢', package: '🎒' }[String(bookingType).toLowerCase()]) || '🌍';
  const title = ({ flight: 'Flight Booking', hotel: 'Hotel Reservation', cruise: 'Cruise Booking', package: 'Travel Package' }[String(bookingType).toLowerCase()]) || 'Travel Booking';
  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD';

  const rows = [
    ['Booking Type', title],
    travelDate ? ['Travel Date', formatDate(travelDate)] : null,
    ['Travelers', `${passengers} ${passengers === 1 ? 'Person' : 'People'}`],
    (bookingDetails.origin && bookingDetails.destination) ? ['Route', `${bookingDetails.origin} → ${bookingDetails.destination}`] : null,
    bookingDetails.hotelName ? ['Hotel', bookingDetails.hotelName] : null,
    bookingDetails.cruiseLine ? ['Cruise Line', bookingDetails.cruiseLine] : null,
    ['Payment Status', `✓ ${paymentStatus}`],
  ].filter(Boolean);

  const content = `
    ${paragraph(`Dear <strong>${customerName || 'Valued Customer'}</strong>,`)}
    ${paragraph(`Great news — your ${title.toLowerCase()} is confirmed. Here are your details:`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0;">
      <tr><td align="center" style="background:#f0f9fc; border:1px solid #d6ebf3; border-radius:12px; padding:22px;">
        <div style="font-size:12px; color:${BRAND.muted}; letter-spacing:0.06em; text-transform:uppercase;">Booking Reference</div>
        <div style="font-size:24px; font-weight:800; color:${BRAND.primary}; letter-spacing:2px; margin:4px 0 16px;">${bookingReference}</div>
        <div style="font-size:12px; color:${BRAND.muted}; text-transform:uppercase; letter-spacing:0.04em;">Total Amount</div>
        <div style="font-size:28px; font-weight:800; color:${BRAND.primaryDark};">${formatCurrency(paymentAmount)}</div>
      </td></tr>
    </table>
    ${detailCard('Booking Details', rows)}
    ${highlightBox('<strong>⏰ Reminders:</strong> Save this email · Check-in opens 24–48h before departure · Carry a valid photo ID · Arrive 2h early (3h international).', { bg: '#fff8e6', border: '#f0b429', color: '#7a5b00' })}
  `;

  return renderBrandedEmail({
    preheader: `Your ${title.toLowerCase()} ${bookingReference} is confirmed`,
    headerLabel: 'Booking Confirmed',
    emoji: icon,
    heading: 'Booking Confirmed!',
    subheading: 'Thank you for choosing Jetsetters',
    contentHtml: content,
    cta: { text: 'View My Trips', url: `${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/my-trips` },
  });
}

export function generateCancellationTemplate(data) {
  const { customerName, bookingReference, bookingType = 'travel', refundAmount, cancellationFee, currency = 'USD' } = data;
  const icon = ({ flight: '\u2708\uFE0F', hotel: '\uD83C\uDFE8', cruise: '\uD83D\uDEA2', package: '\uD83C\uDF92' }[String(bookingType).toLowerCase()]) || '\uD83C\uDF0D';
  const fmt = (a) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(a || 0);
  return renderBrandedEmail({
    preheader: `Booking ${bookingReference} cancelled`,
    headerLabel: 'Booking Cancelled', emoji: icon,
    heading: 'Your booking is cancelled', subheading: `Reference ${bookingReference}`,
    contentHtml: `
      ${paragraph(`Dear <strong>${customerName || 'Valued Customer'}</strong>, your booking has been cancelled as requested.`)}
      ${detailCard('Cancellation summary', [['Booking Reference', bookingReference], ['Cancellation Fee', fmt(cancellationFee)], ['Refund Amount', fmt(refundAmount)]])}
      ${highlightBox('Refunds are typically processed to the original payment method within 5\u201310 business days.', {})}
    `,
  });
}

export function generateVisaApplicationTemplate(data) {
  const { application_ref, personal_info = {}, travel_details = {}, service_tier, amount } = data;
  const name = personal_info.full_name || personal_info.name || 'Applicant';
  const dest = travel_details.destination || travel_details.country;
  return renderBrandedEmail({
    preheader: `Visa application ${application_ref || ''} received`,
    headerLabel: 'Visa Application', emoji: '\uD83D\uDEC2',
    heading: 'Visa application received', subheading: `Reference ${application_ref || ''}`,
    contentHtml: `
      ${paragraph(`Dear <strong>${name}</strong>, we've received your visa application and our team will begin processing it.`)}
      ${detailCard('Application', [['Reference', application_ref], ['Destination', dest], ['Service tier', service_tier], amount != null ? ['Amount', amount] : null].filter(Boolean))}
    `,
    cta: application_ref ? { text: 'Track Your Application', url: `https://www.jetsetterss.com/visa/track?ref=${application_ref}` } : null,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Account and quote notifications.
 *
 * These four were the only emails still hand-writing their own HTML, inline in
 * email.routes.js: a different header, a different palette, gradient banners
 * and emoji headings that matched nothing else we send. A customer who books a
 * flight and then signs in received two emails that did not look like the same
 * company. Moved onto the shared layout so every message is one design.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Someone signed in. A security notice, so it stays plain and factual. */
export function generateLoginNotificationTemplate(data) {
  const { customerName = 'there', email, loginTime, deviceInfo } = data;
  const firstName = String(customerName).split(' ')[0] || 'there';

  return renderBrandedEmail({
    preheader: `New sign-in to your Jetsetters account · ${loginTime}`,
    headerLabel: 'Account security',
    heading: `New sign-in, ${firstName}`,
    subheading: 'We noticed a new sign-in to your account',
    contentHtml: `
      ${paragraph('Here are the details, so you can check it was you:')}
      ${detailCard('Sign-in details', [
        ['Account', email],
        ['Time', loginTime],
        ['Device', deviceInfo],
      ].filter(([, v]) => v))}
      ${highlightBox(
        'If this was you, there is nothing to do.',
        { bg: '#f0fdf4', border: '#22c55e', color: '#166534' },
      )}
      ${paragraph(`If it was not, change your password now and contact us at <strong>${BRAND.supportEmail}</strong> or <strong>${BRAND.supportPhone}</strong>.`)}
    `,
    cta: { text: 'Review account activity', url: `${BRAND.site}/profiledashboard` },
  });
}

/** Someone signed out. Deliberately quieter than the sign-in notice. */
export function generateLogoutNotificationTemplate(data) {
  const { customerName = 'there', email, logoutTime } = data;
  const firstName = String(customerName).split(' ')[0] || 'there';

  return renderBrandedEmail({
    preheader: 'You have been signed out of your Jetsetters account',
    headerLabel: 'Account',
    heading: `Signed out, ${firstName}`,
    subheading: 'Your session has ended',
    contentHtml: `
      ${detailCard('Session', [['Account', email], ['Signed out', logoutTime]].filter(([, v]) => v))}
      ${paragraph('Your trips and saved details are exactly where you left them.')}
    `,
    cta: { text: 'Sign back in', url: `${BRAND.site}/login` },
  });
}

/** A quote is about to expire. The date is the point of the email. */
export function generateQuoteReminderTemplate(data) {
  const { customerName = 'there', quoteNumber, expiresAt, totalAmount, currency = 'USD', quoteUrl } = data;
  const firstName = String(customerName).split(' ')[0] || 'there';
  const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null;

  return renderBrandedEmail({
    preheader: `Quote ${quoteNumber} expires ${expiry || 'soon'}`,
    headerLabel: 'Quote expiring',
    heading: `Your quote expires soon, ${firstName}`,
    subheading: quoteNumber ? `Quote ${quoteNumber}` : '',
    contentHtml: `
      ${paragraph('Prices and availability are held only until the date below. After that the quote has to be rebuilt at whatever fares are live then.')}
      ${detailCard('Your quote', [
        ['Quote', quoteNumber],
        ['Total', totalAmount ? `${currency} ${totalAmount}` : null],
        ['Expires', expiry],
      ].filter(([, v]) => v))}
      ${expiry ? highlightBox(`This quote expires on <strong>${expiry}</strong>.`, { bg: '#fffbeb', border: '#f59e0b', color: '#92400e' }) : ''}
      ${paragraph(`Questions before you decide? Call <strong>${BRAND.supportPhone}</strong> and we will walk through it with you.`)}
    `,
    cta: quoteUrl ? { text: 'View your quote', url: quoteUrl } : null,
  });
}

/** An inquiry changed status. */
export function generateInquiryStatusTemplate(data) {
  const { customerName = 'there', inquiryId, inquiryType, status, createdAt, hasQuotes, viewUrl } = data;
  const firstName = String(customerName).split(' ')[0] || 'there';
  const reference = inquiryId ? String(inquiryId).slice(-8).toUpperCase() : null;

  return renderBrandedEmail({
    preheader: `Your ${inquiryType || 'travel'} inquiry is now ${status || 'updated'}`,
    headerLabel: 'Inquiry update',
    heading: `Update on your inquiry, ${firstName}`,
    subheading: status ? `Status: ${status}` : '',
    contentHtml: `
      ${detailCard('Your inquiry', [
        ['Reference', reference],
        ['Type', inquiryType],
        ['Status', status],
        ['Raised', createdAt ? new Date(createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null],
      ].filter(([, v]) => v))}
      ${hasQuotes
        ? highlightBox('A quote is ready for you to review.', { bg: '#f0fdf4', border: '#22c55e', color: '#166534' })
        : paragraph('We will email you again as soon as there is more to share.')}
    `,
    cta: viewUrl ? { text: 'View full details', url: viewUrl } : null,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Quote lifecycle, payment links, and internal alerts.
 *
 * The last of the hand-written HTML: two quote-expiry mails from the expiry
 * job, the payment-link mail, and the two SLA alerts the workflow engine
 * sends. Same reasoning as above - a customer should not be able to tell which
 * part of the system emailed them.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A quote is expiring in `days`. */
export function generateQuoteExpiringTemplate({ customerName, title, quoteId, totalAmount, currency = 'USD', days }) {
  const firstName = String(customerName || 'there').split(' ')[0];
  return renderBrandedEmail({
    preheader: `Your quote expires in ${days} day${days === 1 ? '' : 's'}`,
    headerLabel: 'Quote expiring',
    heading: `${days} day${days === 1 ? '' : 's'} left on your quote, ${firstName}`,
    subheading: title || '',
    contentHtml: `
      ${paragraph('We are holding these prices until the quote expires. After that the fares have to be re-checked, and they may not be the same.')}
      ${detailCard('Your quote', [
        ['Quote', title],
        ['Reference', quoteId ? String(quoteId).slice(-8).toUpperCase() : null],
        ['Total', totalAmount ? `${currency} ${totalAmount}` : null],
      ].filter(([, v]) => v))}
      ${highlightBox(
        `Expires in <strong>${days} day${days === 1 ? '' : 's'}</strong>.`,
        { bg: '#fffbeb', border: '#f59e0b', color: '#92400e' },
      )}
    `,
    cta: { text: 'Review your quote', url: `${BRAND.site}/my-trips` },
  });
}

/** A quote has expired. Honest, with a clear way back. */
export function generateQuoteExpiredTemplate({ customerName, title, quoteId }) {
  const firstName = String(customerName || 'there').split(' ')[0];
  return renderBrandedEmail({
    preheader: 'Your travel quote has expired',
    headerLabel: 'Quote expired',
    heading: `Your quote has expired, ${firstName}`,
    subheading: title || '',
    contentHtml: `
      ${paragraph('The prices we were holding are no longer guaranteed. That does not mean the trip is off - we can rebuild the quote at current fares, and it often lands close.')}
      ${detailCard('Expired quote', [
        ['Quote', title],
        ['Reference', quoteId ? String(quoteId).slice(-8).toUpperCase() : null],
      ].filter(([, v]) => v))}
      ${paragraph(`Reply to this email or call <strong>${BRAND.supportPhone}</strong> and we will put a fresh one together.`)}
    `,
    cta: { text: 'Request a new quote', url: `${BRAND.site}/request` },
  });
}

/** A payment link. The button is the entire point, so nothing competes with it. */
export function generatePaymentLinkTemplate({ customerName, description, amount, currency = 'USD', paymentUrl, expiresAt }) {
  const firstName = String(customerName || 'there').split(' ')[0];
  return renderBrandedEmail({
    preheader: `Your secure payment link${amount ? ` · ${currency} ${amount}` : ''}`,
    headerLabel: 'Payment',
    heading: `Your payment link, ${firstName}`,
    subheading: description || '',
    contentHtml: `
      ${paragraph('Use the button below to pay securely. The page is hosted by our payment provider - we never see or store your card details.')}
      ${detailCard('Payment', [
        ['For', description],
        ['Amount', amount ? `${currency} ${amount}` : null],
        ['Link valid until', expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null],
      ].filter(([, v]) => v))}
      ${paragraph(`If you did not expect this, do not pay it - call us on <strong>${BRAND.supportPhone}</strong> first.`)}
    `,
    cta: paymentUrl ? { text: 'Pay securely', url: paymentUrl } : null,
  });
}

/**
 * Internal SLA alert. Same shell so the brand is consistent, but the content
 * is deliberately terse - somebody is meant to act on it, not enjoy it.
 */
export function generateSlaAlertTemplate({ kind = 'breach', customerName, inquiryType, status, sla, inquiryId }) {
  const isEscalation = kind === 'escalation';
  return renderBrandedEmail({
    preheader: isEscalation
      ? `Escalation: ${customerName} has had no action for 48h`
      : `SLA breach: ${customerName} (${inquiryType})`,
    headerLabel: isEscalation ? 'Escalation' : 'SLA breach',
    heading: isEscalation ? 'No action for 48 hours' : 'SLA breached',
    subheading: `${customerName || 'Unknown customer'} · ${inquiryType || 'inquiry'}`,
    contentHtml: `
      ${detailCard('Inquiry', [
        ['Customer', customerName],
        ['Type', inquiryType],
        ['Status', status],
        ['SLA', sla ? `${sla} hours` : null],
        ['Reference', inquiryId ? String(inquiryId).slice(-8).toUpperCase() : null],
      ].filter(([, v]) => v))}
      ${highlightBox('This inquiry needs an owner now.', { bg: '#fef2f2', border: '#ef4444', color: '#991b1b' })}
    `,
    cta: { text: 'Open the admin panel', url: `${BRAND.site}/admin/inquiries` },
  });
}
