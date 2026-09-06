/**
 * Where to send someone once they have signed in.
 *
 * The login and signup pages sent everyone to `/my-trips` unconditionally.
 * Two callers already pass a destination and both were ignored:
 *
 *   ProtectedRoute  <Navigate to="/login" state={{ from: location }} />
 *   Membership      navigate('/login', { state: { returnUrl: '/membership' } })
 *
 * So a signed-out visitor who clicked a protected page was sent to log in and
 * then dropped on My Trips instead of the page they asked for, and everyone
 * else landed on a trips list rather than the site.
 *
 * Home is the fallback, not My Trips: signing in is not a request to see your
 * bookings.
 *
 * @param {object} [state] the router location state on the login page
 * @returns {string} a path to navigate to
 */
export const postAuthDestination = (state) => {
  const returnUrl = state?.returnUrl;
  if (typeof returnUrl === 'string' && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
    return returnUrl;
  }

  const from = state?.from;
  if (from && typeof from.pathname === 'string' && from.pathname.startsWith('/')) {
    // Never bounce back to an auth page — that is a loop.
    if (!/^\/(login|signup|forgot-password|reset-password)\b/.test(from.pathname)) {
      return `${from.pathname}${from.search || ''}${from.hash || ''}`;
    }
  }

  return '/';
};
