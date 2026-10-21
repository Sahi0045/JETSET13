import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminFetch = vi.fn();
vi.mock('../../frontend/src/utils/adminAuth', () => ({
  adminFetch: (...a) => adminFetch(...a),
  readAdminResponse: async (response) => response.json(),
}));
vi.mock('../../frontend/src/Pages/Admin/shell/RefreshContext', () => ({ useRegisterRefresh: () => {} }));
vi.mock('../../frontend/src/lib/supabase', () => ({
  default: { storage: { from: () => ({ uploadToSignedUrl: vi.fn(async () => ({ error: null })) }) } },
}));

import CruiseCatalog from '../../frontend/src/Pages/Admin/CruiseCatalog.jsx';
import CruiseSailingEdit from '../../frontend/src/Pages/Admin/CruiseSailingEdit.jsx';

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const officeDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

const lists = (url) => {
  if (url.includes('/admin/lines')) return answer({ success: true, data: [{ id: 'line-1', name: 'Royal Caribbean' }] });
  if (url.includes('/admin/ships')) return answer({ success: true, data: [] });
  if (url.includes('/admin/ports')) return answer({ success: true, data: [
    { id: 'miami', name: 'Miami', country: 'United States', lat: 25.77, lon: -80.17 },
    { id: 'nassau', name: 'Nassau', country: 'Bahamas', lat: 25.08, lon: -77.35 },
  ] });
  return null;
};

const renderEditor = () => render(
  <MemoryRouter initialEntries={['/admin/cruises/new']}>
    <Routes>
      <Route path="/admin/cruises/:id" element={<CruiseSailingEdit />} />
      <Route path="/admin/cruises" element={<p>catalog</p>} />
    </Routes>
  </MemoryRouter>,
);

describe('the sailing editor', () => {
  beforeEach(() => {
    adminFetch.mockReset();
    adminFetch.mockImplementation(async (url) => lists(url) ?? answer({ success: true, data: [] }));
  });

  it('shows the all-in price note', async () => {
    renderEditor();
    expect(await screen.findByText('All-in per person: fare plus port fees, taxes and every mandatory fee (California SB 478).')).toBeTruthy();
  });

  it('has one day row per day', async () => {
    renderEditor();
    const nights = await screen.findByLabelText('Nights');
    fireEvent.change(nights, { target: { value: '7' } });
    expect(screen.getAllByTestId('day-row')).toHaveLength(8);
    fireEvent.change(nights, { target: { value: '3' } });
    expect(screen.getAllByTestId('day-row')).toHaveLength(4);
  });

  it("shows the server's message when a save is refused", async () => {
    adminFetch.mockImplementation(async (url, options = {}) => {
      if (options.method === 'POST' && url.includes('/admin/sailings')) {
        return answer({ success: false, error: 'To publish, add at least one sailing date from today on.' }, 400);
      }
      return lists(url) ?? answer({ success: true, data: [] });
    });
    renderEditor();
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Western Caribbean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('To publish, add at least one sailing date from today on.')).toBeTruthy();
  });

  it('sends the days in the shape the server reads', async () => {
    adminFetch.mockImplementation(async (url, options = {}) => {
      if (options.method === 'POST' && url.includes('/admin/sailings')) return answer({ success: true, data: { id: 's1', slug: 'x' } });
      return lists(url) ?? answer({ success: true, data: [] });
    });
    renderEditor();
    fireEvent.change(await screen.findByLabelText('Nights'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminFetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true));
    const [, options] = adminFetch.mock.calls.find(([, o]) => o?.method === 'POST');
    const sent = JSON.parse(options.body);
    expect(sent.nights).toBe(1);
    expect(sent.days).toEqual([
      { day: 1, portId: null, arrive: null, depart: null },
      { day: 2, portId: null, arrive: null, depart: null },
    ]);
  });
});

describe('the sailing editor keeps what staff typed', () => {
  beforeEach(() => {
    adminFetch.mockReset();
    adminFetch.mockImplementation(async (url, options = {}) => {
      if (options.method === 'POST') return answer({ success: true, data: { id: 's1', slug: 'x' } });
      return lists(url) ?? answer({ success: true, data: [] });
    });
  });

  it('keeps typed ports when Nights is changed through a smaller number', async () => {
    renderEditor();
    const nights = await screen.findByLabelText('Nights');
    await screen.findAllByRole('option', { name: 'Nassau, Bahamas' });
    fireEvent.change(nights, { target: { value: '3' } });
    const ports = () => screen.getAllByLabelText('Port');
    fireEvent.change(ports()[0], { target: { value: 'miami' } });
    fireEvent.change(ports()[2], { target: { value: 'nassau' } });
    fireEvent.change(nights, { target: { value: '1' } });
    fireEvent.change(nights, { target: { value: '10' } });
    expect(screen.getAllByTestId('day-row')).toHaveLength(11);
    expect(ports()[0].value).toBe('miami');
    expect(ports()[2].value).toBe('nassau');
  });

  it('sends a price exactly as typed, so the server can refuse what it cannot read', async () => {
    renderEditor();
    fireEvent.change(await screen.findByLabelText('From price per person (USD)'), { target: { value: '1,299' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminFetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true));
    const [, options] = adminFetch.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(options.body).fromPriceUsd).toBe('1,299');
  });
});

describe('the ports tab', () => {
  beforeEach(() => { adminFetch.mockReset(); });

  const portsTab = async () => {
    render(<MemoryRouter><CruiseCatalog /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('tab', { name: 'Ports' }));
  };

  it('fills the form from a search result so staff can check it before adding', async () => {
    adminFetch.mockImplementation(async (url, options = {}) => {
      if (url.includes('port-search')) return answer({ success: true, data: [{ name: 'Napoli', country: 'Italy', unlocode: 'ITNAP', lat: 40.84, lon: 14.25 }] });
      if (options.method === 'POST') return answer({ success: true, data: { id: 'p1', name: 'Naples' } });
      return answer({ success: true, data: [] });
    });
    await portsTab();
    fireEvent.change(screen.getByLabelText('Search 1,600 ports by name'), { target: { value: 'napoli' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use' }));
    expect(adminFetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    expect(screen.getByLabelText('Port name').value).toBe('Napoli');
    fireEvent.change(screen.getByLabelText('Port name'), { target: { value: 'Naples' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add port' }));
    await waitFor(() => expect(adminFetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true));
    const [, options] = adminFetch.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(options.body)).toMatchObject({ name: 'Naples', country: 'Italy', lat: '40.84', lon: '14.25', unlocode: 'ITNAP' });
  });

  it('edits a port in place', async () => {
    adminFetch.mockImplementation(async (url, options = {}) => {
      if (options.method === 'PUT') return answer({ success: true, data: { id: 'cozumel', name: 'Cozumel' } });
      if (url.includes('/admin/ports')) return answer({ success: true, data: [{ id: 'cozumel', name: 'Cozumel', country: 'Mexico', lat: 20.5, lon: -86.9 }] });
      return answer({ success: true, data: [] });
    });
    await portsTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Cozumel' }));
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-86.97' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save port' }));
    await waitFor(() => expect(adminFetch.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(true));
    const [url, options] = adminFetch.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(url).toMatch(/\/admin\/ports\/cozumel$/);
    expect(JSON.parse(options.body)).toMatchObject({ name: 'Cozumel', lon: '-86.97' });
  });
});

describe('the catalog list', () => {
  beforeEach(() => { adminFetch.mockReset(); });

  it('flags an old price in the list', async () => {
    adminFetch.mockImplementation(async (url) => (url.includes('/admin/sailings')
      ? answer({ success: true, data: [
        { id: 's1', slug: 'old', title: 'Old price', region: 'caribbean', line_name: 'X', nights: 7, status: 'published', from_price_usd: 849, price_checked_on: officeDay(Date.now() - 31 * 86400000), next_date: '2099-01-01' },
        { id: 's2', slug: 'new', title: 'Fresh price', region: 'alaska', line_name: 'X', nights: 7, status: 'draft', from_price_usd: 999, price_checked_on: officeDay(Date.now()), next_date: null },
      ] })
      : answer({ success: true, data: [] })));
    render(<MemoryRouter><CruiseCatalog /></MemoryRouter>);
    expect(await screen.findByText('Old price')).toBeTruthy();
    expect(screen.getAllByText('Price over 30 days old')).toHaveLength(1);
  });
});
