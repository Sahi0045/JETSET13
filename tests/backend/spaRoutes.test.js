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

  // Production is Vercel, which serves redirects from vercel.json — it never
  // reaches server.js's getLegacyRedirect. /about was added to LEGACY_REDIRECTS
  // alone and shipped as a live 404, so the two lists must stay in step.
  it('mirrors every legacy redirect into vercel.json', async () => {
    const { readFile } = await import('node:fs/promises');
    const config = JSON.parse(await readFile('vercel.json', 'utf8'));
    const configured = new Map(config.redirects.map(({ source, destination }) => [source, destination]));

    const source = await readFile('shared/spaRoutes.js', 'utf8');
    const block = source.match(/const LEGACY_REDIRECTS = new Map\(\[([\s\S]*?)\]\);/)[1];
    const legacy = [...block.matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map(([, from, to]) => [from, to]);

    expect(legacy.length).toBeGreaterThan(0);
    for (const [from, to] of legacy) {
      expect(configured.get(from), `vercel.json is missing a redirect for ${from}`).toBe(to);
    }
    expect(config.redirects.every(({ permanent }) => permanent === true)).toBe(true);
  });

  it('normalizes trailing slashes without accepting malformed paths', () => {
    expect(isSpaRoute('/flights/')).toBe(true);
    expect(isSpaRoute('/manage-booking/')).toBe(true);
    expect(getLegacyRedirect('/blog/')).toBe('/travel-blog');
    expect(isSpaRoute('flights')).toBe(false);
  });
});
