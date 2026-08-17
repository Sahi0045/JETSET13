const EXACT_SPA_ROUTES = new Set([
  '/',
  '/dashboard',
  '/login',
  '/signup',
  '/profiledashboard',
  '/complete-profile',
  '/profile/privacy',
  '/profile/notifications',
  '/help',
  '/supabase-login',
  '/supabase-signup',
  '/supabase-profile',
  '/supabase-auth-debug',
  '/supabase-auth-status',
  '/auth/callback',
  '/my-trips',
  '/manage-booking',
  '/forgot-password',
  '/reset-password',
  '/booking-confirmation',
  '/cruise',
  '/cruises',
  '/itinerary',
  '/cruise-booking-summary',
  '/cruise-booking-success',
  '/flight',
  '/flights',
  '/flights/search',
  '/flights/booking-confirmation',
  '/flight-payment',
  '/flight-create-orders',
  '/flight-booking-success',
  '/packages',
  '/hotels',
  '/hotels/search',
  '/hotels/details',
  '/hotels/booking-summary',
  '/hotel-booking-success',
  '/packages/itinerary',
  '/packages/booking-summary',
  '/visa',
  '/visa/documents',
  '/visa/apply',
  '/visa/success',
  '/visa/track',
  '/visa/status',
  '/visa/booking',
  '/visa/refund-policy',
  '/visa/terms',
  '/visa/privacy',
  '/visa/agent/set-password',
  '/privacy-policy',
  '/terms-conditions',
  '/cookies',
  '/careers',
  '/resources',
  '/destinations',
  '/travel-blog',
  '/support',
  '/faqs',
  '/company',
  '/contact',
  '/request',
  '/quote-detail',
  '/payment/callback',
  '/payment/success',
  '/payment/failed',
  '/membership',
  '/admin/login',
  '/agent/set-password',
]);

const DYNAMIC_SPA_ROUTE_PATTERNS = [
  /^\/manage-booking\/[^/]+$/,
  /^\/flights\/booking\/[^/]+$/,
  /^\/visa\/consultation\/[^/]+$/,
  /^\/inquiry\/[^/]+$/,
  /^\/pay\/[^/]+$/,
];

const WILDCARD_SPA_ROUTE_PREFIXES = [
  '/admin',
  '/agent',
  '/visa/agent',
  '/visa/admin',
];

const LEGACY_REDIRECTS = new Map([
  ['/rental', '/hotels'],
  ['/rental/booking', '/hotels'],
  ['/rentals', '/hotels'],
  ['/hotel-details', '/hotels'],
  ['/hotel-search', '/hotels/search'],
  ['/hotel-search-results', '/hotels/search'],
  ['/privacy', '/privacy-policy'],
  ['/terms', '/terms-conditions'],
  ['/pricing', '/membership'],
  ['/blog', '/travel-blog'],
  ['/faq', '/faqs'],
  ['/cruise-booking', '/cruises'],
  ['/reviews', '/'],
  ['/covid-updates', '/'],
  ['/special-offers', '/'],
  ['/secure-booking', '/privacy-policy'],
]);

const normalizePathname = (pathname) => {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null;
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
};

/**
 * Returns a canonical destination for a legacy client-side alias, if one exists.
 * Legacy destination routes previously used React Router's Navigate component.
 */
export const getLegacyRedirect = (pathname) => {
  const normalizedPath = normalizePathname(pathname);
  if (!normalizedPath) return null;

  if (/^\/destinations\/[^/]+$/.test(normalizedPath)) return '/cruises';
  return LEGACY_REDIRECTS.get(normalizedPath) || null;
};

/**
 * Determines whether a browser document request is handled by the React SPA.
 * Static files and API routes are handled before this matcher.
 */
export const isSpaRoute = (pathname) => {
  const normalizedPath = normalizePathname(pathname);
  if (!normalizedPath || getLegacyRedirect(normalizedPath)) return false;

  return EXACT_SPA_ROUTES.has(normalizedPath)
    || DYNAMIC_SPA_ROUTE_PATTERNS.some((pattern) => pattern.test(normalizedPath))
    || WILDCARD_SPA_ROUTE_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
    );
};
