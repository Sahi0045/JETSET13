import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));

import CruisesPage from '../../frontend/src/Pages/Common/cruise/CruisesPage.jsx';
import { officeToday } from '../../frontend/src/Pages/Common/cruise/catalog.js';

const daysAgo = (n) => officeToday(new Date(Date.now() - n * 86400000));
const MIAMI = { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 };
const NASSAU = { name: 'Nassau', country: 'Bahamas', lat: 25.08, lon: -77.35 };
const JUNEAU = { name: 'Juneau', country: 'United States', lat: 58.3, lon: -134.41 };
const SEATTLE = { name: 'Seattle', country: 'United States', lat: 47.63, lon: -122.38 };

const sailing = (over) => ({
  slug: 's', title: 'T', headline: null, region: 'bahamas', nights: 3, from_price_usd: 599, price_checked_on: daysAgo(1),
  photo: null, line_name: 'Line', ship_name: null, port_names: ['Miami', 'Nassau'], ports: [MIAMI, NASSAU],
  start_port: 'Miami', end_port: 'Miami', route: { type: 'LineString', coordinates: [[-80.17, 25.77], [-77.35, 25.08], [-80.17, 25.77]] },
  next_date: '2026-12-05', date_count: 3, ...over,
});

const SAILINGS = [
  sailing({ slug: 'bahamas-3', title: 'Bahamas getaway' }),
  sailing({ slug: 'alaska-7', title: 'Inside Passage', region: 'alaska', nights: 7, start_port: 'Seattle', end_port: 'Juneau', port_names: ['Seattle', 'Juneau'], ports: [SEATTLE, JUNEAU], from_price_usd: 1299, price_checked_on: daysAgo(45), date_count: 1 }),
];
const REGIONS = [
  { key: 'bahamas', name: 'Bahamas', lat: 25, lon: -77.5, count: 1 },
  { key: 'alaska', name: 'Alaska', lat: 58, lon: -136, count: 1 },
];

const serve = ({ sailings = SAILINGS, regions = REGIONS } = {}) => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const data = String(url).includes('/regions') ? regions : sailings;
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  }));
};

const renderPage = (path = '/cruises') => render(
  <HelmetProvider><MemoryRouter initialEntries={[path]}><CruisesPage /></MemoryRouter></HelmetProvider>,
);

beforeEach(() => serve());
afterEach(() => vi.unstubAllGlobals());

describe('/cruises', () => {
  it('shows a card per published sailing, linked to its page', async () => {
    renderPage();
    const card = (await screen.findByText('Bahamas getaway')).closest('a');
    expect(card.getAttribute('href')).toBe('/cruise/bahamas-3');
    expect(screen.getByText('Inside Passage').closest('a').getAttribute('href')).toBe('/cruise/alaska-7');
    expect(within(card).getByText('From $599')).toBeTruthy();
    expect(within(card).getByText(/Next sailing 5 Dec 2026/)).toBeTruthy();
  });

  it('filters by the region chip', async () => {
    renderPage();
    await screen.findByText('Bahamas getaway');
    fireEvent.click(screen.getByRole('button', { name: 'Alaska · 1 sailing' }));
    expect(screen.queryByText('Bahamas getaway')).toBeNull();
    expect(screen.getByText('Inside Passage')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All regions · 2 sailings' }));
    expect(screen.getByText('Bahamas getaway')).toBeTruthy();
  });

  it('opens on the region named in the address', async () => {
    renderPage('/cruises?region=alaska');
    expect(await screen.findByText('Inside Passage')).toBeTruthy();
    expect(screen.queryByText('Bahamas getaway')).toBeNull();
  });

  it("shows \"Ask for today's price\" for an old price", async () => {
    renderPage();
    const card = (await screen.findByText('Inside Passage')).closest('a');
    expect(within(card).getByText("Ask for today's price")).toBeTruthy();
    expect(within(card).queryByText(/\$1,299/)).toBeNull();
  });

  it('says round trip when it starts and ends in the same port', async () => {
    renderPage();
    const bahamas = (await screen.findByText('Bahamas getaway')).closest('a');
    expect(within(bahamas).getByText(/3 nights · round trip from Miami · 1 port of call/)).toBeTruthy();
    const alaska = screen.getByText('Inside Passage').closest('a');
    expect(within(alaska).getByText(/7 nights · Seattle to Juneau/)).toBeTruthy();
  });

  it('shows on the page what it tells search engines, and promises no live prices', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Booked by our team' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Port by port' })).toBeTruthy();
    const seo = (await import('../../frontend/src/seo/routeSeo.js')).ROUTE_SEO['/cruises'];
    expect(seo.description).not.toMatch(/today's price/i);
    expect(JSON.stringify(seo.schema)).not.toMatch(/FAQPage/);
  });

  it('shows the contact empty state when nothing is published', async () => {
    serve({ sailings: [], regions: [] });
    renderPage();
    expect(await screen.findByText(/Our cruise team is adding sailings/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '(877) 538-7380' }).getAttribute('href')).toBe('tel:+18775387380');
    expect(screen.getByRole('link', { name: 'support@jetsetterss.com' }).getAttribute('href')).toBe('mailto:support@jetsetterss.com');
  });

  it('says so when the cruises cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ success: false }) })));
    renderPage();
    expect(await screen.findByText(/We couldn't load the cruises just now/)).toBeTruthy();
  });
});
