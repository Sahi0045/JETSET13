import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Finish refund after a refund by hand left money at ARC Pay, on the desk and
 * in the admin panel.
 *
 * Both pre-filled everything ARC still held and called it owed back. The
 * server caps a refund at what ARC holds, not at what is owed, so one press
 * returned money nobody decided was owed: the rest of a refund a person was
 * deciding, or the fee a cancel kept. The rows are the ones
 * settleManualFlightRefund writes (tests/backend/owedAfterRefundByHand.test.js).
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

const rowWith = (cancellation, needsReview = null) => ({
  id: 'b9',
  type: 'flight',
  bookingReference: 'FLTHAND1',
  service: 'JFK→LHR',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '',
  status: 'cancelled',
  paymentStatus: 'partially_refunded',
  totalAmount: 291,
  currency: 'USD',
  bookingDate: '2026-09-20T10:00:00Z',
  pnr: 'ABC123',
  ticketed: true,
  ticketNumbers: ['108-2412345671'],
  attention: needsReview ? { kind: 'review', reason: needsReview.reason, since: needsReview.at } : null,
  reviewResolution: null,
  bookingDetails: {
    pnr: 'ABC123',
    arc_captured_amount: 291,
    ...(needsReview ? { needs_review: needsReview } : {}),
    cancellation: { amadeusCancelled: true, cancelledAt: '2026-09-22T10:00:00Z', currency: 'USD', ...cancellation },
  },
});

/** A refund held for a person; the desk decided 120 of 291 goes back. */
const partOfAReview = () => rowWith({
  paymentAction: 'PARTIAL_REFUND', refundAmount: 120, cancellationFee: 0, stillHeld: 171,
  basis: 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules',
  manualRefund: { mode: 'refund', amount: 120, previousPaymentAction: 'REFUND_UNDER_REVIEW' },
}, { reason: 'non-refundable fare with tickets past their void window', source: 'cancellation', at: '2026-09-22T10:00:00Z' });

/** A refused refund of 241 (a 50 fee kept), finished short with 200. */
const refusedFinishedShort = () => rowWith({
  paymentAction: 'PARTIAL_REFUND', refundAmount: 200, cancellationFee: 0, decidedFee: 50, stillHeld: 91,
  basis: 'tickets voided the day they were issued',
  manualRefund: { mode: 'refund', amount: 200, previousPaymentAction: 'REFUND_FAILED' },
});

/** A refund held for a person, nothing returned yet. */
const heldForReview = () => rowWith({
  paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0,
  basis: 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules',
}, { reason: 'non-refundable fare with tickets past their void window', source: 'cancellation', at: '2026-09-22T10:00:00Z' });

const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => 'application/json' },
});

beforeEach(() => {
  adminFetch.mockReset();
  readAdminResponse.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('the desk', () => {
  /** Open Finish refund on the one booking listed. */
  async function openFinishRefund(row) {
    adminFetch.mockImplementation(async (_url, options) => reply(options?.method === 'POST'
      ? { success: true, message: 'done' }
      : { success: true, data: [row] }));
    readAdminResponse.mockImplementation(async (response) => response.json());
    const { container } = render(
      <MemoryRouter initialEntries={['/desk']}>
        <Routes><Route path="/desk" element={<SupportQueue />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.textContent).toMatch(/FLTHAND1/));
    fireEvent.click(screen.getByRole('button', { name: /Finish refund/ }));
    return { dialog: screen.getByRole('dialog'), input: screen.getByLabelText(/Amount \(USD\)/) };
  }

  it('offers nothing, and calls nothing owed, after part of a refund a person was deciding', async () => {
    const { dialog, input } = await openFinishRefund(partOfAReview());
    expect(dialog.textContent, 'the rest nobody decided on is called owed back').not.toMatch(/owed/i);
    expect(input.value, 'the 171 still held is filled in').toBe('');
  });

  it('offers what the cancel decided is still owed after a refused refund finished short, and says why', async () => {
    const { dialog, input } = await openFinishRefund(refusedFinishedShort());
    expect(input.value).toBe('41');
    expect(dialog.textContent).toMatch(/\$41\.00/);
    expect(dialog.textContent).toMatch(/\$50\.00 cancellation fee/);
    expect(dialog.textContent).toMatch(/\$200\.00 already refunded/);
  });

  it('starts empty for a refund held for a person, as the admin panel does', async () => {
    const { input } = await openFinishRefund(heldForReview());
    expect(input.value, 'the whole payment is filled in though nobody decided it').toBe('');
  });
});

describe('the admin panel', () => {
  async function openFinishRefund(row) {
    adminFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ success: true, message: 'done' }) }));
    readAdminResponse.mockImplementation(async () => ({ success: true, data: [row], count: 1, totalPages: 1 }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) })));
    render(<MemoryRouter><BookingsList /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Finish refund (failed or under review)'));
    return screen.getByPlaceholderText(/e\.g\./);
  }

  it('offers nothing, and calls nothing owed, after part of a refund a person was deciding', async () => {
    const input = await openFinishRefund(partOfAReview());
    expect(input.value, 'the 171 still held is filled in').toBe('');
    expect(document.body.textContent).not.toMatch(/Owed:/);
  });

  it('offers what the cancel decided is still owed after a refused refund finished short', async () => {
    const input = await openFinishRefund(refusedFinishedShort());
    expect(input.value).toBe('41');
    expect(document.body.textContent).toMatch(/\$50(\.00)? cancellation fee/);
    expect(document.body.textContent).toMatch(/\$200(\.00)? already refunded/);
  });
});
