/**
 * Branded email template generators for Jetsetters transactional emails.
 * Each returns email-client-safe HTML built on the shared layout in ../emailTemplate.js
 *
 * Design principle, applied to every template here: lead with the thing the
 * reader opened the email to find, then the detail, then what happens next,
 * then the action. A label/value table is the fallback for supporting facts,
 * never the whole message — that is what these used to be, and it is why they
 * read like database dumps rather than like a travel company.
 */
import {
  renderBrandedEmail, detailCard, highlightBox, paragraph,
  figureBlock, routeStrip, statusPill, segmentCard, fareBreakdown, actionRow,
  stepList, stayCard, dataGrid, progressSteps, humanDuration, BRAND,
} from '../emailTemplate.js';
import { REFUND_STUCK_ACTIONS, REFUND_DONE_ACTIONS, refundOutcome } from '../../../shared/cancellationOutcome.js';
import { clockTime, itinerariesFromOffer, layoverBetween, legLabel } from '../../../shared/bookingItineraries.js';

const money = (amount, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount) || 0);

/**
 * A date as a customer reads it, never a day early.
 *
 * `new Date('2026-11-15')` is UTC midnight, so a server running west of UTC
 * printed every travel date in these emails as the day before. A date-only
 * string - or an airport-local time with no zone, as Amadeus sends - is the
 * calendar day written in it, and is formatted in UTC so the server's own zone
 * cannot move it. A timestamp with a zone is the moment it names, as before.
 */
const formatDay = (d, options) => {
  if (!d) return '';
  const written = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(String(d).trim());
  const date = written
    ? new Date(Date.UTC(Number(written[1]), Number(written[2]) - 1, Number(written[3])))
    : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', written ? { ...options, timeZone: 'UTC' } : options);
};

const mediumDate = (d) => formatDay(d, { day: 'numeric', month: 'short', year: 'numeric' });

const longDate = (d) => formatDay(d, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) || 'TBD';

const shortDate = (d) => formatDay(d, { weekday: 'short', day: 'numeric', month: 'short' });

const firstNameOf = (name, fallback = 'there') => String(name || '').trim().split(' ')[0] || fallback;

/** Set when a value is a real answer rather than a placeholder the form defaulted to. */
const given = (v) => v && !/^not (specified|provided)$/i.test(String(v)) && String(v).toLowerCase() !== 'none';

/**
 * Join the parts of a preheader or subheading, dropping the ones we do not
 * have.
 *
 * The inbox preview line is customer-visible text, and every generator here is
 * called from at least two places with different data shapes. Interpolating a
 * missing field directly put the literal word "undefined" beside the subject
 * in the recipient's inbox — the most visible place it could possibly land.
 */
const line = (parts, sep = ' · ') => parts.filter((x) => x != null && x !== '' && x !== 'undefined').join(sep);

/* ────────────────────────────────────────────────────────────────────────────
 * Callback requests.
 *
 * These four all say the same thing — "we have your number, we will ring you"
 * — so the promise itself is the headline, not a row in a table. The phone
 * number and the window are set large because that is the commitment the
 * customer is going to hold us to, and the numbered steps exist because the
 * follow-up question is always "and then what?".
 * ──────────────────────────────────────────────────────────────────────────── */

/** Shared body for every callback acknowledgement. */
function callbackBody({ phone, preferredTime, steps, details, closing }) {
  return `
    ${figureBlock([
      { label: 'We call you on', value: phone || '', small: true },
      { label: 'Preferred window', value: given(preferredTime) ? preferredTime : 'As soon as we can', small: true },
    ])}
    ${stepList('What happens next', steps)}
    ${details}
    ${closing || ''}
    ${actionRow([
      { text: 'Browse trips', url: `${BRAND.site}` },
      { text: 'Contact us', url: `${BRAND.site}/contact` },
    ])}
  `;
}

export function generateCruiseCallbackTemplate(data) {
  const { name, phone, preferredTime = 'Not specified', message = 'None' } = data;

  return renderBrandedEmail({
    preheader: line([phone ? `We will call you on ${phone}` : 'We have your cruise request', 'A specialist is on it'], ' — '),
    headerLabel: 'Cruise enquiry', emoji: '🚢',
    heading: `We will call you, ${firstNameOf(name)}`,
    subheading: 'A cruise specialist has your request',
    contentHtml: callbackBody({
      phone,
      preferredTime,
      steps: [
        ['A cruise specialist picks up your request', 'Someone who actually sails these itineraries, not a call centre script.'],
        ['We call you on the number above', 'Within your window where we can, same working day otherwise.'],
        ['We shortlist sailings and cabins together', 'Line, ship, dates, cabin grade and what is included.'],
        ['You get a written quote', 'Nothing is booked or charged until you say so.'],
      ],
      details: detailCard('Your request', [
        ['Name', name],
        ['Phone', phone],
        given(preferredTime) ? ['Preferred time', preferredTime] : null,
        given(message) ? ['Message', message] : null,
      ].filter(Boolean)),
      closing: paragraph(`Cannot wait for the call? Reach us at <strong>${BRAND.supportEmail}</strong> or <strong>${BRAND.supportPhone}</strong>.`),
    }),
  });
}

export function generatePackageCallbackTemplate(data) {
  const {
    name, phone, request = 'None', packageName = 'Travel Package',
    budget = 'Not specified', travelDate = 'Not specified', guests = 'Not specified',
  } = data;

  return renderBrandedEmail({
    preheader: `Your quote for ${packageName || 'your trip'} is being prepared`,
    headerLabel: 'Package quote', emoji: '🌴',
    heading: `We are pricing your trip, ${firstNameOf(name)}`,
    subheading: packageName,
    contentHtml: `
      ${figureBlock([
        { label: 'Travelling', value: given(travelDate) ? travelDate : 'Dates flexible', small: true },
        { label: 'Travellers', value: given(guests) ? String(guests) : '—', small: true },
      ])}
      ${stepList('What happens next', [
        ['We build the itinerary', 'Flights, stays and transfers priced together rather than separately.'],
        ['We call you on ' + (phone || 'your number'), 'To check the shape of the trip before we put numbers on it.'],
        ['Your quote lands within 24 hours', 'Itemised, with what is included and what is not.'],
      ])}
      ${detailCard('Your trip', [
        ['Package', packageName],
        given(travelDate) ? ['Dates', travelDate] : null,
        given(guests) ? ['Travellers', guests] : null,
        given(budget) ? ['Budget', budget] : null,
        given(request) ? ['Special requests', request] : null,
      ].filter(Boolean))}
      ${actionRow([
        { text: 'See more packages', url: `${BRAND.site}/packages` },
        { text: 'Contact us', url: `${BRAND.site}/contact` },
      ])}
    `,
  });
}

export function generateRentalCallbackTemplate(data) {
  const {
    name, phone, preferredTime = 'Not specified', hotelName = 'Not specified',
    checkIn = 'Not specified', checkOut = 'Not specified', guests = 'Not specified', roomType = 'Not specified',
  } = data;

  return renderBrandedEmail({
    preheader: `We are confirming your stay${given(hotelName) ? ` at ${hotelName}` : ''}`,
    headerLabel: 'Hotel booking', emoji: '🏨',
    heading: `Securing your room, ${firstNameOf(name)}`,
    subheading: given(hotelName) ? hotelName : 'Your stay request is with our hotel team',
    contentHtml: `
      ${stayCard({
        property: given(hotelName) ? hotelName : '',
        roomType: given(roomType) ? roomType : '',
        checkIn: given(checkIn) ? checkIn : '',
        checkOut: given(checkOut) ? checkOut : '',
        guests: given(guests) ? guests : '',
      })}
      ${phone ? highlightBox(
        `We will call you on <strong>${phone}</strong>${given(preferredTime) ? ` during <strong>${preferredTime}</strong>` : ''} to confirm the room and the rate.`,
        { bg: '#f0fdf4', border: '#22c55e', color: '#166534' },
      ) : paragraph('Our hotel team will be in touch to confirm the room and the rate.')}
      ${stepList('What happens next', [
        ['We check live availability', 'Rates move; we confirm the room is actually held before we quote it.'],
        ['We call to confirm the rate', 'Including taxes, resort fees and the cancellation terms.'],
        ['You approve, we book', 'You get the confirmation and the property reference by email.'],
      ])}
      ${detailCard('Stay details', [
        given(hotelName) ? ['Property', hotelName] : null,
        given(checkIn) ? ['Check-in', checkIn] : null,
        given(checkOut) ? ['Check-out', checkOut] : null,
        given(guests) ? ['Guests', guests] : null,
        given(roomType) ? ['Room type', roomType] : null,
      ].filter(Boolean))}
      ${actionRow([
        { text: 'More stays', url: `${BRAND.site}/hotels` },
        { text: 'Contact us', url: `${BRAND.site}/contact` },
      ])}
    `,
  });
}

export function generateDefaultCallbackTemplate(data) {
  const { name, phone, email = 'Not provided' } = data;

  return renderBrandedEmail({
    preheader: line(['We have your request', phone ? `we will call you on ${phone}` : 'a travel expert will be in touch'], ' — '),
    emoji: '✨', headerLabel: 'Request received',
    heading: `We have your request, ${firstNameOf(name)}`,
    subheading: 'A travel expert will be in touch',
    contentHtml: callbackBody({
      phone,
      preferredTime: 'Not specified',
      steps: [
        ['A travel expert picks up your request', 'Matched to what you asked about.'],
        ['We call you on the number above', 'Usually the same working day.'],
        ['We plan it with you', 'No charge, and nothing is booked until you agree.'],
      ],
      details: dataGrid([
        ['Name', name],
        ['Phone', phone],
        given(email) ? ['Email', email] : null,
      ].filter(Boolean)),
    }),
  });
}

/**
 * Internal lead alert. Somebody has to dial this number inside 24 hours, so
 * the number is the email and everything else is supporting detail.
 */
export function generateAdminCallbackNotificationTemplate(data, type) {
  const { name, email = 'Not provided', phone, preferredTime = 'Not specified', message = 'None' } = data;
  const labels = { cruise: '🚢 Cruise', package: '🌴 Package', rental: '🏨 Hotel', general: '✨ General' };
  const label = labels[type] || '✨ General';

  return renderBrandedEmail({
    preheader: line([`New ${label} lead`, name, phone], ' — '),
    headerLabel: 'New lead', emoji: '🔔',
    heading: 'New callback request',
    subheading: `${name || 'Unknown'} · ${label}`,
    contentHtml: `
      ${figureBlock([
        { label: 'Call', value: phone || '—', small: true, note: statusPill('Within 24h', 'warning') },
        { label: 'Preferred window', value: given(preferredTime) ? preferredTime : 'Any', small: true },
      ])}
      ${dataGrid([
        ['Name', name],
        ['Type', label],
        ['Email', given(email) ? email : null],
        ['Received', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
      ].filter(Boolean))}
      ${given(message) ? highlightBox(`<strong>Customer note:</strong> ${message}`, {}) : ''}
      ${actionRow([
        { text: 'Open admin panel', url: `${BRAND.site}/admin/inquiries` },
        phone ? { text: `Call ${phone}`, url: `tel:${String(phone).replace(/[^\d+]/g, '')}` } : null,
      ].filter(Boolean))}
    `,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Inquiries.
 * ──────────────────────────────────────────────────────────────────────────── */

export function generateInquiryReceivedTemplate(data) {
  const { customerName, inquiryType = 'travel', inquiryId } = data;
  const reference = inquiryId ? String(inquiryId).slice(-8).toUpperCase() : null;

  return renderBrandedEmail({
    preheader: `We have your ${inquiryType} inquiry${reference ? ` — ${reference}` : ''}`,
    headerLabel: 'Inquiry received', emoji: '📩',
    heading: `Thanks, ${firstNameOf(customerName)}`,
    subheading: 'Your inquiry is with our travel team',
    contentHtml: `
      ${figureBlock([
        { label: 'Reference', value: reference || '—', mono: true, small: true },
        { label: 'Type', value: String(inquiryType).replace(/^\w/, (c) => c.toUpperCase()), small: true },
      ])}
      ${progressSteps(['Received', 'Being reviewed', 'Quote sent', 'Booked'], 0)}
      ${stepList('What happens next', [
        ['A specialist reviews what you asked for', 'Usually within a few working hours.'],
        ['We come back with options', 'By email, or by phone if it is quicker to talk it through.'],
        ['You decide', 'Nothing is held or charged until you approve a quote.'],
      ])}
      ${paragraph(`Quote your reference <strong>${reference || 'above'}</strong> if you call us on <strong>${BRAND.supportPhone}</strong> in the meantime.`)}
      ${actionRow([{ text: 'View your inquiries', url: `${BRAND.site}/my-trips` }])}
    `,
  });
}

export function generateAdminInquiryNotificationTemplate(data) {
  const { customerName, customerEmail, inquiryType = 'travel', inquiryId, travelDetails } = data;
  const details = travelDetails ? (typeof travelDetails === 'string' ? travelDetails : JSON.stringify(travelDetails, null, 1)) : null;
  const reference = inquiryId ? String(inquiryId).slice(-8).toUpperCase() : null;

  return renderBrandedEmail({
    preheader: line([`New ${inquiryType} inquiry`, customerName && `from ${customerName}`], ' '),
    headerLabel: 'New inquiry', emoji: '🔔',
    heading: 'New inquiry received',
    subheading: `${customerName || 'Unknown'} · ${inquiryType}`,
    contentHtml: `
      ${figureBlock([
        { label: 'Reference', value: reference || '—', mono: true, small: true },
        { label: 'Type', value: String(inquiryType).replace(/^\w/, (c) => c.toUpperCase()), small: true, note: statusPill('Unassigned', 'warning') },
      ])}
      ${dataGrid([
        ['Customer', customerName],
        ['Email', customerEmail],
        ['Raised', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
      ].filter(([, v]) => v))}
      ${details ? highlightBox(`<strong>Travel details</strong><br />${String(details).replace(/\n/g, '<br />')}`, {}) : ''}
      ${actionRow([{ text: 'Open in admin panel', url: `${BRAND.site}/admin/inquiries` }])}
    `,
  });
}

/** An inquiry changed status — so show the whole path, with where it is now. */
export function generateInquiryStatusTemplate(data) {
  const { customerName = 'there', inquiryId, inquiryType, status, createdAt, hasQuotes, viewUrl } = data;
  const reference = inquiryId ? String(inquiryId).slice(-8).toUpperCase() : null;

  // The tracker is the point of this email: "Status: quoted" makes the reader
  // work out what is left, a tracker shows it.
  const stages = ['Received', 'Being reviewed', 'Quote sent', 'Booked'];
  const stageIndex = {
    pending: 0, new: 0, open: 0,
    in_progress: 1, reviewing: 1, assigned: 1, 'in progress': 1,
    quoted: 2, quote_sent: 2,
    booked: 3, confirmed: 3, closed: 3,
  }[String(status || '').toLowerCase()] ?? 1;

  return renderBrandedEmail({
    preheader: `Your ${inquiryType || 'travel'} inquiry is now ${status || 'updated'}`,
    headerLabel: 'Inquiry update',
    heading: `Update on your inquiry, ${firstNameOf(customerName)}`,
    subheading: status ? `Now: ${String(status).replace(/_/g, ' ')}` : '',
    contentHtml: `
      ${progressSteps(stages, stageIndex)}
      ${dataGrid([
        ['Reference', reference],
        ['Type', inquiryType],
        ['Status', status ? String(status).replace(/_/g, ' ') : null],
        ['Raised', createdAt ? mediumDate(createdAt) : null],
      ].filter(([, v]) => v))}
      ${hasQuotes
    ? highlightBox('<strong>A quote is ready for you to review.</strong> Prices are held for a limited time, so it is worth a look now.', { bg: '#f0fdf4', border: '#22c55e', color: '#166534' })
    : paragraph('We will email you again the moment there is more to share. Nothing is needed from you right now.')}
      ${actionRow([
        { text: 'View full details', url: viewUrl || `${BRAND.site}/my-trips` },
        { text: 'Call us', url: `tel:${BRAND.supportPhone.replace(/[^\d+]/g, '')}` },
      ])}
    `,
    cta: hasQuotes ? { text: 'Review your quote', url: viewUrl || `${BRAND.site}/my-trips` } : null,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Quotes.
 * ──────────────────────────────────────────────────────────────────────────── */

export function generateQuoteSentTemplate(data) {
  const { customerName, quoteNumber, totalAmount, currency = 'USD', expiresAt, quoteLink, breakdown = [] } = data;

  const lines = (Array.isArray(breakdown) ? breakdown : [])
    .map((b) => [b?.label || b?.name || b?.description, b?.amount != null ? money(b.amount, currency) : null])
    .filter(([l, a]) => l && a);

  return renderBrandedEmail({
    preheader: `Your quote ${quoteNumber || ''} is ready — ${money(totalAmount, currency)}`,
    headerLabel: 'Your quote', emoji: '🧾',
    heading: 'Your travel quote is ready',
    subheading: `Prepared for ${customerName || 'you'}`,
    contentHtml: `
      ${paragraph(`Hi <strong>${customerName || 'there'}</strong>, we have put your quote together. Here is what it comes to:`)}
      ${figureBlock([
        { label: 'Quote', value: quoteNumber || '-', mono: true, small: true },
        { label: 'Total', value: money(totalAmount, currency), note: expiresAt ? `Held until ${mediumDate(expiresAt)}` : '' },
      ])}
      ${lines.length ? fareBreakdown(lines, { total: money(totalAmount, currency), currency, label: 'Quote total', title: "What's included" }) : ''}
      ${expiresAt ? highlightBox(
    `These prices are held until <strong>${new Date(expiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. After that the fares are re-checked at whatever is live then.`,
    { bg: '#FFF6E5', border: '#E0A100', color: '#7A5B00' },
  ) : ''}
      ${paragraph(`Anything you want changed - dates, cabin, hotels - reply to this email or call <strong>${BRAND.supportPhone}</strong> and we will rework it.`)}
    `,
    cta: quoteLink ? { text: 'View Quote', url: quoteLink } : null,
  });
}

/** A quote is about to expire. The countdown is the point of the email. */
export function generateQuoteReminderTemplate(data) {
  const { customerName = 'there', quoteNumber, expiresAt, totalAmount, currency = 'USD', quoteUrl } = data;
  const expiry = expiresAt ? mediumDate(expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt) - Date.now()) / 86400000))
    : null;

  return renderBrandedEmail({
    preheader: line([quoteNumber ? `Quote ${quoteNumber}` : 'Your quote', `expires ${expiry || 'soon'}`], ' '),
    headerLabel: 'Quote expiring',
    heading: `Your quote expires soon, ${firstNameOf(customerName)}`,
    subheading: quoteNumber ? `Quote ${quoteNumber}` : '',
    contentHtml: `
      ${figureBlock([
        daysLeft != null
          ? { label: 'Time left', value: `${daysLeft} day${daysLeft === 1 ? '' : 's'}`, small: true, note: expiry ? `Expires ${expiry}` : '' }
          : { label: 'Quote', value: quoteNumber || '-', mono: true, small: true },
        { label: 'Total held', value: totalAmount ? money(totalAmount, currency) : '—' },
      ])}
      ${paragraph('Prices and availability are held only until the date above. After that the quote has to be rebuilt at whatever fares are live then — sometimes cheaper, often not.')}
      ${expiry ? highlightBox(`This quote expires on <strong>${expiry}</strong>.`, { bg: '#fffbeb', border: '#f59e0b', color: '#92400e' }) : ''}
      ${paragraph(`Questions before you decide? Call <strong>${BRAND.supportPhone}</strong> and we will walk through it with you.`)}
    `,
    cta: quoteUrl ? { text: 'View your quote', url: quoteUrl } : null,
  });
}

/** A quote is expiring in `days`, sent by the expiry job. */
export function generateQuoteExpiringTemplate({ customerName, title, quoteId, totalAmount, currency = 'USD', days }) {
  const reference = quoteId ? String(quoteId).slice(-8).toUpperCase() : null;
  // The job always passes `days`, but this is also re-sendable by hand from the
  // admin panel, where it is easy to omit. "undefined days left" is worse than
  // a vaguer sentence that is still true.
  const dayCount = Number(days);
  const dayLabel = Number.isFinite(dayCount) ? `${dayCount} day${dayCount === 1 ? '' : 's'}` : 'A few days';

  return renderBrandedEmail({
    preheader: `Your quote expires in ${dayLabel.toLowerCase()}`,
    headerLabel: 'Quote expiring',
    heading: `${dayLabel} left on your quote`,
    subheading: title || `Hi ${firstNameOf(customerName)}, these prices are still held`,
    contentHtml: `
      ${figureBlock([
        { label: 'Time left', value: dayLabel, small: true, note: statusPill('Held', 'warning') },
        { label: 'Total held', value: totalAmount ? money(totalAmount, currency) : '—' },
      ])}
      ${paragraph('We are holding these prices until the quote expires. After that the fares have to be re-checked, and they may not be the same.')}
      ${detailCard('Your quote', [
    ['Quote', title],
    ['Reference', reference],
    ['Total', totalAmount ? money(totalAmount, currency) : null],
  ].filter(([, v]) => v))}
      ${actionRow([
    { text: 'Talk to us first', url: `${BRAND.site}/contact` },
    { text: 'Call ' + BRAND.supportPhone, url: `tel:${BRAND.supportPhone.replace(/[^\d+]/g, '')}` },
  ])}
    `,
    cta: { text: 'Review your quote', url: `${BRAND.site}/my-trips` },
  });
}

/** A quote has expired. Honest, with a clear way back. */
export function generateQuoteExpiredTemplate({ customerName, title, quoteId }) {
  const reference = quoteId ? String(quoteId).slice(-8).toUpperCase() : null;

  return renderBrandedEmail({
    preheader: 'Your travel quote has expired',
    headerLabel: 'Quote expired',
    heading: `Your quote has expired, ${firstNameOf(customerName)}`,
    subheading: title || '',
    contentHtml: `
      ${figureBlock([
        { label: 'Quote', value: reference || (title || '—'), mono: !!reference, small: true, note: statusPill('Expired', 'danger') },
      ])}
      ${paragraph('The prices we were holding are no longer guaranteed. That does not mean the trip is off - we can rebuild the quote at current fares, and it often lands close.')}
      ${stepList('Getting a fresh one', [
        ['Tell us if anything changed', 'Dates, travellers, budget — even a small change moves the price.'],
        ['We re-price at live fares', 'Same itinerary unless you want it altered.'],
        ['You get the new quote the same day', 'Usually within a few working hours.'],
      ])}
      ${paragraph(`Reply to this email or call <strong>${BRAND.supportPhone}</strong> and we will put a fresh one together.`)}
    `,
    cta: { text: 'Request a new quote', url: `${BRAND.site}/request` },
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bookings.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A flight the airline holds but has not ticketed.
 *
 * Decided from what the booking chain recorded - `gds.ticketed` and the ticket
 * numbers - and only when that record is present. The confirmation email used
 * to say "Booking Confirmed!", "is confirmed" and a green status for every
 * committed PNR, and with auto-ticketing off that was every booking. Callers
 * that pass no GDS record at all (payment links, other flows) keep the
 * confirmation they always had.
 */
export function isUnticketedFlight({ bookingType, bookingDetails } = {}) {
  if (String(bookingType || '').toLowerCase() !== 'flight') return false;
  const details = bookingDetails || {};
  if (!details.gds || typeof details.gds !== 'object') return false;
  const tickets = Array.isArray(details.tickets) ? details.tickets : [];
  return details.gds.ticketed !== true && tickets.length === 0;
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
    passengers = 1,
  } = data;

  const kind = String(bookingType).toLowerCase();
  const icon = ({ flight: '✈️', hotel: '🏨', cruise: '🚢', package: '🎒' }[kind]) || '🌍';
  const title = ({ flight: 'Flight Booking', hotel: 'Hotel Reservation', cruise: 'Cruise Booking', package: 'Travel Package' }[kind]) || 'Travel Booking';
  const formatCurrency = (amount) => money(amount, currency);

  /**
   * Booking details reach this template in two shapes, and both are real.
   *
   * `booking_details` is stored snake_case, and some callers hand the row
   * straight over; others build a camelCase object by hand. Reading only
   * camelCase meant every snake_case field came back undefined, which is not
   * a blank space on the page — `segmentCard` falls back to `time || code`,
   * so a missing departure time rendered the airport code where the time
   * belongs and then the code again beneath it: "DEL / DEL", "BOM / BOM", on
   * every flight confirmation, with no times, terminals or cities anywhere.
   */
  const d = new Proxy(bookingDetails || {}, {
    get(target, key) {
      if (typeof key !== 'string' || key in target) return target[key];
      const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      if (snake in target) return target[snake];
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      return target[camel];
    },
  });

  const rows = [
    ['Booking Type', title],
    travelDate ? ['Travel Date', longDate(travelDate)] : null,
    ['Travelers', `${passengers} ${passengers === 1 ? 'Person' : 'People'}`],
    d.hotelName ? ['Hotel', d.hotelName] : null,
    d.cruiseLine ? ['Cruise Line', d.cruiseLine] : null,
    d.PNR || d.pnr ? ['Airline reference', d.PNR || d.pnr] : null,
    // The one number a customer actually needs at a check-in desk, and the one
    // this email never carried: a ticketed booking said "Confirmed" and listed
    // its booking reference, its PNR and its transaction id, and nowhere the
    // 13 digits the airline asks for.
    ...(Array.isArray(d.tickets) ? d.tickets : [])
      .filter((ticket) => ticket?.number)
      .map((ticket, index, all) => [
        all.length === 1 ? 'E-ticket number' : `E-ticket · ${ticket.travelerName || ticket.passengerName || `Traveller ${index + 1}`}`,
        ticket.number,
      ]),
    d.Cabin || d.cabin ? ['Cabin', d.Cabin || d.cabin] : null,
  ].filter(Boolean);

  // Route first, then the two numbers, then the detail. That is the order a
  // traveller actually reads a confirmation in - where am I going, what did it
  // cost, what is the reference - and it used to be the exact inverse, with the
  // route as one row among seven.
  //
  // A flight gets the itinerary treatment every traveller already knows;
  // a hotel gets the stay card; anything else falls back to the route strip.
  // Every leg and flight of a flight booking. The card below draws one flight
  // from the first leg's flat fields: no return flight, and a connection shown
  // as its first flight number beside its last arrival. Legs are saved on the
  // booking by the order route, or rebuilt from the offer stored on it.
  const legs = kind === 'flight'
    ? (Array.isArray(d.itineraries) && d.itineraries.length > 0 ? d.itineraries : itinerariesFromOffer(d.flightOffer))
    : [];
  const itineraryHtml = legs.map((leg, index) => {
    const stopText = leg.stops === 0 ? 'Non-stop' : `${leg.stops} stop${leg.stops === 1 ? '' : 's'}`;
    const heading = paragraph(`<strong>${legLabel(leg, index, legs.length)}</strong> &nbsp;·&nbsp; ${line([
      `${leg.origin} → ${leg.destination}`, shortDate(leg.departureDate), humanDuration(leg.duration), stopText,
    ], ' &nbsp;·&nbsp; ')}`);
    const flights = leg.segments.map((segment, i) => {
      const wait = i > 0 ? layoverBetween(leg.segments[i - 1], segment) : '';
      const connection = i > 0
        ? paragraph(line([`Connection in ${segment.origin}`, wait ? `${wait} between flights` : ''], ' · '))
        : '';
      return connection + segmentCard({
        airline: segment.flightNumber,
        flightNumber: segment.operatingCarrier ? `operated by ${segment.operatingCarrier}` : '',
        cabin: segment.cabin ? segment.cabin.replace(/_/g, ' ').toLowerCase() : '',
        depTime: clockTime(segment.departureTime), depCode: segment.origin, depDate: shortDate(segment.departureDate), depTerminal: segment.departureTerminal,
        arrTime: clockTime(segment.arrivalTime), arrCode: segment.destination, arrDate: shortDate(segment.arrivalDate), arrTerminal: segment.arrivalTerminal,
        // Amadeus gives a leg's elapsed time, not each flight's.
        duration: leg.segments.length === 1 ? leg.duration : '',
      });
    }).join('');
    return heading + flights;
  }).join('');

  const journey = itineraryHtml ? itineraryHtml : kind === 'flight' && d.origin && d.destination
    ? segmentCard({
      airline: d.Airline || d.airlineName || d.airline,
      flightNumber: d.Flight || d.flightNumber,
      cabin: d.Cabin || d.cabin || d.cabinClass,
      depTime: d.departureTime, depCode: d.origin, depCity: d.originCity, depDate: shortDate(travelDate), depTerminal: d.departureTerminal,
      arrTime: d.arrivalTime, arrCode: d.destination, arrCity: d.destinationCity, arrDate: shortDate(d.arrivalDate || travelDate), arrTerminal: d.arrivalTerminal,
      duration: d.duration, stops: d.stops,
    })
    : kind === 'hotel' && (d.checkIn || d.checkOut)
      ? stayCard({
        property: d.hotelName, roomType: d.roomType,
        checkIn: shortDate(d.checkIn), checkOut: shortDate(d.checkOut),
        nights: d.nights, guests: passengers,
      })
      : routeStrip({
        from: d.origin, to: d.destination,
        fromLabel: d.originCity || '', toLabel: d.destinationCity || '',
        meta: [travelDate ? longDate(travelDate) : null, `${passengers} ${passengers === 1 ? 'traveller' : 'travellers'}`].filter(Boolean).join(' &nbsp;·&nbsp; '),
      });

  const advice = kind === 'hotel'
    ? 'Bring photo ID and the card used to pay. Check-in is usually from 3pm and check-out by 11am — tell the property if you are arriving late so the room is held.'
    : kind === 'cruise'
      ? 'Online check-in opens around 30 days before sailing. Boarding closes well before departure, and passports must be valid for six months beyond your return.'
      : 'Check-in opens 24-48 hours before departure. Bring photo ID, and allow 2 hours at the airport for domestic flights, 3 for international.';

  const unticketed = isUnticketedFlight({ bookingType, bookingDetails });
  const ticketDeadline = unticketed ? (d.lastTicketingDate || d.gds?.last_ticketing_date || null) : null;
  const opening = unticketed
    ? `Hi <strong>${customerName || 'there'}</strong>, your seats are reserved with the airline. Your e-ticket has not been issued yet, and we will email it to you as soon as it is.`
    : `Hi <strong>${customerName || 'there'}</strong>, your ${title.toLowerCase()} is confirmed.`;
  const ticketNote = unticketed
    ? highlightBox(
      ticketDeadline
        ? `Your reservation is held until ${longDate(ticketDeadline)}. We issue your ticket before then, and we will contact you if anything prevents it.`
        : 'We issue your ticket before the airline\'s ticketing deadline, and we will contact you if anything prevents it.',
      { bg: '#FFF6E5', border: '#E0A100', color: '#7A5B00' },
    )
    : '';

  const content = `
    ${paragraph(opening)}
    ${journey}
    ${figureBlock([
    {
      label: 'Booking reference', value: bookingReference, mono: true, small: true,
      note: unticketed ? statusPill('Ticket pending', 'warning') : statusPill(paymentStatus || 'Paid', 'success'),
    },
    { label: 'Travellers', value: String(passengers), small: true },
  ])}
    ${ticketNote}
    ${fareBreakdown(
    [
      d.baseFare ? ['Base fare', formatCurrency(d.baseFare)] : null,
      d.taxes ? ['Taxes and fees', formatCurrency(d.taxes)] : null,
    ].filter(Boolean),
    { total: formatCurrency(paymentAmount), currency, label: 'Total paid' },
  )}
    ${actionRow([
    // To this booking. The bare /manage-booking page answers "No booking ID
    // provided", so the button every confirmation carried led to an error.
    {
      text: 'Manage booking',
      url: bookingReference
        ? `${BRAND.site}/manage-booking/${encodeURIComponent(bookingReference)}`
        : `${BRAND.site}/my-trips`,
    },
    { text: 'My trips', url: `${BRAND.site}/my-trips` },
  ])}
    ${detailCard('Booking details', rows)}
    ${highlightBox(advice, { bg: '#FFF6E5', border: '#E0A100', color: '#7A5B00' })}
  `;

  return renderBrandedEmail({
    preheader: unticketed
      ? line(['Your seats are reserved', bookingReference, 'and your ticket will follow'], ' ')
      : line([`Your ${title.toLowerCase()}`, bookingReference, 'is confirmed'], ' '),
    headerLabel: unticketed ? 'Reservation Held' : 'Booking Confirmed',
    emoji: icon,
    heading: unticketed ? 'Reservation Held' : 'Booking Confirmed!',
    subheading: 'Thank you for choosing Jetsetters',
    contentHtml: content,
    cta: { text: 'View My Trips', url: `${process.env.FRONTEND_URL || BRAND.site}/my-trips` },
  });
}

/**
 * The e-ticket that every other email promised.
 *
 * Three surfaces told the customer "we will email your e-ticket as soon as it
 * is issued", and there was no such email in the codebase to send. With
 * auto-ticketing off, a person finishes the ticket in the Amadeus terminal and
 * nothing came back to say so - see jobs/ticketSync.job.js, which is what now
 * notices and calls this.
 *
 * The ticket number leads, because it is the only thing in here the customer
 * did not already have. It is what an airline's check-in page and its call
 * centre ask for, and it is the difference between a held seat and a document
 * you can fly on. One number per traveller, named, because a family gets one
 * each and "your ticket number" is useless to the person whose it is not.
 */
export function generateTicketIssuedTemplate(data = {}) {
  const { customerName, bookingReference, tickets = [], bookingDetails = {} } = data;
  const details = bookingDetails || {};
  const issued = (Array.isArray(tickets) ? tickets : []).filter((t) => t?.number);

  const named = issued.map((ticket) => [
    ticket.travelerName || ticket.passengerName || 'Traveller',
    `<span style="letter-spacing:1px;">${ticket.number}</span>`,
  ]);

  const opening = issued.length === 1
    ? `Good news${customerName ? `, ${String(customerName).split(' ')[0]}` : ''} — your e-ticket has been issued. `
      + 'Your seat is no longer just reserved: this is the document you travel on.'
    : `Good news${customerName ? `, ${String(customerName).split(' ')[0]}` : ''} — your e-tickets have been issued. `
      + 'Those seats are no longer just reserved: these are the documents you travel on.';

  const content = `
    ${paragraph(opening)}
    ${figureBlock([
    issued.length === 1
      ? { label: 'E-ticket number', value: issued[0].number, mono: true, note: statusPill('Issued', 'success') }
      : { label: 'E-tickets issued', value: String(issued.length), note: statusPill('Issued', 'success') },
    { label: 'Booking reference', value: bookingReference, mono: true, small: true },
  ])}
    ${named.length > 1 ? detailCard('Ticket numbers', named) : ''}
    ${paragraph(
    'Use the ticket number if the airline asks for one — at check-in, at the airport, '
    + 'or on the phone. The airline reference below is the one on its own website.',
  )}
    ${detailCard('Your booking', [
    details.pnr || details.PNR ? ['Airline reference', details.pnr || details.PNR] : null,
    ['Booking reference', bookingReference],
  ].filter(Boolean))}
    ${actionRow([
    {
      text: 'View your e-ticket',
      url: bookingReference
        ? `${BRAND.site}/manage-booking/${encodeURIComponent(bookingReference)}`
        : `${BRAND.site}/my-trips`,
    },
    { text: 'My trips', url: `${BRAND.site}/my-trips` },
  ])}
  `;

  return renderBrandedEmail({
    preheader: line([
      issued.length === 1 ? 'Your e-ticket is issued' : 'Your e-tickets are issued',
      bookingReference,
    ], ' '),
    headerLabel: 'E-Ticket Issued',
    emoji: '🎫',
    heading: issued.length === 1 ? 'Your e-ticket is issued' : 'Your e-tickets are issued',
    subheading: 'You are ready to travel',
    contentHtml: content,
    cta: { text: 'View My Trips', url: `${process.env.FRONTEND_URL || BRAND.site}/my-trips` },
  });
}

/**
 * A reservation the airline holds, with a ticket our team has to finish.
 *
 * The order route answers 202 "needs review" when the PNR was committed and a
 * later step - queueing, ticketing, the final save - failed. Those customers
 * were emailed nothing, while the page told them a confirmation had been sent.
 * This says what is true: the seats are held, the ticket is not issued yet, a
 * person is finishing it, and the customer has nothing to do.
 */
export function generateReservationHeldTemplate(data = {}) {
  const {
    customerName, bookingReference, paymentAmount, currency = 'USD', bookingDetails, travelDate, passengers = 1,
  } = data;
  const details = bookingDetails || {};
  const pnr = details.pnr || details.PNR || '';
  const legs = Array.isArray(details.itineraries) && details.itineraries.length > 0
    ? details.itineraries
    : itinerariesFromOffer(details.flight_offer || details.flightOffer);
  const route = legs.length > 0
    ? legs.map((leg, index) => paragraph(`<strong>${legLabel(leg, index, legs.length)}</strong> &nbsp;·&nbsp; ${line([
      `${leg.origin} → ${leg.destination}`,
      shortDate(leg.departureDate),
      leg.segments.map((segment) => segment.flightNumber).filter(Boolean).join(', '),
    ], ' &nbsp;·&nbsp; ')}`)).join('')
    : details.origin && details.destination
      ? paragraph(line([`<strong>${details.origin} → ${details.destination}</strong>`, travelDate ? longDate(travelDate) : ''], ' &nbsp;·&nbsp; '))
      : '';
  const amount = Number(paymentAmount);

  return renderBrandedEmail({
    preheader: line(['Your seats are reserved', bookingReference, 'and our team is finishing your ticket'], ' '),
    headerLabel: 'Reservation Held',
    emoji: '✈️',
    heading: 'Reservation Held',
    subheading: 'Our team is finishing your ticket',
    contentHtml: `
      ${paragraph(`Hi <strong>${firstNameOf(customerName)}</strong>, your payment went through and the airline is holding your seats. Your ticket could not be issued automatically, so a member of our team is finishing it.`)}
      ${route}
      ${figureBlock([
        { label: 'Booking reference', value: bookingReference || '—', mono: true, small: true, note: statusPill('Ticket pending', 'warning') },
        pnr
          ? { label: 'Airline reference', value: pnr, mono: true, small: true }
          : { label: 'Travellers', value: String(passengers), small: true },
      ])}
      ${stepList('What happens next', [
        ['We finish your ticket', 'Our team is working on it. You do not need to do anything.'],
        ['We email your e-ticket', 'As soon as it is issued. Until then this is a reservation, not a ticket, so please do not travel on this email.'],
        ['If anything stops it', `We will contact you before the airline's ticketing deadline. You can also call ${BRAND.supportPhone} with your booking reference.`],
      ])}
      ${Number.isFinite(amount) && amount > 0 ? fareBreakdown([], { total: money(amount, currency), currency, label: 'Total paid' }) : ''}
      ${actionRow([
        {
          text: 'Manage booking',
          url: bookingReference ? `${BRAND.site}/manage-booking/${encodeURIComponent(bookingReference)}` : `${BRAND.site}/my-trips`,
        },
        { text: 'My trips', url: `${BRAND.site}/my-trips` },
      ])}
    `,
    cta: { text: 'View My Trips', url: `${process.env.FRONTEND_URL || BRAND.site}/my-trips` },
  });
}

/** Internal booking alert. Revenue first, then who and what. */
export function generateAdminBookingNotificationTemplate(data) {
  const {
    customerName, customerEmail, bookingReference, bookingType = 'travel',
    paymentAmount, currency = 'USD', travelDate,
  } = data;

  return renderBrandedEmail({
    preheader: line([line(['New booking', bookingReference], ' '), money(paymentAmount, currency)], ' — '),
    headerLabel: 'New booking', emoji: '🎉',
    heading: 'New booking received',
    subheading: `${customerName || 'Unknown'} · ${bookingType}`,
    contentHtml: `
      ${figureBlock([
        { label: 'Reference', value: bookingReference || '—', mono: true, small: true, note: statusPill('Paid', 'success') },
        { label: 'Value', value: money(paymentAmount, currency) },
      ])}
      ${dataGrid([
        ['Customer', customerName],
        ['Email', customerEmail],
        ['Type', bookingType],
        ['Travel date', travelDate ? longDate(travelDate) : 'TBD'],
      ].filter(([, v]) => v))}
      ${actionRow([
        { text: 'Open in admin panel', url: `${BRAND.site}/admin/bookings` },
        { text: 'Email customer', url: `mailto:${customerEmail || BRAND.supportEmail}` },
      ])}
    `,
  });
}

/**
 * What happened to the money decides what this email is allowed to say.
 *
 * It used to promise "refund due … 5-10 business days" on every cancellation,
 * including the ones where the gateway refused the refund - quoting $0.00 as
 * the amount on its way. That customer would wait ten working days for money
 * nobody was sending, and the one case that most needs a human
 * (MANUAL_PROCESS_REQUIRED: the refund was never even attempted) read exactly
 * like a bank being slow.
 */
//
// The outcome itself is decided in shared/cancellationOutcome.js, the same place
// the cancel API, My Trips and Manage Booking read it from, so the email cannot
// describe a cancellation differently from the page the customer just saw.
export { REFUND_STUCK_ACTIONS, REFUND_DONE_ACTIONS, refundOutcome };

export function generateCancellationTemplate(data) {
  const { customerName, bookingReference, bookingType = 'travel', refundAmount, cancellationFee, currency = 'USD', paymentAction } = data;
  const icon = ({ flight: '✈️', hotel: '🏨', cruise: '🚢', package: '🎒' }[String(bookingType).toLowerCase()]) || '🌍';
  const fmt = (a) => money(a, currency);
  const outcome = refundOutcome({ paymentAction, refundAmount });

  const byOutcome = {
    refunded: {
      preheader: `${fmt(refundAmount)} refund on its way`,
      figure: { label: 'Refund due', value: fmt(refundAmount) },
      body: `
      ${fareBreakdown(
        [['Cancellation fee', fmt(cancellationFee)]],
        { total: fmt(refundAmount), currency, label: 'Refund to original payment method', title: 'Refund breakdown' },
      )}
      ${highlightBox('Refunds reach the original payment method in 5-10 business days. Your bank decides the exact date, not us - if it has not landed after 10 working days, call and we will chase it.', {})}`,
    },
    fee_covers: {
      preheader: 'no refund due',
      figure: { label: 'Refund due', value: fmt(0), note: 'cancellation fee covers the fare' },
      body: `
      ${fareBreakdown(
        [['Cancellation fee', fmt(cancellationFee)]],
        { total: fmt(0), currency, label: 'Refund to original payment method', title: 'Refund breakdown' },
      )}
      ${highlightBox('No refund is due: the cancellation fee is equal to or more than the amount paid, so nothing is returned to your card.', {})}`,
    },
    stuck: {
      preheader: 'refund needs manual processing',
      figure: { label: 'Refund', value: 'Being processed by our team', note: statusPill('Action in progress', 'warning') },
      body: `
      ${highlightBox('We could not process your refund automatically. Our team has been notified and will process it and contact you. <strong>Nothing has been returned to your card yet.</strong> If you have not heard from us within 2 business days, call (877) 538-7380 and quote your booking reference.', {})}`,
    },
    // Refunded nothing automatically, on purpose: what is due depends on the
    // fare rules or on something the airline and the booking disagree about.
    // Promises no amount and no date, and does not say money has not moved -
    // a refund whose answer never came back is reviewed too.
    review: {
      preheader: 'refund being reviewed',
      figure: { label: 'Refund', value: 'Being reviewed by our team', note: statusPill('Under review', 'warning') },
      body: `
      ${highlightBox('Our team needs to review the refund for this booking, for example because the fare rules decide what the airline returns. They will email you within 2 business days to confirm what is returned to your card. If you have not heard from us by then, call (877) 538-7380 and quote your booking reference.', {})}`,
    },
    nothing_held: {
      preheader: 'nothing to refund',
      figure: { label: 'Refund', value: 'Nothing to refund', note: 'no payment is held for this booking' },
      body: `
      ${highlightBox('No payment is being held for this booking, so there is nothing to return to your card. If you believe you were charged, call (877) 538-7380 and quote your booking reference.', {})}`,
    },
    unknown: {
      preheader: 'cancellation confirmed',
      figure: { label: 'Refund', value: 'If a refund is due, our team will process it' },
      body: `
      ${highlightBox('If a refund is due on this booking, our team will process it and let you know. Nothing further is needed from you.', {})}`,
    },
  }[outcome];

  return renderBrandedEmail({
    preheader: line([line(['Booking', bookingReference, 'cancelled'], ' '), byOutcome.preheader], ' — '),
    headerLabel: 'Booking Cancelled', emoji: icon,
    heading: 'Your booking is cancelled',
    subheading: bookingReference ? `Reference ${bookingReference}` : 'Your booking has been cancelled',
    contentHtml: `
      ${paragraph(`Hi <strong>${customerName || 'there'}</strong>, your booking has been cancelled as requested.`)}
      ${figureBlock([
    { label: 'Booking reference', value: bookingReference, mono: true, small: true, note: statusPill('Cancelled', 'danger') },
    byOutcome.figure,
  ])}${byOutcome.body}
      ${actionRow([{ text: 'My trips', url: `${BRAND.site}/my-trips` }, { text: 'Book again', url: `${BRAND.site}/flights` }])}
    `,
  });
}

/** Internal cancellation alert. */
export function generateAdminCancellationTemplate(data) {
  const { customerName, customerEmail, bookingReference, bookingType = 'travel', refundAmount, cancellationFee, currency = 'USD', paymentAction } = data;
  // A refund left for review needs the desk exactly as much as one that failed:
  // the customer has been told a person will decide.
  const stuck = ['stuck', 'review'].includes(refundOutcome({ paymentAction, refundAmount }));

  return renderBrandedEmail({
    // A stuck refund is the one line the desk must not skim past: the
    // customer has been told a human will act, and this email is that human.
    preheader: line([line(['Cancellation', bookingReference], ' '), stuck ? `REFUND ${paymentAction} - ACTION REQUIRED` : `${money(refundAmount, currency)} refund`], ' — '),
    headerLabel: stuck ? 'Refund needs a human' : 'Booking cancelled', emoji: stuck ? '🚨' : '⚠️',
    heading: stuck ? 'Refund not processed - action required' : 'Booking cancellation',
    subheading: line([customerName || 'Unknown customer', bookingReference]),
    contentHtml: `
      ${figureBlock([
        { label: 'Reference', value: bookingReference || '—', mono: true, small: true, note: statusPill('Cancelled', 'danger') },
        stuck
          ? { label: 'Refund', value: `NOT PROCESSED (${paymentAction})`, note: statusPill('Action required', 'danger') }
          : { label: 'Refund due', value: money(refundAmount, currency) },
      ])}
      ${fareBreakdown(
    [['Cancellation fee retained', money(cancellationFee, currency)]],
    { total: money(refundAmount, currency), currency, label: 'To refund', title: 'Refund breakdown' },
  )}
      ${dataGrid([
    ['Customer', customerName],
    ['Email', customerEmail],
    ['Type', bookingType],
  ].filter(([, v]) => v))}
      ${actionRow([{ text: 'Open in admin panel', url: `${BRAND.site}/admin/bookings` }])}
    `,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Visa.
 * ──────────────────────────────────────────────────────────────────────────── */

export function generateVisaApplicationTemplate(data) {
  const { application_ref, personal_info = {}, travel_details = {}, service_tier, amount } = data;
  const name = personal_info.full_name || personal_info.name || 'Applicant';
  const dest = travel_details.destination || travel_details.country;

  return renderBrandedEmail({
    preheader: `Visa application ${application_ref || ''} received`,
    headerLabel: 'Visa application', emoji: '🛂',
    heading: 'Visa application received',
    subheading: dest ? `For ${dest}` : `Reference ${application_ref || ''}`,
    contentHtml: `
      ${paragraph(`Dear <strong>${name}</strong>, we have your application and our visa team has started on it.`)}
      ${figureBlock([
        { label: 'Reference', value: application_ref || '—', mono: true, small: true, note: statusPill('Received', 'info') },
        amount != null
          ? { label: 'Paid', value: typeof amount === 'number' ? money(amount) : String(amount), small: true }
          : { label: 'Destination', value: dest || '—', small: true },
      ])}
      ${progressSteps(['Received', 'Documents checked', 'Submitted', 'Decision'], 0)}
      ${stepList('What happens next', [
        ['We check your documents', 'If anything is missing or unclear we email you before it costs you time.'],
        ['We submit to the consulate', 'Under the service tier you chose.'],
        ['You get the decision', 'We email you the moment it lands, and post the documents where required.'],
      ])}
      ${detailCard('Application', [
    ['Reference', application_ref],
    ['Destination', dest],
    ['Service tier', service_tier],
    amount != null ? ['Amount', typeof amount === 'number' ? money(amount) : amount] : null,
  ].filter(Boolean))}
      ${highlightBox('Processing times are set by the consulate, not by us. We will tell you honestly if a date looks at risk rather than let you find out late.', {})}
    `,
    cta: application_ref ? { text: 'Track Your Application', url: `${BRAND.site}/visa/track?ref=${application_ref}` } : null,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Account notifications.
 *
 * These were the only emails still hand-writing their own HTML, inline in
 * email.routes.js: a different header, a different palette, gradient banners
 * and emoji headings that matched nothing else we send. A customer who books a
 * flight and then signs in received two emails that did not look like the same
 * company.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Someone signed in.
 *
 * A security notice, so it stays factual — but the reader has exactly two
 * questions ("was that me?" and "what do I do if not?") and both get an
 * explicit answer and an explicit button. The facts go in a grid rather than a
 * ledger: they are attributes, not amounts.
 */
export function generateLoginNotificationTemplate(data) {
  const { customerName = 'there', email, loginTime, deviceInfo } = data;

  return renderBrandedEmail({
    preheader: line(['New sign-in to your Jetsetters account', loginTime]),
    headerLabel: 'Account security',
    heading: `New sign-in, ${firstNameOf(customerName)}`,
    subheading: 'We noticed a new sign-in to your account',
    contentHtml: `
      ${paragraph('Here are the details, so you can check it was you:')}
      ${dataGrid([
        ['Account', email],
        ['Time', loginTime],
        ['Device', deviceInfo],
      ].filter(([, v]) => v))}
      ${highlightBox(
    '<strong>If this was you, there is nothing to do.</strong> You can ignore this email — we send it so an unexpected sign-in never goes unnoticed.',
    { bg: '#f0fdf4', border: '#22c55e', color: '#166534' },
  )}
      ${stepList('If it was not you', [
        ['Change your password now', 'Use a password you have not used anywhere else.'],
        [`Tell us on ${BRAND.supportPhone}`, `Or email ${BRAND.supportEmail} — we can lock the account while we check it.`],
        ['Check your recent bookings', 'So you can tell us straight away if anything was changed.'],
      ])}
    `,
    cta: { text: 'Review account activity', url: `${BRAND.site}/profiledashboard` },
  });
}

/** Someone signed out. Deliberately quieter than the sign-in notice. */
export function generateLogoutNotificationTemplate(data) {
  const { customerName = 'there', email, logoutTime } = data;

  return renderBrandedEmail({
    preheader: 'You have been signed out of your Jetsetters account',
    headerLabel: 'Account',
    heading: `Signed out, ${firstNameOf(customerName)}`,
    subheading: 'Your session has ended',
    contentHtml: `
      ${dataGrid([
        ['Account', email],
        ['Signed out', logoutTime],
      ].filter(([, v]) => v))}
      ${paragraph('Your trips and saved details are exactly where you left them. Signing back in takes a moment.')}
      ${paragraph(`If you did not sign out yourself, change your password and let us know on <strong>${BRAND.supportPhone}</strong>.`)}
    `,
    cta: { text: 'Sign back in', url: `${BRAND.site}/login` },
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Payments and internal alerts.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A payment link. The amount and the button are the entire email. */
export function generatePaymentLinkTemplate({ customerName, description, amount, currency = 'USD', paymentUrl, expiresAt }) {
  return renderBrandedEmail({
    preheader: `Your secure payment link${amount ? ` · ${money(amount, currency)}` : ''}`,
    headerLabel: 'Payment',
    heading: `Your payment link, ${firstNameOf(customerName)}`,
    subheading: description || '',
    contentHtml: `
      ${figureBlock([
        { label: 'Amount due', value: amount ? money(amount, currency) : '—', note: expiresAt ? `Link valid until ${mediumDate(expiresAt)}` : '' },
      ])}
      ${paragraph(`Use the button below to pay securely${description ? ` for <strong>${description}</strong>` : ''}. The page is hosted by our payment provider - we never see or store your card details.`)}
      ${highlightBox(
    `<strong>Not expecting this?</strong> Do not pay it. Call us on <strong>${BRAND.supportPhone}</strong> first — we would rather check than have you out of pocket.`,
    { bg: '#FFF6E5', border: '#E0A100', color: '#7A5B00' },
  )}
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
  const reference = inquiryId ? String(inquiryId).slice(-8).toUpperCase() : null;

  return renderBrandedEmail({
    preheader: isEscalation
      ? line(['Escalation', line([customerName, 'has had no action for 48h'], ' ')], ': ')
      : line(['SLA breach', line([customerName, inquiryType && `(${inquiryType})`], ' ')], ': '),
    headerLabel: isEscalation ? 'Escalation' : 'SLA breach',
    heading: isEscalation ? 'No action for 48 hours' : 'SLA breached',
    subheading: `${customerName || 'Unknown customer'} · ${inquiryType || 'inquiry'}`,
    contentHtml: `
      ${figureBlock([
        { label: 'Reference', value: reference || '—', mono: true, small: true, note: statusPill(isEscalation ? 'Escalated' : 'Breached', 'danger') },
        { label: isEscalation ? 'Untouched for' : 'SLA', value: isEscalation ? '48 hours' : (sla ? `${sla} hours` : '—'), small: true },
      ])}
      ${dataGrid([
        ['Customer', customerName],
        ['Type', inquiryType],
        ['Status', status],
      ].filter(([, v]) => v))}
      ${highlightBox('<strong>This inquiry needs an owner now.</strong>', { bg: '#fef2f2', border: '#ef4444', color: '#991b1b' })}
    `,
    cta: { text: 'Open the admin panel', url: `${BRAND.site}/admin/inquiries` },
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Account access, newsletter and contact.
 *
 * The last of the emails that were written inline in emailService.js. Same
 * reasoning as everywhere else in this file: they are real customer-facing
 * messages, so they get the same components and the same structure rather than
 * a paragraph and a button.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Password reset. One job, one button, and an honest expiry. */
export function generatePasswordResetTemplate({ resetLink, expiresInHours = 1 } = {}) {
  return renderBrandedEmail({
    preheader: `Reset your Jetsetters password — link valid for ${expiresInHours} hour${expiresInHours === 1 ? '' : 's'}`,
    headerLabel: 'Account security', emoji: '🔒',
    heading: 'Reset your password',
    subheading: 'Let us get you back into your account',
    contentHtml: `
      ${paragraph('We received a request to reset the password for your Jetsetters account. Use the button below to choose a new one.')}
      ${highlightBox(
    `This link expires in <strong>${expiresInHours} hour${expiresInHours === 1 ? '' : 's'}</strong> and can be used once.`,
    { bg: '#FFF6E5', border: '#E0A100', color: '#7A5B00' },
  )}
      ${stepList('If you did not ask for this', [
        ['Ignore this email', 'Your password stays exactly as it is — nothing changes unless the link is used.'],
        [`Tell us if it keeps happening`, `Email ${BRAND.supportEmail} or call ${BRAND.supportPhone} and we will look at the account.`],
      ])}
    `,
    cta: resetLink ? { text: 'Reset Password', url: resetLink } : null,
  });
}

/**
 * Staff invitation — visa or travel agent.
 *
 * One template rather than two near-identical ones: the role changes the
 * heading, the responsibilities and the panel name, and nothing else did.
 */
export function generateAgentInviteTemplate({ name, inviteLink, role = 'visa', expiresInHours = 48 } = {}) {
  const isVisa = role === 'visa';
  const duties = isVisa
    ? [
      ['Review the applications assigned to you', 'Documents, eligibility and anything that needs chasing with the applicant.'],
      ['Submit to the consulate', 'Under the service tier the customer paid for.'],
      ['Keep the status current', 'The customer sees the tracker you update.'],
    ]
    : [
      ['Create bookings for customers', 'Flights, hotels, cruises and packages, all from one panel.'],
      ['Send payment links', 'Secure hosted checkout — you never handle card details.'],
      ['Earn commission on your sales', 'Tracked automatically against your agent account.'],
    ];

  return renderBrandedEmail({
    preheader: `Set your password to access the Jetsetters ${isVisa ? 'visa panel' : 'agent portal'}`,
    headerLabel: isVisa ? 'Visa team invitation' : 'Travel agent invitation',
    emoji: isVisa ? '🛂' : '✈️',
    heading: `Welcome${name ? `, ${firstNameOf(name, '')}` : ''}!`,
    subheading: isVisa ? 'You have been added as a visa processing agent' : 'You have been added as a travel sales agent',
    contentHtml: `
      ${paragraph(`A Jetsetters super admin has invited you to the ${isVisa ? 'visa' : 'travel sales'} team. Set your password below — you will sign in with this email address.`)}
      ${stepList('What you will be doing', duties)}
      ${highlightBox(
    `This invitation expires in <strong>${expiresInHours} hours</strong>. If you were not expecting it, you can ignore this email.`,
    { bg: '#FFF6E5', border: '#E0A100', color: '#7A5B00' },
  )}
    `,
    cta: inviteLink ? { text: 'Set Your Password', url: inviteLink } : null,
  });
}

/** Newsletter welcome. */
export function generateNewsletterWelcomeTemplate({ source = 'website' } = {}) {
  return renderBrandedEmail({
    preheader: 'Welcome to the Jetsetters newsletter',
    headerLabel: 'Welcome aboard', emoji: '✈️',
    heading: 'Welcome to Jetsetters!',
    subheading: 'You are now on the list',
    contentHtml: `
      ${paragraph('Thanks for subscribing. Here is what actually lands in your inbox — and how often.')}
      ${stepList('What you will get', [
        ['Deals worth opening', 'Flights, hotels and packages, when the price is genuinely good.'],
        ['Destination guides', 'Written by people who have been, not scraped from a listicle.'],
        ['Early access to flash sales', 'Before they go out publicly.'],
      ])}
      ${dataGrid([
        ['How often', 'A few times a month'],
        ['Unsubscribe', 'One click, any email'],
      ])}
      ${paragraph(`<span style="font-size:13px;color:${BRAND.muted};">You subscribed from our ${source} page. If this was not you, ignore this email and you will hear nothing more.</span>`)}
    `,
    cta: { text: 'Start Exploring', url: process.env.FRONTEND_URL || BRAND.site },
  });
}

/** Internal: someone subscribed. */
export function generateAdminNewsletterTemplate({ email, source = 'website' } = {}) {
  return renderBrandedEmail({
    preheader: line(['New newsletter subscriber', email], ': '),
    headerLabel: 'New subscriber', emoji: '📬',
    heading: 'New newsletter subscriber',
    subheading: email || '',
    contentHtml: `
      ${dataGrid([
        ['Email', email],
        ['Source', `${source} page`],
        ['Time', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
      ].filter(([, v]) => v))}
    `,
  });
}

/** We got your contact-form message. */
export function generateContactReceivedTemplate({ name, message } = {}) {
  return renderBrandedEmail({
    preheader: 'We have your message — we reply within 24-48 hours',
    headerLabel: 'Message received', emoji: '✉️',
    heading: `We have your message, ${firstNameOf(name)}`,
    subheading: 'Thanks for reaching out',
    contentHtml: `
      ${figureBlock([
        { label: 'We reply within', value: '24-48 hours', small: true, note: 'Working days' },
      ])}
      ${message ? highlightBox(`<strong>What you sent us:</strong><br />${String(message).replace(/\n/g, '<br />')}`, {}) : ''}
      ${paragraph(`If it is urgent — a trip in the next few days, or a booking already made — call <strong>${BRAND.supportPhone}</strong> rather than waiting on this reply.`)}
      ${actionRow([
        { text: 'Call us', url: `tel:${BRAND.supportPhone.replace(/[^\d+]/g, '')}` },
        { text: 'Browse trips', url: BRAND.site },
      ])}
    `,
  });
}

/** Internal: a contact-form submission. */
export function generateAdminContactTemplate({ name, email, message } = {}) {
  return renderBrandedEmail({
    preheader: line(['New contact form submission', name && `from ${name}`], ' '),
    headerLabel: 'New contact', emoji: '📩',
    heading: 'New contact form submission',
    subheading: `${name || 'Unknown'}${email ? ` · ${email}` : ''}`,
    contentHtml: `
      ${dataGrid([
        ['Name', name],
        ['Email', email],
        ['Received', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
      ].filter(([, v]) => v))}
      ${message ? highlightBox(`<strong>Message:</strong><br />${String(message).replace(/\n/g, '<br />')}`, {}) : ''}
      ${actionRow([
        email ? { text: 'Reply to customer', url: `mailto:${email}` } : null,
        { text: 'Open admin panel', url: `${BRAND.site}/admin` },
      ].filter(Boolean))}
    `,
  });
}

/**
 * Pick the right callback acknowledgement for a request type.
 *
 * The `/api/send-email` endpoint in both entry points used to hand-write its
 * own HTML for this — a blue gradient banner and a red one for the admin copy,
 * matching nothing else we send — while these four templates already existed
 * and were used by every other path. This is the dispatcher those endpoints
 * needed so there is one implementation rather than three.
 */
export function generateCallbackTemplate(data, type) {
  switch (String(type || '').toLowerCase()) {
    case 'cruise': return generateCruiseCallbackTemplate(data);
    case 'package': return generatePackageCallbackTemplate(data);
    case 'rental':
    case 'hotel': return generateRentalCallbackTemplate(data);
    default: return generateDefaultCallbackTemplate(data);
  }
}
