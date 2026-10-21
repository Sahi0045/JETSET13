import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('world-atlas/land-50m.json', () => ({
  default: { type: 'Topology', objects: { land: { type: 'GeometryCollection', geometries: [] } }, arcs: [] },
}));

import RouteSeo from '../../frontend/src/seo/RouteSeo.jsx';
import CruiseSailingPage from '../../frontend/src/Pages/Common/cruise/CruiseSailingPage.jsx';
import { officeToday } from '../../frontend/src/Pages/Common/cruise/catalog.js';

const MIAMI = { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 };
const COZUMEL = { name: 'Cozumel', country: 'Mexico', lat: 20.49, lon: -86.97 };
const DETAIL = {
  slug: 'western-caribbean-2-nights-ab12', title: 'Western Caribbean', headline: null, region: 'caribbean', nights: 2,
  from_price_usd: 499, price_checked_on: officeToday(), inclusions: null, photos: [{ url: 'https://cdn.example/ship.jpg', credit: 'RC' }],
  route: null, line_name: 'Royal Caribbean', ship_name: null, dates: ['2099-01-01'],
  days: [{ day: 1, port: MIAMI, arrive: null, depart: '16:00' }, { day: 2, port: COZUMEL, arrive: '08:00', depart: '17:00' }, { day: 3, port: MIAMI, arrive: '07:00', depart: null }],
};

const serve = (body, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));

// The page as the app mounts it: RouteSeo sets the route defaults, the page overrides them.
const renderInApp = (slug) => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[`/cruise/${slug}`]}>
      <RouteSeo />
      <Routes><Route path="/cruise/:slug" element={<CruiseSailingPage />} /></Routes>
    </MemoryRouter>
  </HelmetProvider>,
);

const head = (selector, attribute = 'content') => [...document.head.querySelectorAll(selector)].map((el) => el.getAttribute(attribute));

afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; document.title = ''; });

describe('a sailing page as search engines finally see it', () => {
  it('is indexable, canonical to itself, and shares its own title', async () => {
    serve({ success: true, data: DETAIL });
    renderInApp(DETAIL.slug);
    await waitFor(() => expect(document.title).toBe('Western Caribbean | 2-night cruise | Jetsetters'));
    expect(head('meta[name="robots"]')).toEqual(['index, follow']);
    expect(head('link[rel="canonical"]', 'href')).toEqual([`https://www.jetsetterss.com/cruise/${DETAIL.slug}`]);
    expect(head('meta[property="og:title"]')).toEqual(['Western Caribbean | 2-night cruise | Jetsetters']);
    expect(head('meta[property="og:image"]')).toEqual(['https://cdn.example/ship.jpg']);
  });

  it('is kept out of search when the cruise is not there', async () => {
    serve({ success: false, error: 'Cruise not found' }, 404);
    renderInApp('nope');
    await waitFor(() => expect(head('meta[name="robots"]')).toEqual(['noindex, follow']));
  });
});
