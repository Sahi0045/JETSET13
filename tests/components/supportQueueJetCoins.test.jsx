import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');

/**
 * The desk and a booking's Jet Coins: what it used and got back, a problem the
 * server left, and the action that returns the rest.
 */

const booking = (over = {}) => ({
  id: 'b1',
  bookingReference: 'FLTCOIN1',
  type: 'flight',
  service: 'JFK→LHR',
  status: 'cancelled',
  paymentStatus: 'refunded',
  totalAmount: 72.2,
  bookingDate: '2026-10-11T10:00:00Z',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '',
  pnr: 'ABC123',
  ticketed: false,
  ticketNumbers: [],
  attention: null,
  reviewResolution: null,
  bookingDetails: {},
  walletCoins: 5000,
  walletCoinsReturned: 0,
  walletIssue: null,
  ...over,
});

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

const deskServing = (rows, answer) => vi.fn(async (url, options) => (options?.method === 'POST' ? answer(url, options) : reply({ success: true, data: rows })));

afterEach(() => {
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* blocked storage */ }
});

describe('the Jet Coins on a booking row', () => {
  it('shows the coins used and how many went back', async () => {
    vi.stubGlobal('fetch', deskServing([booking({ walletCoinsReturned: 3000 })]));
    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTCOIN1/));
    expect(container.textContent).toMatch(/5,000 Jet Coins used/);
    expect(container.textContent).toMatch(/3,000 returned/);
  });

  it('says nothing about coins on a booking that used none', async () => {
    vi.stubGlobal('fetch', deskServing([booking({ walletCoins: 0 })]));
    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTCOIN1/));
    expect(container.textContent).not.toMatch(/Jet Coins/);
    expect(screen.queryByRole('button', { name: /Return Jet Coins/ })).toBeNull();
  });

  it('says plainly when the order route could not capture or give back the coins', async () => {
    vi.stubGlobal('fetch', deskServing([
      booking({ id: 'b1', bookingReference: 'FLTCAP', walletIssue: { kind: 'capture_failed', coins: 5000, status: 'error' } }),
      booking({ id: 'b2', bookingReference: 'FLTRET', walletIssue: { kind: 'return_failed', coins: 5000, reason: 'void' } }),
    ]));
    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTRET/));
    expect(container.textContent).toMatch(/Jet Coins: could not be captured \(5,000 coins\)/);
    expect(container.textContent).toMatch(/Jet Coins: could not be returned \(5,000 coins\)/);
  });
});

describe('Return Jet Coins', () => {
  it('is offered only while coins are still out', async () => {
    vi.stubGlobal('fetch', deskServing([
      booking({ id: 'b1', bookingReference: 'FLTOUT', walletCoinsReturned: 0 }),
      booking({ id: 'b2', bookingReference: 'FLTDONE', walletCoinsReturned: 5000 }),
    ]));
    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTDONE/));
    expect(screen.getAllByRole('button', { name: /Return Jet Coins/ })).toHaveLength(1);
  });

  it('starts from the coins not yet returned and shows what they are worth', async () => {
    vi.stubGlobal('fetch', deskServing([booking({ walletCoinsReturned: 3000 })]));
    renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /Return Jet Coins/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Jet Coins to return').value).toBe('2000');
    expect(dialog.textContent).toMatch(/20 USD/);
  });

  it('sends the booking, the coins and the reason, and shows the coins the server returned', async () => {
    const post = vi.fn(() => reply({ success: true, data: { coins: 2000 }, message: '2,000 Jet Coins returned' }));
    const fetchMock = deskServing([booking({ walletCoinsReturned: 3000 })], post);
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /Return Jet Coins/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Jet Coins to return'), { target: { value: '1500' } });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Goodwill after a delay' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(container.textContent).toMatch(/FLTCOIN1: 2,000 Jet Coins returned/));
    const [url, options] = post.mock.calls[0];
    expect(url).toMatch(/wallet\/staff-return/);
    expect(JSON.parse(options.body)).toEqual({ bookingReference: 'FLTCOIN1', coins: 1500, reason: 'Goodwill after a delay' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cannot be pressed twice while the request is in flight', async () => {
    let finish;
    const post = vi.fn(() => new Promise((resolve) => { finish = () => resolve(reply({ success: true, data: { coins: 5000 }, message: '5,000 Jet Coins returned' })); }));
    vi.stubGlobal('fetch', deskServing([booking()], post));
    renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /Return Jet Coins/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    const working = await within(dialog).findByRole('button', { name: /Working/ });
    expect(working.disabled).toBe(true);
    fireEvent.click(working);
    expect(post).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not send a number of coins that is not at least one', async () => {
    const post = vi.fn(() => reply({ success: true, data: { coins: 0 }, message: '0 Jet Coins returned' }));
    vi.stubGlobal('fetch', deskServing([booking()], post));
    renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /Return Jet Coins/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Jet Coins to return'), { target: { value: '0' } });

    expect(within(dialog).getByRole('button', { name: 'Confirm' }).disabled).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the server\'s warning when the earned coins could not be taken back', async () => {
    const message = '5,000 Jet Coins returned, but the coins earned on this booking could not be taken back. Check the booking before telling the customer.';
    vi.stubGlobal('fetch', deskServing([booking()], () => reply({ success: true, data: { coins: 5000, earnedReversed: false }, message })));
    const { container } = renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /Return Jet Coins/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(container.textContent).toMatch(/could not be taken back/));
  });

  it('says so when nothing was left to return', async () => {
    vi.stubGlobal('fetch', deskServing([booking()], () => reply({ success: true, data: { coins: 0 }, message: '0 Jet Coins returned' })));
    const { container } = renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /Return Jet Coins/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(container.textContent).toMatch(/0 Jet Coins returned.*nothing could be returned/));
  });
});
