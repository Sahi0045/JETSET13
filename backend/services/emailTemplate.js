/**
 * Shared, email-client-safe branded layout for all Jetsetters transactional email.
 *
 * Email is not the web. Gmail strips <style> from the body, Outlook renders
 * through Word (no flexbox, no box-shadow, no padding on <table>, unreliable
 * border-radius), and Apple Mail is the only client that behaves like a
 * browser. So: tables for structure, inline styles for everything that must
 * survive, and a <head> <style> block only for the mobile tweaks it is safe to
 * lose.
 *
 * Design notes, since they were deliberate choices rather than defaults:
 *
 *  - The logo sits on white, the message opens on a deep teal hero band. The
 *    mark was drawn for a light ground, so it keeps its own space; the band
 *    below is where the brand actually lands, and it gives the email a face
 *    before a word is read. Outlook drops the gradient and keeps the bgcolor,
 *    which is why both are set.
 *  - `routeStrip` and `figureBlock` exist because a travel confirmation should
 *    look like a ticket, not like a bank statement. A reference number and a
 *    route are what the reader is actually opening the mail to find.
 *  - No oversized emoji hero. `emoji` is still accepted so existing templates
 *    keep working, but it renders small beside the section label instead of as
 *    a 44px graphic, which read as a 2015 newsletter.
 *  - Detail rows put their padding on <td>, never on <table>: Word ignores the
 *    latter, which is why the old cards looked cramped in Outlook.
 *  - The card uses a 1px border rather than a box-shadow. Shadows are ignored
 *    by Outlook, so the shadow was doing nothing for a large share of readers
 *    while the border works for all of them.
 */

export const BRAND = {
  name: 'Jetsetters',
  tagline: 'Jet Set Go',
  primary: '#055B75',
  primaryDark: '#034457',
  accent: '#0890BC',
  sky: '#65B3CF',
  ink: '#16232B',
  body: '#43535F',
  muted: '#6B7C88',
  line: '#E4EBEF',
  surface: '#F7FAFB',
  bg: '#EEF3F5',
  logo: 'https://www.jetsetterss.com/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.png',
  site: 'https://www.jetsetterss.com',
  supportEmail: 'support@jetsetterss.com',
  supportPhone: '(877) 538-7380',
  facebook: 'https://www.facebook.com/people/Jetsetters/61557536332731/',
  instagram: 'https://www.instagram.com/jetsetters_global/',
  year: new Date().getFullYear(),
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * A button that survives Outlook.
 *
 * Word ignores padding on <a>, so the padding lives on a <td> and the anchor
 * fills it. That is the whole trick, and it is why this is a table rather than
 * the styled <a> it used to be.
 */
function button({ text, url }) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 4px;">
      <tr>
        <td align="center" bgcolor="${BRAND.primary}" style="border-radius:8px; background:${BRAND.primary};">
          <a href="${url}" target="_blank" rel="noopener"
             style="display:inline-block; padding:15px 34px; font-family:${FONT}; font-size:16px; font-weight:600; line-height:1; color:#ffffff; text-decoration:none; border-radius:8px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * Wrap inner content in the branded email shell.
 *
 * @param {Object} opts
 * @param {string} opts.preheader - hidden inbox preview text
 * @param {string} [opts.emoji] - small accent beside the section label
 * @param {string} opts.heading - hero heading
 * @param {string} [opts.subheading] - hero subheading
 * @param {string} opts.contentHtml - main body HTML (use the helpers below)
 * @param {{text:string,url:string}} [opts.cta] - primary call to action
 * @param {string} [opts.headerLabel] - small label above the heading
 */
export function renderBrandedEmail({
  preheader = '', emoji = '', heading = '', subheading = '', contentHtml = '', cta = null, headerLabel = '',
}) {
  // The hero is the design. A transactional email that opens with black text
  // on white reads like a receipt from a bank; the band gives the message a
  // face before a word is read, and it is where the brand actually lives.
  // bgcolor carries Outlook, which drops the gradient and keeps the solid.
  const label = headerLabel
    ? `<div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:${BRAND.sky}; padding-bottom:12px;">${emoji ? `${emoji} ` : ''}${headerLabel}</div>`
    : '';

  const hero = (heading || subheading || headerLabel)
    ? `
        <tr><td class="jsPad" bgcolor="${BRAND.primary}"
                style="padding:36px 40px 38px; background:${BRAND.primary}; background-image:linear-gradient(135deg, ${BRAND.primaryDark} 0%, ${BRAND.primary} 52%, ${BRAND.accent} 100%);">
          ${label}
          ${heading ? `<h1 class="jsH1" style="margin:0; font-family:${FONT}; font-size:29px; line-height:1.22; font-weight:700; color:#ffffff; letter-spacing:-0.02em;">${heading}</h1>` : ''}
          ${subheading ? `<p style="margin:10px 0 0; font-family:${FONT}; font-size:16px; line-height:1.55; color:#C9E4EE;">${subheading}</p>` : ''}
        </td></tr>`
    : '';

  // Every row is a real <tr> inside the card table. The CTA used to be a bare
  // <table> dropped between two <tr> elements, which is invalid HTML — browsers
  // hoisted it out and Outlook rendered the button in the wrong place.
  const ctaRow = cta ? `<tr><td style="padding:12px 40px 4px;">${button(cta)}</td></tr>` : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<title>${BRAND.name}</title>
<style>
  /* Clients that keep <style> get tighter phone padding. The rest simply use
     the inline values, which are already readable at 320px. */
  @media only screen and (max-width:600px) {
    .jsCard { width:100% !important; border-radius:0 !important; }
    .jsPad  { padding-left:22px !important; padding-right:22px !important; }
    .jsH1   { font-size:22px !important; }
  }
  a { color:${BRAND.accent}; }
</style>
</head>
<body style="margin:0; padding:0; width:100%; background-color:${BRAND.bg}; font-family:${FONT}; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; visibility:hidden;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg};">
    <tr><td align="center" style="padding:28px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="jsCard"
             style="width:600px; max-width:100%; background:#ffffff; border:1px solid ${BRAND.line}; border-radius:14px; overflow:hidden;">

        <!-- Logo on white: the mark was drawn for a light ground. -->
        <tr><td class="jsPad" align="left" style="padding:24px 40px 20px;">
          <img src="${BRAND.logo}" alt="${BRAND.name}" height="34" style="height:34px; width:auto; border:0; display:block;" />
        </td></tr>

        ${hero}

        <tr><td class="jsPad" style="padding:32px 40px 6px; font-family:${FONT}; font-size:15px; line-height:1.65; color:${BRAND.body};">
          ${contentHtml}
        </td></tr>

        ${ctaRow}

        <tr><td style="padding:14px 40px 0;">&nbsp;</td></tr>

        <tr><td class="jsPad" style="padding:22px 40px 30px; border-top:1px solid ${BRAND.line}; background:${BRAND.surface};">
          <p style="margin:0 0 4px; font-family:${FONT}; font-size:15px; font-weight:700; color:${BRAND.primary};">
            ${BRAND.name} <span style="font-weight:400; color:${BRAND.sky};">· ${BRAND.tagline}</span>
          </p>
          <p style="margin:0 0 12px; font-family:${FONT}; font-size:13px; line-height:1.6; color:${BRAND.muted};">
            Questions? <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.accent}; text-decoration:none;">${BRAND.supportEmail}</a>
            &nbsp;·&nbsp; <a href="tel:${BRAND.supportPhone.replace(/[^\d+]/g, '')}" style="color:${BRAND.accent}; text-decoration:none;">${BRAND.supportPhone}</a>
          </p>
          <p style="margin:0 0 12px; font-family:${FONT}; font-size:13px;">
            <a href="${BRAND.site}" style="color:${BRAND.muted}; text-decoration:none;">jetsetterss.com</a> &nbsp;·&nbsp;
            <a href="${BRAND.facebook}" style="color:${BRAND.muted}; text-decoration:none;">Facebook</a> &nbsp;·&nbsp;
            <a href="${BRAND.instagram}" style="color:${BRAND.muted}; text-decoration:none;">Instagram</a>
          </p>
          <p style="margin:0; font-family:${FONT}; font-size:11px; line-height:1.6; color:#9AA8B2;">
            © ${BRAND.year} ${BRAND.name}. All rights reserved.<br />
            You are receiving this because of activity on your Jetsetters account.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * A detail block: a small caption and label/value rows.
 *
 * Padding is on the cells, not the table — Word ignores table padding, which
 * is why these used to sit flush against their border in Outlook.
 *
 * @param {string} title
 * @param {Array<[string, string]>} rows
 */
export function detailCard(title, rows = []) {
  const cells = rows
    .filter((r) => r && r[1] != null && r[1] !== '')
    .map(([label, value], i, all) => {
      const border = i === all.length - 1 ? 'none' : `1px solid ${BRAND.line}`;
      return `
      <tr>
        <td style="padding:11px 18px 11px 0; border-bottom:${border}; font-family:${FONT}; font-size:14px; line-height:1.5; color:${BRAND.muted}; white-space:nowrap;">${label}</td>
        <td align="right" style="padding:11px 0; border-bottom:${border}; font-family:${FONT}; font-size:14px; line-height:1.5; color:${BRAND.ink}; font-weight:600;">${value}</td>
      </tr>`;
    })
    .join('');

  if (!cells) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; background:${BRAND.surface}; border:1px solid ${BRAND.line}; border-radius:12px;">
      <tr><td style="padding:16px 20px 4px;">
        ${title ? `<div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${BRAND.primary}; padding-bottom:6px;">${title}</div>` : ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>
      </td></tr>
      <tr><td style="padding:0 20px 12px;"></td></tr>
    </table>`;
}

/** A callout. Used sparingly — one per email, or it stops meaning anything. */
export function highlightBox(html, { bg = '#EAF4F8', border = BRAND.accent, color = '#0A4A5E' } = {}) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
      <tr>
        <td width="4" style="width:4px; background:${border}; border-radius:3px 0 0 3px; font-size:0; line-height:0;">&nbsp;</td>
        <td style="background:${bg}; border-radius:0 8px 8px 0; padding:14px 18px; font-family:${FONT}; font-size:15px; line-height:1.6; color:${color};">
          ${html}
        </td>
      </tr>
    </table>`;
}

/** A body paragraph. */
export function paragraph(html) {
  return `<p style="margin:0 0 16px; font-family:${FONT}; font-size:15px; line-height:1.65; color:${BRAND.body};">${html}</p>`;
}

export function stripHtml(html) {
  return String(html).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}


/**
 * The two numbers a booking email exists to communicate.
 *
 * A reference and a total, set large enough to read at arm's length on a phone
 * without hunting through prose. Two columns on desktop, and they stack
 * naturally on narrow screens because each is its own cell.
 */
export function figureBlock(items = []) {
  const cells = items
    .filter((i) => i && i.value != null && i.value !== '')
    .map((item, idx, all) => `
      <td width="${Math.floor(100 / all.length)}%" align="${all.length === 1 ? 'center' : idx === 0 ? 'left' : 'right'}" style="padding:4px 0;">
        <div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${BRAND.muted};">${item.label}</div>
        <div style="font-family:${FONT}; font-size:${item.small ? '20px' : '26px'}; font-weight:700; letter-spacing:${item.mono ? '1.5px' : '-0.01em'}; color:${BRAND.primaryDark}; padding-top:6px;">${item.value}</div>
        ${item.note ? `<div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted}; padding-top:4px;">${item.note}</div>` : ''}
      </td>`)
    .join('');

  if (!cells) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px; background:#F0F8FB; border:1px solid #D5E9F1; border-radius:12px;">
      <tr><td style="padding:22px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
      </td></tr>
    </table>`;
}

/**
 * Origin, destination, and the line between them.
 *
 * The single most useful thing in a flight confirmation, and it was previously
 * a "Route: DEL → BOM" row buried among six others. Built from table cells
 * rather than flexbox so Outlook renders it too.
 */
export function routeStrip({ from, to, fromLabel = '', toLabel = '', meta = '' }) {
  if (!from || !to) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px; border:1px solid ${BRAND.line}; border-radius:12px;">
      <tr><td style="padding:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" width="38%">
              <div style="font-family:${FONT}; font-size:32px; font-weight:700; line-height:1; color:${BRAND.ink}; letter-spacing:-0.02em;">${from}</div>
              ${fromLabel ? `<div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted}; padding-top:6px;">${fromLabel}</div>` : ''}
            </td>
            <td align="center" width="24%" valign="middle" style="padding:0 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center" style="font-family:${FONT}; font-size:15px; color:${BRAND.accent}; line-height:1; padding-bottom:6px;">&#9992;</td></tr>
                <tr><td style="border-top:1px solid ${BRAND.line}; font-size:0; line-height:0; height:1px;">&nbsp;</td></tr>
              </table>
            </td>
            <td align="right" width="38%">
              <div style="font-family:${FONT}; font-size:32px; font-weight:700; line-height:1; color:${BRAND.ink}; letter-spacing:-0.02em;">${to}</div>
              ${toLabel ? `<div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted}; padding-top:6px;">${toLabel}</div>` : ''}
            </td>
          </tr>
        </table>
        ${meta ? `<div style="font-family:${FONT}; font-size:13px; color:${BRAND.muted}; padding-top:16px; border-top:1px solid ${BRAND.line}; margin-top:16px;">${meta}</div>` : ''}
      </td></tr>
    </table>`;
}

/** A small status badge. Tone is the semantic, not the colour. */
export function statusPill(text, tone = 'success') {
  const tones = {
    success: ['#E7F6EC', '#1B7F45'],
    warning: ['#FFF6E5', '#8A6100'],
    danger: ['#FDECEC', '#A32626'],
    info: ['#EAF4F8', '#0A4A5E'],
  };
  const [bg, fg] = tones[tone] || tones.info;
  return `<span style="display:inline-block; background:${bg}; color:${fg}; font-family:${FONT}; font-size:12px; font-weight:700; letter-spacing:0.04em; padding:6px 12px; border-radius:100px;">${text}</span>`;
}


/**
 * A flight segment, laid out the way every itinerary the traveller has ever
 * seen lays one out.
 *
 * MakeMyTrip, Booking.com and the airlines themselves converge on the same
 * shape, because it answers the questions in the order people ask them:
 * a header strip carrying airline / flight number / cabin, then departure and
 * arrival as TIME first and airport code second, with the duration between
 * them. Our first attempt showed `DEL -> GOA` and no times at all, which is
 * the one thing a traveller checks the morning of the flight.
 *
 * Times are passed pre-formatted: the sender knows the timezone, this does not.
 */
export function segmentCard(seg = {}) {
  const {
    airline, flightNumber, cabin,
    depTime, depCode, depCity, depDate, depTerminal,
    arrTime, arrCode, arrCity, arrDate, arrTerminal,
    duration, stops,
  } = seg;

  if (!depCode || !arrCode) return '';

  const header = [airline, flightNumber, cabin].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const stopText = stops === 0 || stops === '0' ? 'Non-stop' : stops ? `${stops} stop${Number(stops) === 1 ? '' : 's'}` : '';

  const end = (time, code, city, date, terminal, align) => `
    <td width="34%" align="${align}" valign="top">
      <div style="font-family:${FONT}; font-size:24px; font-weight:700; line-height:1.1; color:${BRAND.ink}; letter-spacing:-0.01em;">${time || code}</div>
      <div style="font-family:${FONT}; font-size:14px; font-weight:600; color:${BRAND.primary}; padding-top:4px;">${code}${city ? ` · ${city}` : ''}</div>
      ${date ? `<div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted}; padding-top:3px;">${date}</div>` : ''}
      ${terminal ? `<div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted}; padding-top:2px;">Terminal ${terminal}</div>` : ''}
    </td>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px; border:1px solid ${BRAND.line}; border-radius:12px;">
      ${header ? `
      <tr><td style="padding:12px 20px; background:${BRAND.surface}; border-bottom:1px solid ${BRAND.line}; border-radius:12px 12px 0 0; font-family:${FONT}; font-size:13px; font-weight:600; color:${BRAND.primaryDark};">
        ${header}
      </td></tr>` : ''}
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${end(depTime, depCode, depCity, depDate, depTerminal, 'left')}
            <td width="32%" align="center" valign="top" style="padding:4px 6px 0;">
              <div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted};">${duration || ''}</div>
              <!-- The rule is one bordered cell, not two background-filled
                   cells either side of a glyph. Backgrounds on a 1px-high <td>
                   collapse inconsistently - Gmail honoured the height, Outlook
                   did not - which showed as a broken, segmented line. A
                   border-top on a single full-width cell renders identically
                   everywhere, with the plane sitting above it. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 4px;">
                <tr><td align="center" style="font-family:${FONT}; font-size:12px; color:${BRAND.accent}; line-height:1; padding-bottom:4px;">&#9992;</td></tr>
                <tr><td style="border-top:1px solid ${BRAND.line}; font-size:0; line-height:0; height:1px;">&nbsp;</td></tr>
              </table>
              ${stopText ? `<div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted};">${stopText}</div>` : ''}
            </td>
            ${end(arrTime, arrCode, arrCity, arrDate, arrTerminal, 'right')}
          </tr>
        </table>
      </td></tr>
    </table>`;
}

/**
 * Fare breakdown.
 *
 * Every serious travel confirmation itemises the total, because "USD 540.86"
 * with no explanation is the line customers write in about. The total row is
 * visually separated so it reads as the answer rather than another line item.
 */
export function fareBreakdown(rows = [], { total, currency = 'USD', label = 'Total paid', title = 'Fare breakdown' } = {}) {
  const items = rows
    .filter((r) => r && r[1] != null && r[1] !== '')
    .map(([name, amount]) => `
      <tr>
        <td style="padding:8px 0; font-family:${FONT}; font-size:14px; color:${BRAND.muted};">${name}</td>
        <td align="right" style="padding:8px 0; font-family:${FONT}; font-size:14px; color:${BRAND.ink};">${amount}</td>
      </tr>`)
    .join('');

  if (!items && total == null) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; border:1px solid ${BRAND.line}; border-radius:12px;">
      <tr><td style="padding:16px 20px 6px;">
        <div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${BRAND.primary}; padding-bottom:6px;">${title}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
      </td></tr>
      ${total != null ? `
      <tr><td style="padding:12px 20px 16px; border-top:1px solid ${BRAND.line}; background:${BRAND.surface}; border-radius:0 0 12px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:${FONT}; font-size:14px; font-weight:700; color:${BRAND.ink};">${label}</td>
          <td align="right" style="font-family:${FONT}; font-size:20px; font-weight:700; color:${BRAND.primaryDark};">${total}</td>
        </tr></table>
      </td></tr>` : ''}
    </table>`;
}

/**
 * A row of secondary actions.
 *
 * Travel confirmations carry several next steps - web check-in, manage
 * booking, download - and burying them in prose loses them. The primary `cta`
 * stays the filled button; these are outlined and sit below it.
 */
export function actionRow(actions = []) {
  const cells = actions
    .filter((a) => a && a.text && a.url)
    .map((a) => `
      <td align="center" style="padding:4px 5px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="border:1px solid ${BRAND.accent}; border-radius:8px;">
            <a href="${a.url}" target="_blank" rel="noopener"
               style="display:block; padding:11px 10px; font-family:${FONT}; font-size:13px; font-weight:600; color:${BRAND.primary}; text-decoration:none;">${a.text}</a>
          </td></tr>
        </table>
      </td>`)
    .join('');

  if (!cells) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;">
      <tr>${cells}</tr>
    </table>`;
}

/**
 * "What happens next", numbered.
 *
 * The single most common question a customer has after a request email is
 * "and now what?" — and the answer used to be a sentence of prose they had to
 * parse. Every serious travel brand answers it as an explicit, numbered list,
 * because it sets expectations and cuts the follow-up call.
 *
 * Numbers are rendered as text in a fixed-width cell rather than as a styled
 * circle: Outlook collapses a border-radius <div> of that size, and a bold
 * teal numeral reads the same either way.
 */
export function stepList(title, steps = []) {
  const rows = steps
    .filter(Boolean)
    .map((step, i, all) => {
      const [head, detail] = Array.isArray(step) ? step : [step, ''];
      const pad = i === all.length - 1 ? '0' : '0 0 16px';
      return `
      <tr>
        <td width="30" valign="top" style="width:30px; padding:${pad}; font-family:${FONT}; font-size:15px; font-weight:700; line-height:1.5; color:${BRAND.accent};">${i + 1}</td>
        <td valign="top" style="padding:${pad}; font-family:${FONT}; font-size:14px; line-height:1.55; color:${BRAND.ink};">
          <strong style="font-weight:600;">${head}</strong>
          ${detail ? `<div style="font-size:13px; line-height:1.55; color:${BRAND.muted}; padding-top:3px;">${detail}</div>` : ''}
        </td>
      </tr>`;
    })
    .join('');

  if (!rows) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; border:1px solid ${BRAND.line}; border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        ${title ? `<div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${BRAND.primary}; padding-bottom:14px;">${title}</div>` : ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr>
    </table>`;
}

/**
 * A hotel stay, laid out the way `segmentCard` lays out a flight.
 *
 * Check-in and check-out are the two dates that matter, and the number of
 * nights between them is the thing people verify. Same shape as the flight
 * card on purpose: a booking email should look like the same company whether
 * the trip is a flight or a room.
 */
export function stayCard({ property, checkIn, checkOut, nights, guests, roomType }) {
  if (!checkIn && !checkOut) return '';

  const header = [property, roomType].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const nightText = nights ? `${nights} night${Number(nights) === 1 ? '' : 's'}` : '';
  const guestText = guests ? `${guests} guest${String(guests) === '1' ? '' : 's'}` : '';

  const end = (caption, value, align) => `
    <td width="34%" align="${align}" valign="top">
      <div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${BRAND.muted};">${caption}</div>
      <div style="font-family:${FONT}; font-size:19px; font-weight:700; line-height:1.25; color:${BRAND.ink}; padding-top:5px;">${value || 'TBD'}</div>
    </td>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px; border:1px solid ${BRAND.line}; border-radius:12px;">
      ${header ? `
      <tr><td style="padding:12px 20px; background:${BRAND.surface}; border-bottom:1px solid ${BRAND.line}; border-radius:12px 12px 0 0; font-family:${FONT}; font-size:13px; font-weight:600; color:${BRAND.primaryDark};">
        ${header}
      </td></tr>` : ''}
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${end('Check-in', checkIn, 'left')}
            <td width="32%" align="center" valign="top" style="padding:22px 6px 0;">
              <div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted};">${nightText}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">
                <tr><td style="border-top:1px solid ${BRAND.line}; font-size:0; line-height:0; height:1px;">&nbsp;</td></tr>
              </table>
              ${guestText ? `<div style="font-family:${FONT}; font-size:12px; color:${BRAND.muted};">${guestText}</div>` : ''}
            </td>
            ${end('Check-out', checkOut, 'right')}
          </tr>
        </table>
      </td></tr>
    </table>`;
}

/**
 * Label-above-value pairs, two per row.
 *
 * `detailCard` is a ledger: right-aligned values against a left-aligned label,
 * which is right for money and wrong for facts. A sign-in notice or a session
 * summary reads better as a grid of small captions with the value under each,
 * the way an account page shows them. Fixed at two columns because a third
 * column is unreadable at 320px and email cannot reflow.
 */
export function dataGrid(items = []) {
  const clean = items.filter((i) => i && i[1] != null && i[1] !== '');
  if (!clean.length) return '';

  const cell = ([label, value]) => `
    <td width="50%" valign="top" style="padding:10px 12px 10px 0;">
      <div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${BRAND.muted};">${label}</div>
      <div style="font-family:${FONT}; font-size:15px; line-height:1.45; font-weight:600; color:${BRAND.ink}; padding-top:4px; word-break:break-word;">${value}</div>
    </td>`;

  const rows = [];
  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    rows.push(`<tr>${pair.map(cell).join('')}${pair.length === 1 ? '<td width="50%">&nbsp;</td>' : ''}</tr>`);
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0; background:${BRAND.surface}; border:1px solid ${BRAND.line}; border-radius:12px;">
      <tr><td style="padding:12px 20px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>
      </td></tr>
    </table>`;
}

/**
 * Where the request has got to, as a tracker.
 *
 * A status email that says only "Status: quoted" makes the reader work out
 * what that means and what is left. A tracker shows the whole path with the
 * current stop marked, which is the pattern every parcel and every booking
 * app has trained people on.
 *
 * Drawn with a filled/empty dot per column and a rule underneath, all table
 * cells — no absolute positioning, which Outlook would ignore.
 */
export function progressSteps(steps = [], currentIndex = 0) {
  const clean = steps.filter(Boolean);
  if (clean.length < 2) return '';

  const width = Math.floor(100 / clean.length);
  const dots = clean.map((_, i) => {
    const done = i <= currentIndex;
    return `<td width="${width}%" align="center" style="font-family:${FONT}; font-size:16px; line-height:1; color:${done ? BRAND.accent : '#C9D6DD'};">${done ? '&#9679;' : '&#9675;'}</td>`;
  }).join('');

  const labels = clean.map((s, i) => {
    const done = i <= currentIndex;
    return `<td width="${width}%" align="center" style="padding-top:8px; font-family:${FONT}; font-size:11px; line-height:1.35; font-weight:${i === currentIndex ? '700' : '400'}; color:${done ? BRAND.primary : BRAND.muted};">${s}</td>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px; border:1px solid ${BRAND.line}; border-radius:12px;">
      <tr><td style="padding:20px 16px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${dots}</tr>
          <tr><td colspan="${clean.length}" style="padding:0 ${Math.floor(width / 2)}%;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid ${BRAND.line}; font-size:0; line-height:0; height:1px;">&nbsp;</td></tr>
            </table>
          </td></tr>
          <tr>${labels}</tr>
        </table>
      </td></tr>
    </table>`;
}
