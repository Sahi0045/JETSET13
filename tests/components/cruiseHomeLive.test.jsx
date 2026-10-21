import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));

import DestinationSection from '../../frontend/src/Pages/Common/cruise/DestinationSection.jsx';
import CruiseLineSection from '../../frontend/src/Pages/Common/cruise/CruiseLineSection.jsx';
import HeroSection from '../../frontend/src/Pages/Common/cruise/HeroSection.jsx';
import CruiseHomepage from '../../frontend/src/Pages/Common/cruise/Homepage.jsx';
import { officeToday } from '../../frontend/src/Pages/Common/cruise/catalog.js';

const daysAgo = (n) => officeToday(new Date(Date.now() - n * 86400000));
const photo = (name) => ({ url: `https://cdn.example/${name}.jpg`, credit: 'Line' });

const SAILINGS = [
  {
    slug: 'western-caribbean', title: 'Western Caribbean', region: 'caribbean', nights: 7,
    from_price_usd: 849, price_checked_on: daysAgo(1), photo: photo('wc'),
    line_name: 'Royal Caribbean', ship_name: 'Wonder of the Seas',
    port_names: ['Miami', 'Roatán', 'Cozumel'], dates: ['2099-12-05', '2100-01-09'], next_date: '2099-12-05', date_count: 2,
  },
  {
    slug: 'eastern-caribbean', title: 'Eastern Caribbean', region: 'caribbean', nights: 4,
    from_price_usd: 499, price_checked_on: daysAgo(60), photo: null,
    line_name: 'Carnival Cruise Line', ship_name: null,
    port_names: ['Port Canaveral', 'Nassau'], dates: ['2099-11-14'], next_date: '2099-11-14', date_count: 1,
  },
  {
    slug: 'inside-passage', title: 'Inside Passage', region: 'alaska', nights: 10,
    from_price_usd: null, price_checked_on: null, photo: photo('ak'),
    line_name: 'Royal Caribbean', ship_name: 'Ovation of the Seas',
    port_names: ['Seattle', 'Juneau'], dates: ['2100-05-02'], next_date: '2100-05-02', date_count: 1,
  },
];

const serve = (data) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data }) })));

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}?${location.search.slice(1)}`}</p>;
};

const show = (ui, path = '/cruise') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cruise" element={ui} />
        <Route path="/cruises" element={<Where />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

const broken = /undefined|NaN|null/;

afterEach(() => { vi.unstubAllGlobals(); });

describe('the destinations on the cruise home', () => {
  it('shows each region staff have published a sailing in, with its lowest current price', async () => {
    serve(SAILINGS);
    const { container } = show(<DestinationSection />);
    const caribbean = await screen.findByRole('link', { name: /Caribbean/ });
    expect(caribbean.getAttribute('href')).toBe('/cruises?region=caribbean');
    expect(caribbean.textContent).toMatch(/2 sailings/);
    expect(caribbean.textContent).toMatch(/From \$849/);
    expect(caribbean.querySelector('img').getAttribute('src')).toBe('https://cdn.example/wc.jpg');
    const alaska = screen.getByRole('link', { name: /Alaska/ });
    expect(alaska.textContent).toMatch(/1 sailing(?!s)/);
    expect(alaska.textContent).toMatch(/Ask for today's price/);
    expect(container.textContent).not.toMatch(broken);
  });

  it('is left out when nothing is published', async () => {
    serve([]);
    const { container } = show(<DestinationSection />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});

describe('the cruise lines on the cruise home', () => {
  it('shows each line with a published sailing, with its logo when we have one', async () => {
    serve(SAILINGS);
    const { container } = show(<CruiseLineSection />);
    const royal = await screen.findByRole('link', { name: /Royal Caribbean/ });
    expect(royal.getAttribute('href')).toBe('/cruises?line=Royal+Caribbean');
    expect(royal.textContent).toMatch(/2 sailings/);
    expect(container.querySelector('img[alt="Royal Caribbean logo"]').getAttribute('src')).toBe('/images/logos/royal_caribbean.webp');
    expect(screen.getByRole('link', { name: /Carnival Cruise Line/ })).toBeTruthy();
    expect(royal.textContent).toMatch(/per person, port fees included · price checked/);
    expect(container.textContent).not.toMatch(broken);
  });

  it('is left out when nothing is published', async () => {
    serve([]);
    const { container } = show(<CruiseLineSection />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});

describe('the cruise search', () => {
  it('offers only what is published, and searches the list with it', async () => {
    serve(SAILINGS);
    show(<HeroSection />);
    const destination = await screen.findByLabelText('Destination');
    await waitFor(() => expect([...destination.options].map((o) => o.text)).toEqual(['Any destination', 'Alaska', 'Caribbean']));
    expect([...screen.getByLabelText('Cruise line').options].map((o) => o.text)).toEqual(['Any cruise line', 'Carnival Cruise Line', 'Royal Caribbean']);
    expect([...screen.getByLabelText('Month').options].map((o) => o.text)).toEqual(['Any month', 'Nov 2099', 'Dec 2099', 'Jan 2100', 'May 2100']);
    expect([...screen.getByLabelText('Length').options].map((o) => o.text)).toEqual(['Any length', '1 – 5 nights', '6 – 9 nights', '10+ nights']);

    fireEvent.change(destination, { target: { value: 'caribbean' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2099-12' } });
    fireEvent.click(screen.getByRole('button', { name: /Search cruises/i }));
    expect((await screen.findByTestId('where')).textContent).toBe('/cruises?region=caribbean&month=2099-12');
  });

  it('is a cruise search only', async () => {
    serve(SAILINGS);
    show(<HeroSection />);
    await screen.findByLabelText('Destination');
    expect(screen.queryByText('Cruise Type')).toBeNull();
    expect(screen.queryByRole('link', { name: /Flight|Hotels|Packages/ })).toBeNull();
  });
});

describe('the cruise home', () => {
  it('says the team books cruises, with the phone number, instead of a portal that is coming', async () => {
    serve(SAILINGS);
    show(<CruiseHomepage />);
    expect(screen.queryByText(/Coming Soon/i)).toBeNull();
    const banner = await screen.findByText(/Cruises are booked by our team/);
    expect(banner.closest('div').querySelector('a[href="tel:+18775387380"]')).toBeTruthy();
  });
});
