import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The admin bookings list, driven through a refund ARC Pay refused.
 *
 * The unit tests in tests/utils/adminCancelOutcome.test.js cover the reading of
 * each outcome. This renders the real page and presses the real buttons, so it
 * covers the wiring too: the toast and the result modal the operator actually
 * sees after Cancel & Refund. Before the fix this exact response produced a
 * green "cancelled successfully" toast and an empty green "Booking Cancelled"
 * panel.
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

const booking = {
  id: 'b-1',
  type: 'flight',
  bookingReference: 'FLT123456',
  customerName: 'Ann Traveller',
  customerEmail: 'ann@example.com',
  service: 'DEL to BOM',
  totalAmount: 450,
  currency: 'USD',
  status: 'confirmed',
  paymentStatus: 'paid',
  bookingDate: '2026-09-20T10:00:00Z',
  bookingDetails: {},
};

/** The list, then whatever the cancel answers. */
function serverAnswers(cancelAnswer) {
  adminFetch.mockImplementation(async (url) => ({ url }));
  readAdminResponse.mockImplementation(async ({ url }) => {
    if (url.includes('/cancel')) return cancelAnswer;
    return { success: true, data: [booking], count: 1, totalPages: 1 };
  });
}

async function cancelTheBooking() {
  render(<MemoryRouter><BookingsList /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Cancel & Refund'));
  fireEvent.click(screen.getByRole('button', { name: /❌ Cancel & Refund/ }));
}

beforeEach(() => {
  adminFetch.mockReset();
  readAdminResponse.mockReset();
  globalThis.fetch = vi.fn(async () => ({ json: async () => ({}) }));
});

describe('Cancel & Refund, when ARC Pay refuses the refund', () => {
  const refused = {
    success: true,
    message: 'Booking FLT123456 cancelled successfully',
    data: { bookingReference: 'FLT123456', cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 0, amadeusCancelled: true } },
  };

  it('tells the operator the refund did not go through, not that it succeeded', async () => {
    serverAnswers(refused);
    await cancelTheBooking();

    const toast = await screen.findByRole('status');
    expect(toast.textContent).toMatch(/did not go through/);
    expect(toast.textContent).toMatch(/Nothing has gone back to the customer's card/);
    expect(toast.textContent).not.toMatch(/successfully/i);
  });

  it('heads the result with the failure, shows what was paid, and says how to finish it', async () => {
    serverAnswers(refused);
    await cancelTheBooking();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading').textContent).toContain('Cancelled, but the refund failed');
    expect(dialog.textContent).toContain('ARC Pay refused the refund.');
    expect(dialog.textContent).toMatch(/Finish refund/);
    expect(dialog.textContent).toContain('Customer paid');
    expect(dialog.textContent).toContain('$450');
    expect(within(dialog).queryByText('Booking Cancelled')).toBeNull();
  });
});

describe('Cancel & Refund, when the refund went through', () => {
  it('says how much went back', async () => {
    serverAnswers({
      success: true,
      data: { cancellation: { paymentAction: 'FULL_REFUND', refundAmount: 450, cancellationFee: 0 } },
    });
    await cancelTheBooking();

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain("$450 refunded to the customer's card"));
    expect(within(screen.getByRole('dialog')).getByRole('heading').textContent).toContain('Cancelled: refund sent');
  });
});
