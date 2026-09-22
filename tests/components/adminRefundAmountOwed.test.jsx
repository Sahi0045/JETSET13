import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The admin panel's Finish refund, on a refund ARC Pay refused.
 *
 * The cancel decided 291 held, a 50 fee kept, 241 back, and ARC Pay refused
 * the REFUND. The box opened empty beside "paid $291", with nothing to say the
 * cancel meant to keep a fee - the whole payment was the only figure on the
 * screen, and the server caps a refund at what ARC holds, not at what is owed.
 */

const adminFetch = vi.fn();
const readAdminResponse = vi.fn();

vi.mock('../../frontend/src/utils/adminAuth', () => ({
  adminFetch: (...args) => adminFetch(...args),
  readAdminResponse: (...args) => readAdminResponse(...args),
}));
vi.mock('../../frontend/src/Pages/Admin/shell/RefreshContext', () => ({ useRegisterRefresh: () => {} }));
vi.mock('../../frontend/src/utils/apiHelper', () => ({ getApiUrl: (p) => `/api/${p}` }));

const { default: BookingsList } = await import('../../frontend/src/Pages/Admin/BookingsList.jsx');

const refusedWith = (cancellation = {}) => ({
  id: 'b7',
  type: 'flight',
  bookingReference: 'FLTFEE7',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  service: 'JFK→LHR',
  totalAmount: 291,
  currency: 'USD',
  status: 'cancelled',
  paymentStatus: 'paid',
  bookingDate: '2026-09-20T10:00:00Z',
  bookingDetails: {
    pnr: 'ABC123',
    arc_captured_amount: 291,
    cancellation: {
      cancelledAt: '2026-09-20T12:00:00Z', paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 50,
      currency: 'USD', ticketsVoided: true, basis: 'tickets voided the day they were issued', ...cancellation,
    },
  },
});

async function openFinishRefund(row) {
  adminFetch.mockImplementation(async (url, options) => ({
    url,
    options,
    ok: true,
    json: async () => ({ success: true, message: 'done' }),
  }));
  readAdminResponse.mockImplementation(async () => ({ success: true, data: [row], count: 1, totalPages: 1 }));
  render(<MemoryRouter><BookingsList /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Finish refund (failed or under review)'));
  return screen.getByPlaceholderText(/e\.g\./);
}

beforeEach(() => {
  adminFetch.mockReset();
  readAdminResponse.mockReset();
  globalThis.fetch = vi.fn(async () => ({ json: async () => ({}) }));
});

describe('Finish refund in the admin panel', () => {
  it('starts from what the cancel decided goes back, and says why', async () => {
    const input = await openFinishRefund(refusedWith());

    expect(input.value).toBe('241');
    expect(document.body.textContent).toMatch(/\$50(\.00)? cancellation fee/);

    fireEvent.click(screen.getByRole('button', { name: 'Refund now' }));
    await waitFor(() => {
      const post = adminFetch.mock.calls.find(([url]) => String(url).includes('/refund'));
      expect(JSON.parse(post[1].body)).toMatchObject({ mode: 'refund', amount: 241 });
    });
  });

  it('starts from the whole payment when the cancel kept no fee', async () => {
    const input = await openFinishRefund(refusedWith({ cancellationFee: 0 }));
    expect(input.value).toBe('291');
  });

  it('starts empty for a refund held for a person to decide', async () => {
    const input = await openFinishRefund(refusedWith({ paymentAction: 'REFUND_UNDER_REVIEW', cancellationFee: 0 }));
    expect(input.value).toBe('');
  });
});
