import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');

/**
 * "Mark as handled" on a booking whose airline commit never answered.
 *
 * The desk rings the airline to find out whether it holds the booking, and
 * the server now asks for that answer (tests/backend/commitUnknownDeskResolution.test.js):
 * not held, or held under a record locator, which goes on the booking. The
 * dialog asked only "what you did", so the locator the airline gave was typed
 * into a note and written nowhere the booking could use it.
 */

const commitUnknown = {
  id: 'b-unk',
  bookingReference: 'FLTUNK1',
  type: 'flight',
  service: 'JFK→LHR',
  status: 'pending',
  paymentStatus: 'paid',
  totalAmount: 291,
  bookingDate: '2026-09-17T10:00:00Z',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '',
  pnr: null,
  ticketed: false,
  ticketNumbers: [],
  attention: { kind: 'review', reason: 'chain failed after commit at commit', since: '2026-09-17T10:01:00Z' },
  reviewResolution: null,
  commitUnknown: true,
  bookingDetails: {},
};

const flagged = {
  ...commitUnknown,
  id: 'b1',
  bookingReference: 'FLTHELD9',
  pnr: 'HELD42',
  status: 'pending_ticketing',
  attention: { kind: 'review', reason: 'chain failed after commit at issueTicket', since: '2026-09-17T10:01:00Z' },
  commitUnknown: false,
  bookingDetails: { pnr: 'HELD42' },
};

const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => 'application/json' },
});

const openDialog = async (booking) => {
  const fetchMock = vi.fn(async (url, options) => (options?.method === 'POST'
    ? reply({ success: true, message: 'done' })
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
  fireEvent.change(screen.getByLabelText('What you did'), { target: { value: 'Rang the airline.' } });
  return fetchMock;
};

const confirmButton = () => screen.getAllByRole('button', { name: /Mark as handled/ }).pop();
const posted = (fetchMock) => {
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
  return post && JSON.parse(post[1].body);
};

afterEach(() => vi.unstubAllGlobals());

describe('a commit that never answered', () => {
  it('asks what the airline said before it can be marked', async () => {
    await openDialog(commitUnknown);

    expect(screen.getByLabelText(/does not hold this booking/)).toBeTruthy();
    expect(screen.getByLabelText(/holds this booking/)).toBeTruthy();
    // A note alone is not an answer.
    expect(confirmButton().disabled).toBe(true);
  });

  it('not held: sends that answer with the note', async () => {
    const fetchMock = await openDialog(commitUnknown);

    fireEvent.click(screen.getByLabelText(/does not hold this booking/));
    fireEvent.click(confirmButton());

    await waitFor(() => expect(posted(fetchMock)).toEqual({ note: 'Rang the airline.', outcome: 'not_held' }));
    expect(fetchMock.mock.calls.find(([, o]) => o?.method === 'POST')[0]).toMatch(/admin-bookings\/b-unk\/resolve-review/);
  });

  it('held: asks for the record locator, and sends it', async () => {
    const fetchMock = await openDialog(commitUnknown);

    fireEvent.click(screen.getByLabelText(/^The airline holds this booking/));
    const locator = screen.getByLabelText('Record locator');
    fireEvent.change(locator, { target: { value: 'abc12' } });
    // Not six letters and digits yet.
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(locator, { target: { value: 'abc123' } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(posted(fetchMock)).toEqual({ note: 'Rang the airline.', outcome: 'held', pnr: 'ABC123' }));
  });

  it('cancelled or refunded since: "held" is not offered', async () => {
    await openDialog({ ...commitUnknown, status: 'cancelled', paymentStatus: 'refunded' });

    expect(screen.getByLabelText(/does not hold this booking/)).toBeTruthy();
    expect(screen.queryByLabelText(/^The airline holds this booking/)).toBeNull();
  });
});

// Fence: every other flag is marked exactly as before.
describe('any other flag', () => {
  it('asks for nothing but the note, and sends only the note', async () => {
    const fetchMock = await openDialog(flagged);

    expect(screen.queryByLabelText(/does not hold this booking/)).toBeNull();
    expect(screen.queryByLabelText('Record locator')).toBeNull();
    fireEvent.click(confirmButton());

    await waitFor(() => expect(posted(fetchMock)).toEqual({ note: 'Rang the airline.' }));
  });
});
