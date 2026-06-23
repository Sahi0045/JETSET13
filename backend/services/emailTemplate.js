/**
 * Shared, email-client-safe branded layout for all Jetsetters transactional emails.
 *
 * Emails must use inline styles + table layout (Gmail/Outlook strip most CSS),
 * so this module hand-builds a professional branded shell that every template
 * reuses for a consistent, premium look with the company logo.
 */

export const BRAND = {
  name: 'Jetsetters',
  tagline: 'Jet Set Go',
  primary: '#055B75',
  primaryDark: '#034457',
  accent: '#0890BC',
  sky: '#65B3CF',
  ink: '#1E293B',
  muted: '#64748B',
  bg: '#eef2f5',
  logo: 'https://www.jetsetterss.com/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.png',
  site: 'https://www.jetsetterss.com',
  supportEmail: 'support@jetsetterss.com',
  supportPhone: '(877) 538-7380',
  facebook: 'https://www.facebook.com/people/Jetsetters/61557536332731/',
  instagram: 'https://www.instagram.com/jetsetters_global/',
  year: new Date().getFullYear(),
};

/**
 * Wrap inner content in the full branded email shell.
 * @param {Object} opts
 * @param {string} opts.preheader - hidden inbox preview text
 * @param {string} [opts.emoji] - large hero emoji
 * @param {string} opts.heading - hero heading
 * @param {string} [opts.subheading] - hero subheading
 * @param {string} opts.contentHtml - main body HTML (use helpers below)
 * @param {{text:string,url:string}} [opts.cta] - primary call-to-action button
 * @param {string} [opts.headerLabel] - small label shown in the header band
 */
export function renderBrandedEmail({ preheader = '', emoji = '', heading = '', subheading = '', contentHtml = '', cta = null, headerLabel = '' }) {
  const ctaHtml = cta
    ? `
      <tr><td align="center" style="padding: 8px 0 4px;">
        <a href="${cta.url}" target="_blank"
           style="display:inline-block; background:${BRAND.primary}; background-image:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.accent} 100%); color:#ffffff; text-decoration:none; font-size:16px; font-weight:700; padding:14px 34px; border-radius:10px; letter-spacing:0.02em;">
          ${cta.text}
        </a>
      </td></tr>`
    : '';

  const heroHtml = (emoji || heading || subheading)
    ? `
      <tr><td style="padding: 32px 40px 8px;">
        ${emoji ? `<div style="font-size:44px; line-height:1; margin-bottom:14px;">${emoji}</div>` : ''}
        ${heading ? `<h1 style="margin:0 0 6px; font-size:24px; line-height:1.3; font-weight:800; color:${BRAND.ink};">${heading}</h1>` : ''}
        ${subheading ? `<p style="margin:0; font-size:16px; color:${BRAND.muted};">${subheading}</p>` : ''}
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${BRAND.name}</title>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bg}; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg}; padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 6px 24px rgba(3,68,87,0.10);">

        <!-- Header -->
        <tr><td style="background:${BRAND.primary}; background-image:linear-gradient(135deg,${BRAND.primaryDark} 0%,${BRAND.primary} 55%,${BRAND.accent} 100%); padding:24px 40px; text-align:center;">
          <img src="${BRAND.logo}" alt="${BRAND.name}" height="40" style="height:40px; width:auto; display:inline-block;">
          ${headerLabel ? `<div style="margin-top:10px; color:#ffffff; font-size:12px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; opacity:0.85;">${headerLabel}</div>` : ''}
        </td></tr>

        ${heroHtml}

        <!-- Content -->
        <tr><td style="padding: 16px 40px 8px; font-size:15px; line-height:1.6; color:#3f4b5b;">
          ${contentHtml}
        </td></tr>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody>${ctaHtml}</tbody></table>

        <tr><td style="padding: 24px 40px 8px;"></td></tr>

        <!-- Footer -->
        <tr><td style="padding: 24px 40px 32px; border-top:1px solid #e8edf1; background:#fafcfd;">
          <p style="margin:0 0 6px; font-size:15px; font-weight:800; color:${BRAND.primary};">${BRAND.name} <span style="font-weight:500; font-style:italic; color:${BRAND.sky};">· ${BRAND.tagline}</span></p>
          <p style="margin:0 0 12px; font-size:13px; color:${BRAND.muted};">
            Need help? <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.accent}; text-decoration:none;">${BRAND.supportEmail}</a> &nbsp;·&nbsp; ${BRAND.supportPhone}
          </p>
          <p style="margin:0 0 14px; font-size:13px;">
            <a href="${BRAND.facebook}" style="color:${BRAND.muted}; text-decoration:none;">Facebook</a> &nbsp;·&nbsp;
            <a href="${BRAND.instagram}" style="color:${BRAND.muted}; text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
            <a href="${BRAND.site}" style="color:${BRAND.muted}; text-decoration:none;">jetsetterss.com</a>
          </p>
          <p style="margin:0; font-size:11px; color:#9aa7b2;">© ${BRAND.year} ${BRAND.name}. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A bordered detail card with a title and label/value rows. rows = [[label, value], ...] */
export function detailCard(title, rows = []) {
  const rowsHtml = rows
    .filter((r) => r && r[1] != null && r[1] !== '')
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:9px 0; border-bottom:1px solid #eef2f5; font-size:14px; color:${BRAND.muted};">${label}</td>
        <td style="padding:9px 0; border-bottom:1px solid #eef2f5; font-size:14px; color:${BRAND.ink}; font-weight:600; text-align:right;">${value}</td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc; border:1px solid #e8edf1; border-radius:12px; padding:8px 18px; margin:18px 0;">
      ${title ? `<tr><td colspan="2" style="padding:10px 0 6px; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${BRAND.primary};">${title}</td></tr>` : ''}
      ${rowsHtml}
    </table>`;
}

/** A highlighted callout box. */
export function highlightBox(html, { bg = '#E0F2F8', border = BRAND.sky, color = '#075985' } = {}) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
      <tr><td style="background:${bg}; border-left:4px solid ${border}; border-radius:0 10px 10px 0; padding:14px 18px; font-size:15px; color:${color};">
        ${html}
      </td></tr>
    </table>`;
}

/** A paragraph styled consistently. */
export function paragraph(html) {
  return `<p style="margin:0 0 16px; font-size:15px; line-height:1.65; color:#3f4b5b;">${html}</p>`;
}

export function stripHtml(html) {
  return String(html).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}
