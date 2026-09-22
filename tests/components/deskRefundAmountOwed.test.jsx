import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { default: SupportQueue } = await import('../../frontend/src/Pages/Support/SupportQueue.jsx');

/**
 * Finishing a refused refund on the desk.
 *
 * A same-day cancel of a ticketed booking decides "refund less the
 * cancellation fee" (decideFlightRefund refund_less_fee: 291 held, 50 fee, 241
 * back). ARC Pay refuses the REFUND, so the cancel records REFUND_FAILED with
 * cancellationFee 50 and refundAmount 0 (returnFlightPayment).
 *
 * The desk's Finish refund box was filled with the booking's whole total, and
 * Refund now sent it: the settle caps only at what ARC holds, so the fee the
 * cancel had decided to keep went back to the card too.
 */

const refusedWith = (cancellation = {}, over = {}) => ({
  id: 'b7',
  bookingReference: 'FLTFEE7',
  type: 'flight',
  service: 'JFK→LHR',
  status: 'cancelled',
  paymentStatus: 'paid',
  totalAmount: 291,
  bookingDate: '2026-09-20T10:00:00Z',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '',
  pnr: 'ABC123',
  ticketed: true,
  ticketNumbers: ['108-2412345671'],
  attention: null,
  reviewResolution: null,
  ...over,
  bookingDetails: {
    pnr: 'ABC123',
    arc_captured_amount: 291,
    cancellation: {
      cancelledAt: '2026-09-20T12:00:00Z',
      paymentAction: 'REFUND_FAILED',
      refundAmount: 0,
      cancellationFee: 50,
      netRefund: 0,
      currency: 'USD',
      ticketsVoided: true,
      basis: 'tickets voided the day they were issued',
      ...cancellation,
    },
  },
});

const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => 'application/json' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Open Finish refund on the one booking listed, and press Refund now. */
async function refundNow(row) {
  const fetchMock = vi.fn(async (url, options) => (options?.method === 'POST'
    ? reply({ success: true, message: 'done' })
    : reply({ success: true, data: [row] })));
  vi.stubGlobal('fetch', fetchMock);

  const { container } = render(
    <MemoryRouter initialEntries={['/desk']}>
      <Routes>
        <Route path="/desk" element={<SupportQueue />} />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(container.textContent).toMatch(/FLTFEE7/));
  fireEvent.click(screen.getByRole('button', { name: /Finish refund/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: /Refund now/ }));

  await waitFor(() => {
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(post).toBeTruthy();
  });
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
  return { body: JSON.parse(post[1].body), dialog };
}

describe('finishing a refused refund on the desk', () => {
  it('sends the refund the cancel decided on, not the whole payment', async () => {
    const { body } = await refundNow(refusedWith());
    // 291 paid, a 50 fee kept by the cancel's own decision: 241 is owed.
    expect(body.amount).toBe(241);
  });

  it('shows the fee the cancel kept beside the amount owed', async () => {
    const { dialog } = await refundNow(refusedWith());
    expect(dialog.textContent).toMatch(/\$241\.00/);
    expect(dialog.textContent).toMatch(/\$50\.00 cancellation fee/);
  });

  it('owes the whole payment when the cancel kept no fee', async () => {
    const { body, dialog } = await refundNow(refusedWith({ cancellationFee: 0 }));
    expect(body.amount).toBe(291);
    expect(dialog.textContent).not.toMatch(/cancellation fee/);
  });

  it('owes what a partial refund by hand left held', async () => {
    const { body } = await refundNow(refusedWith({
      paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 0, stillHeld: 50,
    }, { paymentStatus: 'partially_refunded' }));
    expect(body.amount).toBe(50);
  });
});
