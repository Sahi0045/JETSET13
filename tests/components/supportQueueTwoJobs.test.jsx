import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');

/**
 * One desk entry, two jobs: a customer refund ARC Pay refused, under a claim
 * from the airline. One "Mark as handled" closed the claim whatever the note
 * said, so a refund note closed a claim nobody made. The entry offers the two
 * jobs apart, and a press says which one it handled
 * (tests/backend/deskRefusedRefundAndClaimTwoJobs.test.js).
 */

const combined = {
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
    jobs: ['refund', 'claim'],
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

const listed = async (booking) => {
  const fetchMock = vi.fn(async (_url, options) => (options?.method === 'POST'
    ? reply({ success: true, message: 'done' })
    : reply({ success: true, data: [booking] })));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={['/desk']}>
      <Routes>
        <Route path="/desk" element={<SupportQueue />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('FLT123');
  return fetchMock;
};

const pressJob = async (fetchMock, button, note) => {
  fireEvent.click(screen.getByRole('button', { name: button }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('What you did'), { target: { value: note } });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true));
  const [url, options] = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
  return { dialog, sent: new URL(url, 'http://desk.test'), body: JSON.parse(options.body) };
};

afterEach(() => vi.unstubAllGlobals());

describe('an entry that is two jobs', () => {
  it('offers them apart, and no single "Mark as handled"', async () => {
    await listed(combined);
    expect(screen.getByRole('button', { name: 'Customer refund handled' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Airline claim handled' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark as handled/ }), 'one press closed whichever job').toBeNull();
  });

  it('"Customer refund handled" says so, with what the page showed', async () => {
    const fetchMock = await listed(combined);
    const { dialog, sent, body } = await pressJob(fetchMock, 'Customer refund handled', 'Refunded 241 in the ARC portal.');
    expect(dialog.textContent).toMatch(/claim from the airline stays open/);
    expect(sent.pathname).toMatch(/admin-bookings\/b-claim\/resolve-review$/);
    expect(sent.searchParams.get('shownKind')).toBe('airline_refund');
    expect(body).toEqual({ note: 'Refunded 241 in the ARC portal.', job: 'refund' });
  });

  it('"Airline claim handled" says so', async () => {
    const fetchMock = await listed(combined);
    const { body } = await pressJob(fetchMock, 'Airline claim handled', 'Claimed 108-2412345671 from the airline.');
    expect(body).toEqual({ note: 'Claimed 108-2412345671 from the airline.', job: 'claim' });
  });
});

describe('beside it', () => {
  it('an entry that is one job keeps its one "Mark as handled", and names no job', async () => {
    const { jobs: _jobs, ...claimOnly } = combined.attention;
    const fetchMock = await listed({ ...combined, attention: { ...claimOnly, reason: 'tickets could not be voided; airline refund must be claimed' } });
    expect(screen.queryByRole('button', { name: 'Customer refund handled' })).toBeNull();
    const { body } = await pressJob(fetchMock, 'Mark as handled', 'Claimed it.');
    expect(body).toEqual({ note: 'Claimed it.' });
  });
});
