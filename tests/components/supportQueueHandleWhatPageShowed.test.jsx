import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');

/**
 * "Mark as handled" on the desk says which entry it showed.
 *
 * The page never polls, and the server wrote a press over whatever the
 * booking needed at that moment: a second member still looking at "Refund to
 * claim from the airline" after the claim was handled recorded the claim again
 * as the refused refund's resolution. The server now refuses an entry the
 * booking no longer shows (tests/backend/deskHandleWhatPageShowed.test.js),
 * and it can only do that if the desk tells it which one it showed.
 */

const claim = {
  id: 'b-claim',
  bookingReference: 'FLT123',
  type: 'flight',
  service: 'JFK→LHR',
  status: 'cancelled',
  paymentStatus: 'paid',
  totalAmount: 291,
  bookingDate: '2026-09-22T09:00:00Z',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '',
  pnr: 'ABC123',
  ticketed: true,
  ticketNumbers: ['108-2412345671'],
  attention: {
    kind: 'airline_refund',
    reason: 'the refund did not go through (REFUND_FAILED): nothing has gone back to the customer; tickets could not be voided; airline refund must be claimed',
    since: '2026-09-22T10:00:00.000Z',
    tickets: ['108-2412345671'],
  },
  reviewResolution: null,
  commitUnknown: false,
  bookingDetails: {},
};

const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => 'application/json' },
});

const press = async (booking, answer) => {
  const fetchMock = vi.fn(async (url, options) => (options?.method === 'POST'
    ? answer
    : reply({ success: true, data: [booking] })));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={['/desk']}>
      <Routes>
        <Route path="/desk" element={<SupportQueue />} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('button', { name: /Mark as handled/ }));
  fireEvent.change(screen.getByLabelText('What you did'), { target: { value: 'Claimed the ticket from the airline.' } });
  fireEvent.click(screen.getAllByRole('button', { name: /Mark as handled/ }).pop());
  await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true));
  return fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
};

afterEach(() => vi.unstubAllGlobals());

describe('Mark as handled on the desk', () => {
  it('says which entry the page showed: its kind and its time', async () => {
    const [url, options] = await press(claim, reply({ success: true, message: 'Marked as handled' }));

    const sent = new URL(url, 'http://desk.test');
    expect(sent.pathname).toMatch(/admin-bookings\/b-claim\/resolve-review$/);
    expect(sent.searchParams.get('shownKind')).toBe('airline_refund');
    expect(sent.searchParams.get('shownSince')).toBe('2026-09-22T10:00:00.000Z');
    // The body is what it was: the note (and a commit's answer), nothing else.
    expect(JSON.parse(options.body)).toEqual({ note: 'Claimed the ticket from the airline.' });
  });

  it('an entry with no time sends an empty one, so the server matches it on its kind', async () => {
    const unflagged = { ...claim, status: 'pending_ticketing', attention: { kind: 'not_ticketed', reason: 'PNR committed, never ticketed', since: null } };
    const [url] = await press(unflagged, reply({ success: true, message: 'Marked as handled' }));

    const sent = new URL(url, 'http://desk.test');
    expect(sent.searchParams.get('shownKind')).toBe('not_ticketed');
    expect(sent.searchParams.get('shownSince')).toBe('');
  });

  it('shows why when the booking changed since the page loaded', async () => {
    const text = 'This booking changed since your page showed it: it now reads "Refund did not go through". '
      + 'Nothing has been recorded; reload the page to see what it needs now.';
    await press(claim, reply({ success: false, code: 'BOOKING_CHANGED', error: text, message: text }, 409));

    expect(await screen.findByText(text)).toBeTruthy();
  });
});
