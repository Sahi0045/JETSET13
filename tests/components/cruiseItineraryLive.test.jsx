import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/Services/callbackService', () => ({ default: { createCallbackRequest: vi.fn() } }));

import Itinerary from '../../frontend/src/Pages/Common/cruise/Itinerary.jsx';
import callbackService from '../../frontend/src/Services/callbackService';
import { officeToday } from '../../frontend/src/Pages/Common/cruise/catalog.js';

const daysAgo = (n) => officeToday(new Date(Date.now() - n * 86400000));
const MIAMI = { name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 };
const ROATAN = { name: 'Roatán', country: 'Honduras', lat: 16.32, lon: -86.54 };
const COZUMEL = { name: 'Cozumel', country: 'Mexico', lat: 20.49, lon: -86.97 };

const SAILING = {
  slug: 'western-caribbean-4-nights-ab12',
  title: 'Western Caribbean',
  headline: 'Leave Miami at four. Wake up off Honduras two days later.',
  region: 'caribbean',
  nights: 4,
  from_price_usd: 849,
  price_checked_on: daysAgo(2),
  inclusions: 'Main dining and entertainment.',
  photos: [{ url: 'https://cdn.example/ship.jpg', credit: 'Royal Caribbean' }, { url: 'https://cdn.example/deck.jpg', credit: 'Royal Caribbean' }],
  route: null,
  line_name: 'Royal Caribbean',
  ship_name: 'Wonder of the Seas',
  dates: ['2099-12-05', '2100-01-09'],
  days: [
    { day: 1, port: MIAMI, arrive: null, depart: '16:00' },
    { day: 2, port: null, arrive: null, depart: null },
    { day: 3, port: ROATAN, arrive: '08:00', depart: '17:00' },
    { day: 4, port: COZUMEL, arrive: '07:00', depart: '18:00' },
    { day: 5, port: MIAMI, arrive: '06:00', depart: null },
  ],
};

const serve = (body, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));

const show = (search) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[`/itinerary${search}`]}>
      <Routes><Route path="/itinerary" element={<Itinerary />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

afterEach(() => { vi.unstubAllGlobals(); });

describe('the itinerary page', () => {
  it('shows the sailing staff published, day by day', async () => {
    serve({ success: true, data: SAILING });
    show(`?sailing=${SAILING.slug}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Western Caribbean' })).toBeTruthy();
    expect(screen.getByText(SAILING.headline)).toBeTruthy();
    expect(screen.getByText('Round trip from Miami')).toBeTruthy();
    const days = screen.getByRole('list', { name: 'Day by day' });
    const items = within(days).getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/Day 1.*Miami, United States.*Depart 4:00 PM/);
    expect(items[1]).toMatch(/Day 2.*At sea/);
    expect(items[2]).toMatch(/Day 3.*Roatán, Honduras.*Arrive 8:00 AM.*Depart 5:00 PM/);
    expect(items[4]).toMatch(/Day 5.*Miami.*Arrive 6:00 AM/);
  });

  it('lists the dates, what is included, the ship and the photo credits', async () => {
    serve({ success: true, data: SAILING });
    show(`?sailing=${SAILING.slug}`);
    expect(await screen.findByText('5 Dec 2099')).toBeTruthy();
    expect(screen.getByText('9 Jan 2100')).toBeTruthy();
    expect(screen.getByText('Main dining and entertainment.')).toBeTruthy();
    expect(screen.getAllByText(/Wonder of the Seas/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Photo: Royal Caribbean').length).toBeGreaterThan(0);
  });

  it('shows the price with its date, and calls and emails about this cruise', async () => {
    serve({ success: true, data: SAILING });
    show(`?sailing=${SAILING.slug}`);
    expect((await screen.findAllByText('From $849')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/per person, port fees included · price checked/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Call \(877\) 538-7380/ })[0].getAttribute('href')).toBe('tel:+18775387380');
    expect(screen.getAllByRole('link', { name: /Email us about this cruise/ })[0].getAttribute('href'))
      .toBe('mailto:support@jetsetterss.com?subject=Cruise%20inquiry%3A%20Western%20Caribbean');
  });

  it('keeps the price and the call button in reach on a phone', async () => {
    serve({ success: true, data: SAILING });
    show(`?sailing=${SAILING.slug}`);
    const bar = await screen.findByTestId('phone-price-bar');
    expect(bar.textContent).toMatch(/From \$849/);
    expect(within(bar).getByRole('link', { name: /Call/ }).getAttribute('href')).toBe('tel:+18775387380');
  });

  it('tells our team which cruise a call back is about', async () => {
    serve({ success: true, data: SAILING });
    show(`?sailing=${SAILING.slug}`);
    fireEvent.click((await screen.findAllByRole('button', { name: /Callback|Request a call back/ }))[0]);
    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Ann Lee' } });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), { target: { value: 'ann@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('+1 234 567 890'), { target: { value: '+1 555 0100' } });
    fireEvent.change(screen.getByPlaceholderText('Preferred dates or cabin'), { target: { value: 'Balcony please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request call back' }));
    await waitFor(() => expect(callbackService.createCallbackRequest).toHaveBeenCalled());
    const sent = callbackService.createCallbackRequest.mock.calls[0][0].message;
    expect(sent).toContain('Balcony please');
    expect(sent).toContain(`Cruise: Western Caribbean (${SAILING.slug})`);
  });

  it('says one night, not one nights', async () => {
    serve({ success: true, data: { ...SAILING, nights: 1 } });
    show(`?sailing=${SAILING.slug}`);
    expect(await screen.findByRole('heading', { name: 'Your 1-night itinerary' })).toBeTruthy();
    expect(screen.queryByText(/1 nights/)).toBeNull();
  });

  it("asks for today's price when the price is old", async () => {
    serve({ success: true, data: { ...SAILING, price_checked_on: daysAgo(40) } });
    show(`?sailing=${SAILING.slug}`);
    expect((await screen.findAllByText("Ask for today's price")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$849/)).toBeNull();
  });

  it('shows no stock highlights or amenities that staff did not enter', async () => {
    serve({ success: true, data: SAILING });
    show(`?sailing=${SAILING.slug}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Cruise highlights')).toBeNull();
    expect(screen.queryByText('Onboard amenities')).toBeNull();
  });

  it("says the cruise isn't available for an unknown sailing or an old link", async () => {
    serve({ success: false, error: 'Cruise not found' }, 404);
    show('?sailing=nope');
    expect(await screen.findByText("This cruise isn't available")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all cruises' }).getAttribute('href')).toBe('/cruises');
  });

  it("says the cruise isn't available for a link to the old demo cruises", async () => {
    serve({ success: true, data: SAILING });
    show('?cruiseId=1');
    expect(await screen.findByText("This cruise isn't available")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says so, with the phone number, when the cruise cannot be loaded', async () => {
    serve({ success: false }, 500);
    show(`?sailing=${SAILING.slug}`);
    expect(await screen.findByText("We couldn't load this cruise")).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /\(877\) 538-7380/ })[0].getAttribute('href')).toBe('tel:+18775387380');
  });
});
