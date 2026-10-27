import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Visa and document services are hidden from customers (owner, 27 Oct 2026):
 * no link to them anywhere, every customer visa address goes home, and none is
 * offered to search engines. The visa admin and agent panels keep working.
 */

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: null, isAuthenticated: false, signOut: vi.fn() }),
}));
vi.mock('../../frontend/src/lib/supabase', () => ({ default: { from: vi.fn() } }));
vi.mock('../../frontend/src/Components/CurrencySelector', () => ({ default: () => null }));
vi.mock('../../frontend/src/components/Breadcrumb', () => ({ default: () => null }));

const { default: Navbar } = await import('../../frontend/src/Pages/Common/Navbar.jsx');
const { default: Footer } = await import('../../frontend/src/Pages/Common/Footer.jsx');
const { default: HelpCenter } = await import('../../frontend/src/Pages/Common/HelpCenter.jsx');
const { INDEXABLE_ROUTE_SEO } = await import('../../frontend/src/seo/routeSeo.js');

const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
const visaLinks = (container) => [...container.querySelectorAll('a[href]')]
  .map((link) => link.getAttribute('href'))
  .filter((href) => /^\/visa(\/|$)/.test(href));

afterEach(() => vi.unstubAllGlobals());

describe('the visa section, while hidden', () => {
  it('has no link in the menu, the footer or the help centre', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    for (const [name, Page] of [['menu', Navbar], ['footer', Footer], ['help centre', HelpCenter]]) {
      const { container, unmount } = render(<MemoryRouter><Page /></MemoryRouter>);
      expect(visaLinks(container), name).toEqual([]);
      unmount();
    }
  });

  it('is in neither the sitemap nor the pre-rendered pages', () => {
    expect(INDEXABLE_ROUTE_SEO.map(({ pathname }) => pathname).filter((pathname) => pathname.startsWith('/visa'))).toEqual([]);
  });

  it('redirects every customer visa address home, for now, and leaves the admin and agent panels alone', () => {
    const { redirects } = JSON.parse(read('vercel.json'));
    const visa = redirects.filter((rule) => rule.source.startsWith('/visa'));
    const sources = visa.map((rule) => rule.source);

    expect(sources).toEqual(expect.arrayContaining([
      '/visa',
      '/visa/(documents|apply|success|track|status|booking|refund-policy|terms|privacy)',
      '/visa/consultation/:id',
    ]));
    for (const rule of visa) {
      expect(rule.destination).toBe('/');
      expect(rule.permanent).toBe(false);
      expect(rule.source).not.toMatch(/admin|agent/);
    }
  });

  it('sends a visit inside the app home too, but not the admin or agent panels', () => {
    const app = read('frontend/src/app.jsx');
    expect(app).toMatch(/<Route path="\/visa\/\*" element=\{<Navigate to="\/" replace \/>\} \/>/);
    expect(app).toMatch(/<Route path="\/visa\/admin\/\*" element=\{<VisaAdminPanel \/>\} \/>/);
    expect(app).toMatch(/<Route path="\/visa\/agent\/\*" element=\{<VisaAdminPanel \/>\} \/>/);
  });
});
