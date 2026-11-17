import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: null, isAuthenticated: false, signOut: vi.fn() }),
}));
vi.mock('../../frontend/src/lib/supabase', () => ({ default: { from: vi.fn() } }));
vi.mock('../../frontend/src/Components/CurrencySelector', () => ({ default: () => null }));
vi.mock('../../frontend/src/components/Breadcrumb', () => ({ default: () => null }));

const COMING_SOON_PAGE = '../../frontend/src/Pages/Common/ComingSoon.jsx';
const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

const SECTION_ROUTES = {
  cruise: ['/cruise', '/cruises', '/itinerary'],
  hotels: ['/hotels', '/hotels/search', '/hotels/details', '/hotels/booking-summary', '/hotel-booking-success'],
  packages: ['/packages', '/packages/itinerary', '/packages/booking-summary'],
};

describe('cruises, hotels and packages, while coming soon', () => {
  it('show the coming-soon page at every address in the section', () => {
    const app = read('frontend/src/app.jsx');
    for (const [section, paths] of Object.entries(SECTION_ROUTES)) {
      for (const route of paths) {
        const line = app.split('\n').find((text) => text.includes(`<Route path="${route}" `));
        expect(line, route).toContain(`unlessComingSoon('${section}', `);
      }
    }
  });

  it('are all switched to coming soon', async () => {
    const { COMING_SOON_SECTIONS } = await import('../../shared/siteSections.js');
    expect(COMING_SOON_SECTIONS).toEqual({ cruise: true, hotels: true, packages: true });
  });

  it('say coming soon and how to book with the team instead', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const { default: ComingSoon } = await import(/* @vite-ignore */ COMING_SOON_PAGE);
    for (const [section, title] of [['cruise', 'Cruises'], ['hotels', 'Hotels'], ['packages', 'Holiday packages']]) {
      const { container, getByRole, unmount } = render(<MemoryRouter><ComingSoon section={section} /></MemoryRouter>);
      expect(getByRole('heading', { level: 1 }).textContent, section).toBe(title);
      expect(container.querySelector('main').textContent, section).toMatch(/Coming soon/);
      expect(container.querySelector('main a[href="tel:+18775387380"]'), section).not.toBeNull();
      expect(container.querySelector('main a[href^="mailto:support@jetsetterss.com"]'), section).not.toBeNull();
      expect(container.querySelector('main a[href="/flights"]'), section).not.toBeNull();
      unmount();
    }
    vi.unstubAllGlobals();
  });

  it('no longer offer the $50 voucher on the hotels page', () => {
    const hotels = read('frontend/src/Pages/Common/hotels/HotelsLanding.jsx');
    expect(hotels).not.toMatch(/\$50 OFF/);
    expect(hotels).not.toMatch(/Self-Service Portal Coming Soon/);
  });
});
