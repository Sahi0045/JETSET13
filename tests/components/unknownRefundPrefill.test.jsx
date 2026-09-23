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

const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => 'application/json' } });

beforeEach(() => {
  adminFetch.mockReset();
  readAdminResponse.mockReset();
});

describe('the desk', () => {
  async function openFinishRefund(row) {
    adminFetch.mockImplementation(async (_url, options) => reply(options?.method === 'POST' ? { success: true, message: 'done' } : { success: true, data: [row] }));
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

  it('offers what the cancel decided, names the fee it keeps, and says to check ARC Pay first', async () => {
    const { dialog, input } = await openFinishRefund(unanswered());
    expect(input.value, 'the whole payment, fee included, is filled in').toBe('241');
    expect(dialog.textContent).toMatch(/\$50\.00 cancellation fee/);
    expect(dialog.textContent).toMatch(/never answered/);
    expect(dialog.textContent).toMatch(/Check ARC Pay/);
  });

  it('offers the whole payment when that is what the cancel decided', async () => {
    const { dialog, input } = await openFinishRefund(unanswered({ cancellationFee: 0, basis: 'reservation released before any ticket was issued' }));
    expect(input.value).toBe('291');
    expect(dialog.textContent).not.toMatch(/cancellation fee/);
  });
});

describe('the admin panel', () => {
  it('offers what the cancel decided, not the whole payment', async () => {
    adminFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ success: true, message: 'done' }) }));
    readAdminResponse.mockImplementation(async () => ({ success: true, data: [unanswered()], count: 1, totalPages: 1 }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({}) }));
    render(<MemoryRouter><BookingsList /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Finish refund (failed or under review)'));
    expect(screen.getByPlaceholderText(/e\.g\./).value).toBe('241');
    expect(document.body.textContent).toMatch(/\$50(\.00)? cancellation fee/);
  });
});
