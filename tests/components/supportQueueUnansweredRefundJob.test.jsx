import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');

/**
 * One desk entry, two jobs, when the customer refund under an airline claim
 * was sent to ARC Pay and never answered
 * (tests/backend/deskUnansweredRefundAndClaimTwoJobs.test.js writes the row).
 *
 * A claim note closed that refund: it may never have gone back, and nobody
 * was asked to check ARC Pay. The entry offers the two jobs apart, and
 * "Customer refund handled" on it says to check ARC Pay first - the refund
 * may already have gone back.
 */

const cancelledAt = '2026-09-22T10:00:00.000Z';

const entry = (cancellation) => ({
  id: 'b-unk',
  bookingReference: 'FLTUNK9',
  type: 'flight',
  service: 'JFK→LHR',
  status: 'cancelled',
  paymentStatus: 'paid',
  totalAmount: 291,
  bookingDate: '2026-09-22T09:00:00Z',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '',
  pnr: 'UNK123',
  ticketed: true,
  ticketNumbers: ['108-2412345671'],
  attention: {
    kind: 'airline_refund',
    reason: 'refund request did not complete: socket hang up; tickets could not be voided; airline refund must be claimed',
    since: cancelledAt,
    tickets: ['108-2412345671'],
    jobs: ['refund', 'claim'],
  },
  reviewResolution: null,
  commitUnknown: false,
  bookingDetails: {
    pnr: 'UNK123',
    arc_captured_amount: 291,
    cancellation: {
      cancelledAt, paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 50, netRefund: 0, currency: 'USD',
      basis: 'refundable fare; tickets refunded through the airline', ...cancellation,
    },
    needs_review: {
      reason: 'refund request did not complete: socket hang up; tickets could not be voided; airline refund must be claimed',
      source: 'cancellation', at: cancelledAt, tickets: ['108-2412345671'],
    },
  },
});

const unanswered = entry({ reversalOutcomeUnknown: true, unansweredRefund: { amount: 241, currency: 'USD', at: cancelledAt, refundedBefore: 0 } });
const refused = entry({ paymentAction: 'REFUND_FAILED' });

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
  await screen.findByText('FLTUNK9');
  return fetchMock;
};

const openJob = (button) => {
  fireEvent.click(screen.getByRole('button', { name: button }));
  return screen.getByRole('dialog');
};

afterEach(() => vi.unstubAllGlobals());

describe('an unanswered customer refund under an airline claim', () => {
  it('offers the two jobs apart, and no single "Mark as handled"', async () => {
    await listed(unanswered);
    expect(screen.getByRole('button', { name: 'Customer refund handled' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Airline claim handled' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark as handled/ })).toBeNull();
  });

  it('"Customer refund handled" says to check ARC Pay first, and the press says which job', async () => {
    const fetchMock = await listed(unanswered);
    const dialog = openJob('Customer refund handled');
    expect(dialog.textContent, 'nothing said the refund may already have gone back').toMatch(/never answered/);
    expect(dialog.textContent).toMatch(/Check ARC Pay/);
    expect(dialog.textContent).toMatch(/claim from the airline stays open/);

    fireEvent.change(within(dialog).getByLabelText('What you did'), { target: { value: 'ARC portal shows the 241 went back.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Customer refund handled' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true));
    const [, options] = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(options.body)).toEqual({ note: 'ARC portal shows the 241 went back.', job: 'refund' });
  });
});

describe('beside it', () => {
  it('a refund ARC Pay refused keeps its own words: nothing about a refund never answered', async () => {
    await listed(refused);
    const dialog = openJob('Customer refund handled');
    expect(dialog.textContent).not.toMatch(/never answered/);
    expect(dialog.textContent).toMatch(/claim from the airline stays open/);
  });

  it('"Airline claim handled" says the customer\'s refund stays on the list', async () => {
    await listed(unanswered);
    const dialog = openJob('Airline claim handled');
    expect(dialog.textContent).toMatch(/customer's refund stays on the list/);
  });
});
