import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');
const { default: StaffRoute } = await import('../../frontend/src/components/StaffRoute.jsx');

/**
 * The support desk page.
 *
 * What a support person has to see to do anything: which bookings need them,
 * why, the PNR and the ticket numbers - none of which the admin panel showed -
 * and a way to record that they dealt with one.
 */

const flagged = {
  id: 'b1',
  bookingReference: 'FLTHELD9',
  type: 'flight',
  service: 'JFK→LHR',
  status: 'confirmed',
  paymentStatus: 'paid',
  totalAmount: 291,
  bookingDate: '2026-09-17T10:00:00Z',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  pnr: 'HELD42',
  ticketed: false,
  ticketNumbers: [],
  attention: { kind: 'review', reason: 'chain failed after commit at issueTicket', since: '2026-09-17T10:01:00Z' },
  reviewResolution: null,
  bookingDetails: { pnr: 'HELD42' },
};

const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => 'application/json' },
});

const renderQueue = () => render(
  <MemoryRouter initialEntries={['/desk']}>
    <Routes>
      <Route path="/desk" element={<SupportQueue />} />
      <Route path="/desk/login" element={<p>support sign in</p>} />
    </Routes>
  </MemoryRouter>
);

afterEach(() => {
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* blocked storage */ }
});

describe('the queue', () => {
  it('opens on what needs a person, and says why, with the PNR', async () => {
    const fetchMock = vi.fn(async () => reply({ success: true, data: [flagged] }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTHELD9/));
    expect(fetchMock.mock.calls[0][0]).toMatch(/attention=open/);
    expect(container.textContent).toMatch(/Flagged for review/);
    expect(container.textContent).toMatch(/chain failed after commit at issueTicket/);
    expect(container.textContent).toMatch(/HELD42/);
    expect(container.textContent).toMatch(/Jane Doe/);
  });

  it('records what the person did, and asks for a note first', async () => {
    const fetchMock = vi.fn(async (url, options) => (options?.method === 'POST'
      ? reply({ success: true, message: 'Marked as handled' })
      : reply({ success: true, data: [flagged] })));
    vi.stubGlobal('fetch', fetchMock);

    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: /Mark as handled/ }));

    // Nothing to record yet: the button stays disabled until there is a note.
    const confirm = screen.getAllByRole('button', { name: /Mark as handled/ }).pop();
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('What you did'), { target: { value: 'Ticketed by hand, 220-7491175310.' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Mark as handled/ }).pop());

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
      expect(post[0]).toMatch(/admin-bookings\/b1\/resolve-review/);
      expect(JSON.parse(post[1].body)).toEqual({ note: 'Ticketed by hand, 220-7491175310.' });
    });
  });

  it('offers the money actions on the booking itself, not a link into the admin panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ success: true, data: [flagged] })));
    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTHELD9/));
    expect(screen.getByRole('button', { name: /Cancel & refund/ })).toBeTruthy();
    expect(container.querySelector('a[href*="/admin"]')).toBeNull();
  });

  it('says so when nothing needs attention', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ success: true, data: [] })));
    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/Nothing needs attention/));
  });
});

describe('the owner\'s own tab', () => {
  it('is where the invite box lives, not under every booking in the queue', async () => {
    // The box used to sit below the list: with nine bookings flagged, the
    // owner scrolled past all of them and reported it as missing.
    localStorage.setItem('adminUser', JSON.stringify({ role: 'admin' }));
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('staff')
      ? reply({ success: true, data: [{ id: 's1', email: 'desk@jetsetterss.com', status: 'invited' }] })
      : reply({ success: true, data: [flagged] }))));

    const { container } = renderQueue();

    const tab = await screen.findByRole('button', { name: /Support accounts/ });
    expect(container.textContent).not.toMatch(/Send invitation/);

    fireEvent.click(tab);

    expect(await screen.findByRole('button', { name: /Send invitation/ })).toBeTruthy();
    expect(screen.getByLabelText('Email to invite')).toBeTruthy();
    // The queue's bookings are not under it.
    expect(container.textContent).not.toMatch(/FLTHELD9/);
    expect(container.textContent).toMatch(/desk@jetsetterss.com/);
  });

  it('is not offered to a support account', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ role: 'support' }));
    vi.stubGlobal('fetch', vi.fn(async () => reply({ success: true, data: [flagged] })));

    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTHELD9/));
    expect(screen.queryByRole('button', { name: /Support accounts/ })).toBeNull();
  });
});

describe('the gate', () => {
  const renderGate = () => render(
    <MemoryRouter initialEntries={['/desk']}>
      <Routes>
        <Route path="/desk" element={<StaffRoute><p>the desk</p></StaffRoute>} />
        <Route path="/desk/login" element={<p>support sign in</p>} />
      </Routes>
    </MemoryRouter>
  );

  it('sends a signed-out person to the support sign-in, not the admin one', () => {
    const { container } = renderGate();
    expect(container.textContent).toMatch(/support sign in/);
  });

  it('lets a support account through', () => {
    localStorage.setItem('adminUser', JSON.stringify({ role: 'support' }));
    const { container } = renderGate();
    expect(container.textContent).toMatch(/the desk/);
  });

  it('lets an admin through too', () => {
    localStorage.setItem('adminUser', JSON.stringify({ role: 'admin' }));
    const { container } = renderGate();
    expect(container.textContent).toMatch(/the desk/);
  });

  it('keeps a customer out', () => {
    localStorage.setItem('adminUser', JSON.stringify({ role: 'user' }));
    const { container } = renderGate();
    expect(container.textContent).toMatch(/support sign in/);
  });
});
