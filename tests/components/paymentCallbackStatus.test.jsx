import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: PaymentCallback } = await import('../../frontend/src/Pages/Common/PaymentCallback.jsx');

/**
 * The page ARC Pay returns the customer to.
 *
 * It said "Payment verified! Creating your flight booking..." before anything
 * had been checked - including for a payment the gateway then reported as not
 * captured.
 */

const json = (body) => ({ ok: true, status: 200, json: async () => body });

const stubServer = (reconcile) => vi.stubGlobal('fetch', vi.fn(async (url) => {
  if (String(url).includes('get-pending-booking')) {
    return json({ success: true, pendingBookingData: { bookingData: { selectedFlight: { id: 'offer-1' }, amount: 291 } } });
  }
  if (String(url).includes('reconcile-booking-payment')) return json(reconcile);
  return json({});
}));

const renderCallback = () => render(
  <MemoryRouter initialEntries={['/payment/callback?orderId=FLT1&bookingType=flight&resultIndicator=SI-1']}>
    <Routes>
      <Route path="/payment/callback" element={<PaymentCallback />} />
      <Route path="/flight-create-orders" element={<p>order page</p>} />
    </Routes>
  </MemoryRouter>
);

afterEach(() => vi.unstubAllGlobals());

describe('the payment callback says only what it checked', () => {
  it('says the payment was received once the gateway confirmed it', async () => {
    stubServer({ success: true, paid: true });
    const { container } = renderCallback();

    await waitFor(() => expect(container.textContent).toMatch(/Payment received\. Creating your flight booking/));
    expect(container.textContent).not.toMatch(/verified/i);
  });

  it('claims nothing about a payment the gateway has not confirmed', async () => {
    stubServer({ success: true, paid: false, orderStatus: 'FAILED' });
    const { container } = renderCallback();

    await waitFor(() => expect(container.textContent).toMatch(/Confirming your payment and creating your booking/));
    expect(container.textContent).not.toMatch(/Payment received|verified/i);
  });
});
