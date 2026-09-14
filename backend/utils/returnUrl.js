/**
 * Where a payment page may send the customer when they finish or cancel.
 *
 * Checkout passed the request's `returnUrl`/`cancelUrl` (and the quote flow's
 * `return_url`/`cancel_url`) straight to ARC, so anyone could create a real
 * ARC Pay session on this merchant that lands the payer on a site of their
 * choosing - a convincing phishing step right after a genuine card payment,
 * with the result indicator in the query string.
 *
 * Accepted:
 *  - the site's own origins: FRONTEND_URL's, www.jetsetterss.com and
 *    jetsetterss.com (https);
 *  - localhost dev origins, outside production only;
 *  - the mobile app's own URL schemes. The app sends
 *    `jetsettermobile://payment/callback?...` and `jetsetterss://...` so the
 *    in-app browser returns to the app; a scheme hands the customer to an app
 *    on their device, not to another website.
 * Anything else - another host, a lookalike, credentials in the URL, a
 * relative or protocol-relative path, `javascript:` - is replaced by the
 * caller's default, which is built from the site origin.
 */

const SITE_ORIGINS = ['https://www.jetsetterss.com', 'https://jetsetterss.com'];
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];
const APP_SCHEMES = ['jetsettermobile:', 'jetsetterss:'];

const parse = (value) => {
  try {
    return new URL(String(value).trim());
  } catch {
    return null;
  }
};

/** The origins a return URL may point at, for this environment. */
export function siteOrigins(env = process.env) {
  const origins = new Set(SITE_ORIGINS);
  const configured = parse(env.FRONTEND_URL);
  if (configured && ['http:', 'https:'].includes(configured.protocol)) origins.add(configured.origin);
  // NODE_ENV alone is not trusted to say "production": a production deploy has
  // run with NODE_ENV=development before (see auth.middleware.js).
  const isProduction = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
  if (!isProduction) DEV_ORIGINS.forEach((origin) => origins.add(origin));
  return origins;
}

/**
 * `candidate` when it is somewhere the customer may be sent, otherwise
 * `fallback`. The accepted URL comes back in its parsed form, so what ARC
 * redirects to is exactly what was checked.
 */
export function safeReturnUrl(candidate, fallback, env = process.env) {
  if (typeof candidate !== 'string' || !candidate.trim()) return fallback;
  const url = parse(candidate);
  if (!url || url.username || url.password) return fallback;
  if (APP_SCHEMES.includes(url.protocol)) return url.href;
  if (!['http:', 'https:'].includes(url.protocol)) return fallback;
  return siteOrigins(env).has(url.origin) ? url.href : fallback;
}
