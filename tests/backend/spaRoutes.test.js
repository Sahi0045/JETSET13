import { describe, expect, it } from 'vitest';
import { getLegacyRedirect, isSpaRoute } from '../../shared/spaRoutes.js';

describe('SPA route contract', () => {
  it.each([
    '/',
    '/flights',
    '/hotels/search',
    '/visa/apply',
    '/profile/privacy',
    '/payment/success',
    '/admin/login',
  ])('recognizes exact client route %s', (pathname) => {
    expect(isSpaRoute(pathname)).toBe(true);
  });

  it.each([
    '/manage-booking/booking-123',
    '/flights/booking/booking-123',
    '/visa/consultation/consultation-123',
    '/inquiry/inquiry-123',
    '/pay/payment-token',
  ])('recognizes dynamic client route %s', (pathname) => {
    expect(isSpaRoute(pathname)).toBe(true);
  });

  it.each([
    '/admin/users',
    '/agent/dashboard',
    '/visa/agent/applications',
    '/visa/admin/reports',
  ])('recognizes wildcard client route %s', (pathname) => {
    expect(isSpaRoute(pathname)).toBe(true);
  });

  it.each([
    '/flights/booking/',
    '/pay/',
    '/seo-audit-nonexistent-20260817',
    '/assets/not-a-real-file.js',
    '/destinations/paris/extra',
  ])('rejects invalid browser route %s', (pathname) => {
    expect(isSpaRoute(pathname)).toBe(false);
  });

  it.each([
    ['/blog', '/travel-blog'],
    ['/hotel-search', '/hotels/search'],
    ['/rentals', '/hotels'],
    ['/pricing', '/membership'],
    ['/destinations/paris', '/cruises'],
    // Search Console reported /about as a soft 404 from 26 Oct 2024: the About
    // page lives at /company, and /about was never mapped or routed.
    ['/about', '/company'],
    ['/about-us', '/company'],
  ])('maps legacy route %s to %s', (pathname, destination) => {
    expect(getLegacyRedirect(pathname)).toBe(destination);
    expect(isSpaRoute(pathname)).toBe(false);
  });

  it('normalizes trailing slashes without accepting malformed paths', () => {
    expect(isSpaRoute('/flights/')).toBe(true);
    expect(isSpaRoute('/manage-booking/')).toBe(true);
    expect(getLegacyRedirect('/blog/')).toBe('/travel-blog');
    expect(isSpaRoute('flights')).toBe(false);
  });
});
