import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Finish refund on a cancel whose refund was sent to ARC Pay and never
 * answered, where the cancel decided 241 goes back and the 50 fee is kept
 * (tests/backend/unknownRefundDecided.test.js writes the row).
 *
 * The desk filled in the whole 291, and if the refund never landed ARC holds
 * 291: one press sent the fee back too.
 *
 * Nor is the decided 241 filled in before Check ARC Pay has run: on a fare
 * under twice the fee, the decided amount fits under what ARC still holds
 * after the cancel's own refund landed, and one press sent it again. The box
 * starts empty, and the decided amount is offered once ARC Pay has been asked
 * and shows nothing returned.
 */

const adminFetch = vi.fn();
const readAdminResponse = vi.fn();

vi.mock('../../frontend/src/utils/adminAuth', () => ({
  adminFetch: (...args) => adminFetch(...args),
  readAdminResponse: (...args) => readAdminResponse(...args),
}));
vi.mock('../../frontend/src/Pages/Admin/shell/RefreshContext', () => ({ useRegisterRefresh: () => {} }));
vi.mock('../../frontend/src/utils/apiHelper', () => ({ getApiUrl: (p) => `/api/${p}` }));

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');
const { default: BookingsList } = await import('../../frontend/src/Pages/Admin/BookingsList.jsx');

const unanswered = (cancellation = {}) => ({
  id: 'b5',
  type: 'flight',
  bookingReference: 'FLTUNK5',
  service: 'JFK→LHR',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '',
  status: 'cancelled',
  paymentStatus: 'paid',
  totalAmount: 291,
  currency: 'USD',
  bookingDate: '2026-09-20T10:00:00Z',
  pnr: 'ABC123',
  ticketed: true,
  ticketNumbers: ['108-2412345671'],
  attention: { kind: 'refund_not_made', reason: 'the refund was sent to ARC Pay and never answered: check ARC Pay before refunding anything', since: '2026-09-22T10:00:00Z' },
  reviewResolution: null,
  bookingDetails: {
    pnr: 'ABC123',
    arc_captured_amount: 291,
    cancellation: {
      cancelledAt: '2026-09-22T10:00:00Z', paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 50,
      netRefund: 0, currency: 'USD', ticketsVoided: true, basis: 'tickets voided the day they were issued', reversalOutcomeUnknown: true,
      ...cancellation,
    },
    needs_review: { reason: 'refund request did not complete: socket hang up', source: 'cancellation', at: '2026-09-22T10:00:00Z' },
  },
});

const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => 'application/json' } });

beforeEach(() => {
  adminFetch.mockReset();
  readAdminResponse.mockReset();
});

describe('the desk', () => {
  const noRefundFound = { success: false, code: 'NO_REFUND_FOUND', error: 'ARC Pay shows no refund for this booking yet. Refund it first, here or in the ARC portal.' };

  async function openFinishRefund(row, syncAnswer = noRefundFound) {
    adminFetch.mockImplementation(async (_url, options) => (options?.method === 'POST'
      ? reply(syncAnswer, syncAnswer.success ? 200 : 409)
      : reply({ success: true, data: [row] })));
    readAdminResponse.mockImplementation(async (response) => response.json());
    const { container } = render(
      <MemoryRouter initialEntries={['/desk']}>
        <Routes><Route path="/desk" element={<SupportQueue />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.textContent).toMatch(/FLTUNK5/));
    fireEvent.click(screen.getByRole('button', { name: /Finish refund/ }));
    return { dialog: screen.getByRole('dialog'), input: screen.getByLabelText(/Amount \(USD\)/) };
  }

  const refundPosts = () => adminFetch.mock.calls
    .filter(([url, options]) => options?.method === 'POST' && /\/refund$/.test(url))
    .map(([, options]) => JSON.parse(options.body));

  it('fills in nothing until Check ARC Pay has run, and names the decided amount, the fee it keeps and the check', async () => {
    const { dialog, input } = await openFinishRefund(unanswered());
    expect(input.value, 'the decided 241 was filled in before anyone asked ARC Pay whether the cancel\'s refund landed').toBe('');
    expect(dialog.textContent).toMatch(/\$241\.00/);
    expect(dialog.textContent).toMatch(/\$50\.00 cancellation fee/);
    expect(dialog.textContent).toMatch(/never answered/);
    expect(dialog.textContent).toMatch(/Check ARC Pay/);
    expect(refundPosts()).toEqual([]);
  });

  it('offers what the cancel decided once ARC Pay shows nothing returned', async () => {
    const { input } = await openFinishRefund(unanswered());
    fireEvent.click(screen.getByRole('button', { name: 'Check ARC Pay' }));
    await waitFor(() => expect(input.value).toBe('241'));
    expect(refundPosts()).toEqual([{ mode: 'sync' }]);
  });

  it('offers the whole payment when that is what the cancel decided, once ARC Pay has been asked', async () => {
    const { dialog, input } = await openFinishRefund(unanswered({ cancellationFee: 0, basis: 'reservation released before any ticket was issued' }));
    expect(input.value).toBe('');
    expect(dialog.textContent).not.toMatch(/cancellation fee/);
    fireEvent.click(screen.getByRole('button', { name: 'Check ARC Pay' }));
    await waitFor(() => expect(input.value).toBe('291'));
  });

  it('a check that could not reach ARC Pay fills in nothing', async () => {
    const { input } = await openFinishRefund(unanswered(), { success: false, code: 'GATEWAY_UNAVAILABLE', error: 'Could not reach ARC Pay. Nothing was refunded or changed.' });
    fireEvent.click(screen.getByRole('button', { name: 'Check ARC Pay' }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Could not reach ARC Pay/));
    expect(input.value).toBe('');
  });
});

describe('the admin panel', () => {
  async function openFinishRefund(syncAnswer) {
    adminFetch.mockImplementation(async () => ({ ok: false, status: 409, json: async () => syncAnswer }));
    readAdminResponse.mockImplementation(async () => ({ success: true, data: [unanswered()], count: 1, totalPages: 1 }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({}) }));
    render(<MemoryRouter><BookingsList /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Finish refund (failed or under review)'));
    return screen.getByPlaceholderText(/e\.g\./);
  }

  it('fills in nothing until Sync from ARC has run, then what the cancel decided, not the whole payment', async () => {
    const input = await openFinishRefund({ success: false, code: 'NO_REFUND_FOUND', error: 'ARC Pay shows no refund for this booking yet.' });
    expect(input.value, 'the decided 241 was filled in before anyone asked ARC Pay').toBe('');
    expect(document.body.textContent).toMatch(/\$50(\.00)? cancellation fee/);
    expect(document.body.textContent).toMatch(/Sync from ARC before refunding anything/);
    fireEvent.click(screen.getByRole('button', { name: 'Sync from ARC' }));
    await waitFor(() => expect(input.value).toBe('241'));
  });

  it('a sync that could not reach ARC Pay fills in nothing', async () => {
    const input = await openFinishRefund({ success: false, code: 'GATEWAY_UNAVAILABLE', error: 'Could not reach ARC Pay.' });
    fireEvent.click(screen.getByRole('button', { name: 'Sync from ARC' }));
    await waitFor(() => expect(adminFetch).toHaveBeenCalled());
    await waitFor(() => expect(document.body.textContent).toMatch(/Could not reach ARC Pay/));
    expect(input.value).toBe('');
  });
});
