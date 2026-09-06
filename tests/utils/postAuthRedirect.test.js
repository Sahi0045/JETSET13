import { describe, expect, it } from 'vitest';
import { postAuthDestination } from '../../frontend/src/utils/postAuthRedirect.js';

/**
 * Where a visitor lands after signing in.
 *
 * Login and signup sent everyone to `/my-trips` unconditionally, so signing in
 * dropped you on a bookings list rather than the site. Worse, two callers were
 * already passing a destination and both were ignored:
 *
 *   ProtectedRoute  <Navigate to="/login" state={{ from: location }} />
 *   Membership      navigate('/login', { state: { returnUrl: '/membership' } })
 *
 * so a signed-out visitor who clicked a protected page was sent to log in and
 * then taken somewhere else entirely.
 */

describe('postAuthDestination', () => {
  it('goes home when nothing was requested', () => {
    // Home, not My Trips: signing in is not a request to see your bookings.
    expect(postAuthDestination(undefined)).toBe('/');
    expect(postAuthDestination(null)).toBe('/');
    expect(postAuthDestination({})).toBe('/');
  });

  it('honours the returnUrl convention Membership uses', () => {
    expect(postAuthDestination({ returnUrl: '/membership' })).toBe('/membership');
  });

  it('honours the from-location convention ProtectedRoute uses, query and all', () => {
    expect(postAuthDestination({
      from: { pathname: '/flights/search', search: '?from=DEL&to=BOM', hash: '' },
    })).toBe('/flights/search?from=DEL&to=BOM');
  });

  it('prefers returnUrl when both are present', () => {
    expect(postAuthDestination({ returnUrl: '/membership', from: { pathname: '/other' } }))
      .toBe('/membership');
  });

  it('never bounces back to an auth page', () => {
    // Returning to /login after logging in is a loop.
    for (const pathname of ['/login', '/signup', '/forgot-password', '/reset-password']) {
      expect(postAuthDestination({ from: { pathname } })).toBe('/');
    }
  });

  it('refuses a destination that leaves the site', () => {
    // `state` is attacker-influenceable via a crafted link, so an absolute or
    // protocol-relative URL here would be an open redirect.
    expect(postAuthDestination({ returnUrl: 'https://evil.example.com' })).toBe('/');
    expect(postAuthDestination({ returnUrl: '//evil.example.com' })).toBe('/');
    expect(postAuthDestination({ returnUrl: 'javascript:alert(1)' })).toBe('/');
    expect(postAuthDestination({ from: { pathname: 'https://evil.example.com' } })).toBe('/');
  });

  it('ignores a malformed state instead of throwing', () => {
    expect(postAuthDestination({ returnUrl: 42 })).toBe('/');
    expect(postAuthDestination({ from: 'not-an-object' })).toBe('/');
    expect(postAuthDestination({ from: {} })).toBe('/');
  });
});
