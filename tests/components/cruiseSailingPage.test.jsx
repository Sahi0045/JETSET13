import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('world-atlas/land-50m.json', () => ({
  default: { type: 'Topology', objects: { land: { type: 'GeometryCollection', geometries: [] } }, arcs: [] },
}));

import CruiseSailingPage from '../../frontend/src/Pages/Common/cruise/CruiseSailingPage.jsx';
import { officeToday } from '../../frontend/src/Pages/Common/cruise/catalog.js';

const daysAgo = (n) => officeToday(new Date(Date.now() - n * 86400000));
const MIAMI = { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 };
const ROATAN = { name: 'Roatán', country: 'Honduras', lat: 16.32, lon: -86.54 };
const COZUMEL = { name: 'Cozumel', country: 'Mexico', lat: 20.49, lon: -86.97 };

const DETAIL = {
  slug: 'western-caribbean-4-nights-ab12',
  title: 'Western Caribbean',
  headline: 'Leave Miami at four. Wake up off Honduras two days later.',
  region: 'caribbean',
  nights: 4,
  from_price_usd: 849,
  price_checked_on: daysAgo(2),
  inclusions: 'Main dining and entertainment.',
  photos: [{ url: 'https://cdn.example/ship.jpg', credit: 'Royal Caribbean' }],
  route: { type: 'LineString', coordinates: [[-80.17, 25.77], [-86.54, 16.32], [-86.97, 20.49], [-80.17, 25.77]] },
  line_name: 'Royal Caribbean',
  ship_name: 'Wonder of the Seas',
  dates: ['2026-12-05', '2027-01-09'],
  days: [
    { day: 1, port: MIAMI, arrive: null, depart: '16:00' },
    { day: 2, port: null, arrive: null, depart: null },
    { day: 3, port: ROATAN, arrive: '08:00', depart: '17:00' },
    { day: 4, port: COZUMEL, arrive: '07:00', depart: '18:00' },
    { day: 5, port: MIAMI, arrive: '06:00', depart: null },
  ],
};

const serve = (body, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));

const renderPage = (slug = DETAIL.slug) => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[`/cruise/${slug}`]}>
      <Routes><Route path="/cruise/:slug" element={<CruiseSailingPage />} /></Routes>
    </MemoryRouter>
  </HelmetProvider>,
);

const jsonLd = () => [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));

afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; });

describe('/cruise/:slug', () => {
  it('lists every day as text with 12-hour times', async () => {
    serve({ success: true, data: DETAIL });
    renderPage();
    const days = await screen.findByRole('list', { name: 'Day by day' });
    expect(within(days).getByText('At sea')).toBeTruthy();
    expect(within(days).getAllByText(/Arrive 8:00 AM/).length).toBeGreaterThan(0);
    expect(within(days).getAllByText(/Depart 5:00 PM/).length).toBeGreaterThan(0);
    expect(within(days).getByText(/Depart 4:00 PM/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: DETAIL.headline })).toBeTruthy();
    expect(screen.getByText(/CARIBBEAN · 4 NIGHTS · ROUND TRIP FROM MIAMI/)).toBeTruthy();
  });

  it('calls and emails about this cruise', async () => {
    serve({ success: true, data: DETAIL });
    renderPage();
    const call = (await screen.findAllByRole('link', { name: /Call \(877\) 538-7380/ }))[0];
    expect(call.getAttribute('href')).toBe('tel:+18775387380');
    const email = screen.getAllByRole('link', { name: /Email us about this cruise/ })[0];
    expect(email.getAttribute('href')).toBe('mailto:support@jetsetterss.com?subject=Cruise%20inquiry%3A%20Western%20Caribbean');
    expect(screen.getAllByText('From $849').length).toBeGreaterThan(0);
  });

  it("says the cruise isn't available for an unknown slug", async () => {
    serve({ success: false, error: 'Cruise not found' }, 404);
    renderPage('nope');
    expect(await screen.findByText("This cruise isn't available")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all cruises' }).getAttribute('href')).toBe('/cruises');
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex'));
  });

  it('names the cruise for search engines, with its ports', async () => {
    serve({ success: true, data: DETAIL });
    renderPage();
    await waitFor(() => expect(document.title).toBe('Western Caribbean | 4-night cruise | Jetsetters'));
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content'))
      .toBe('4 nights round trip from Miami, calling at Roatán and Cozumel.');
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href'))
      .toBe('https://www.jetsetterss.com/cruise/western-caribbean-4-nights-ab12');
    const trip = jsonLd().find((d) => d['@type'] === 'Trip');
    expect(trip.itinerary.itemListElement.map((i) => i.item.name)).toEqual(['Miami, United States', 'Roatán, Honduras', 'Cozumel, Mexico']);
    expect(trip.offers).toMatchObject({ price: 849, priceCurrency: 'USD' });
  });

  it('leaves offers out of the structured data when the price is old', async () => {
    serve({ success: true, data: { ...DETAIL, price_checked_on: daysAgo(40) } });
    renderPage();
    await waitFor(() => expect(jsonLd().some((d) => d['@type'] === 'Trip')).toBe(true));
    expect(jsonLd().find((d) => d['@type'] === 'Trip').offers).toBeUndefined();
    expect(screen.getAllByText("Ask for today's price").length).toBeGreaterThan(0);
  });

  it('lists the sailing dates and photo credits', async () => {
    serve({ success: true, data: DETAIL });
    renderPage();
    expect(await screen.findByText('5 Dec 2026')).toBeTruthy();
    expect(screen.getByText('9 Jan 2027')).toBeTruthy();
    expect(screen.getByText('Photo: Royal Caribbean')).toBeTruthy();
    expect(screen.getByText(/Wonder of the Seas/)).toBeTruthy();
    expect(screen.getByText('Main dining and entertainment.')).toBeTruthy();
  });
});
