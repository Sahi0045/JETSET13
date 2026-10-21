import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));

import CruiseCards from '../../frontend/src/Pages/Common/cruise/cruise-cards.jsx';
import { officeToday } from '../../frontend/src/Pages/Common/cruise/catalog.js';

const daysAgo = (n) => officeToday(new Date(Date.now() - n * 86400000));
const photo = (name) => ({ url: `https://cdn.example/${name}.jpg`, credit: 'Line' });

const SAILINGS = [
  {
    slug: 'eastern-caribbean', title: 'Eastern Caribbean', region: 'caribbean', nights: 4,
    from_price_usd: 499, price_checked_on: daysAgo(60), photo: null,
    line_name: 'Carnival Cruise Line', ship_name: null,
    port_names: ['Port Canaveral', 'Nassau'], dates: ['2099-11-14'], next_date: '2099-11-14', date_count: 1,
  },
  {
    slug: 'western-caribbean', title: 'Western Caribbean', region: 'caribbean', nights: 7,
    from_price_usd: 849, price_checked_on: daysAgo(1), photo: photo('wc'),
    line_name: 'Royal Caribbean', ship_name: 'Wonder of the Seas',
    port_names: ['Miami', 'Roatán', 'Cozumel'], dates: ['2099-12-05', '2100-01-09', '2100-02-06'], next_date: '2099-12-05', date_count: 3,
  },
  {
    slug: 'inside-passage', title: 'Inside Passage', region: 'alaska', nights: 10,
    from_price_usd: 1299, price_checked_on: daysAgo(3), photo: photo('ak'),
    line_name: 'Royal Caribbean', ship_name: 'Ovation of the Seas',
    port_names: ['Seattle', 'Juneau'], dates: ['2100-05-02'], next_date: '2100-05-02', date_count: 1,
  },
];

const serve = (data, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: status < 400, status, json: async () => (status < 400 ? { success: true, data } : { success: false }),
})));

const Search = () => <p data-testid="search">{useLocation().search}</p>;

const show = (path = '/cruises') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/cruises" element={<><CruiseCards /><Search /></>} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

const titles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

afterEach(() => { vi.unstubAllGlobals(); });

describe('the cruise results', () => {
  it('shows one card per published sailing, with its route, next date and price', async () => {
    serve(SAILINGS);
    show();
    await waitFor(() => expect(titles()).toEqual(['Eastern Caribbean', 'Western Caribbean', 'Inside Passage']));
    const card = screen.getByRole('heading', { name: 'Western Caribbean' }).closest('article');
    expect(card.textContent).toMatch(/Royal Caribbean · Wonder of the Seas/);
    expect(card.textContent).toMatch(/7 nights/);
    expect(card.textContent).toMatch(/Miami → Roatán → Cozumel/);
    expect(card.textContent).toMatch(/Next sailing 5 Dec 2099 · 2 more dates/);
    expect(card.textContent).toMatch(/From \$849/);
    expect(card.textContent).toMatch(/per person, port fees included · price checked/);
    expect(within(card).getByRole('link', { name: /View itinerary/ }).getAttribute('href')).toBe('/itinerary?sailing=western-caribbean');
    expect(card.querySelector('img').getAttribute('src')).toBe('https://cdn.example/wc.jpg');
    expect(screen.getByText('3 sailings')).toBeTruthy();
  });

  it("asks for today's price when the price is old", async () => {
    serve(SAILINGS);
    show();
    const card = (await screen.findByRole('heading', { name: 'Eastern Caribbean' })).closest('article');
    expect(card.textContent).toMatch(/Ask for today's price/);
    expect(card.textContent).not.toMatch(/\$499/);
  });

  it('reads the search from the address bar', async () => {
    serve(SAILINGS);
    show('/cruises?region=caribbean&month=2100-01');
    await waitFor(() => expect(titles()).toEqual(['Western Caribbean']));
    expect(screen.getByLabelText('Destination').value).toBe('caribbean');
    expect(screen.getByLabelText('Month').value).toBe('2100-01');
  });

  it('still understands the cruise line links older pages made', async () => {
    serve(SAILINGS);
    show('/cruises?cruiseLine=Carnival%20Cruise%20Line');
    await waitFor(() => expect(titles()).toEqual(['Eastern Caribbean']));
  });

  it('narrows the list and the address as filters are chosen', async () => {
    serve(SAILINGS);
    show();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText('Cruise line'), { target: { value: 'Royal Caribbean' } });
    await waitFor(() => expect(titles()).toEqual(['Western Caribbean', 'Inside Passage']));
    expect(screen.getByTestId('search').textContent).toBe('?line=Royal+Caribbean');
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: '10+' } });
    await waitFor(() => expect(titles()).toEqual(['Inside Passage']));
  });

  it('sorts by price with the unpriced sailings last', async () => {
    serve(SAILINGS);
    show();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price' } });
    await waitFor(() => expect(titles()).toEqual(['Western Caribbean', 'Inside Passage', 'Eastern Caribbean']));
  });

  it('offers to clear a search that matches nothing', async () => {
    serve(SAILINGS);
    show('/cruises?region=alaska&length=1-5');
    expect(await screen.findByText('No cruises match your search')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(titles()).toHaveLength(3));
  });

  it('says so, with the phone number, when nothing is listed', async () => {
    serve([]);
    show();
    expect(await screen.findByText('No sailings are listed right now')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /\(877\) 538-7380/ })[0].getAttribute('href')).toBe('tel:+18775387380');
  });

  it('says so when the list cannot be read, and shows no sample cruises', async () => {
    serve(null, 500);
    show();
    expect(await screen.findByText("We couldn't load the sailings")).toBeTruthy();
    expect(screen.queryByText(/sample/i)).toBeNull();
    expect(titles()).toEqual([]);
  });
});
