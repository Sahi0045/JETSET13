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
