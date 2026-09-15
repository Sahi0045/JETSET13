import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');

/**
 * What the order page says after payment, driven through the order request.
 *
 * The order request goes through the axios shim to `fetch`, which is stubbed
 * here with the server's answers.
 */

const offer = {
  itineraries: [{
    segments: [{
      id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' },
      carrierCode: 'FI', number: '614',
    }],
  }],
  price: { total: '291.00', currency: 'USD' },
  travelerPricings: [{ travelerType: 'ADULT' }],
};

export const orderData = {
  orderId: 'FLT1',
  transactionId: 'SI-1',
  amount: 291,
  originalOffer: offer,
  selectedFlight: { originalOffer: offer, itineraries: offer.itineraries },
  passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: 'jane@example.com', type: 'ADULT' }],
  bookingDetails: { contact: { email: 'jane@example.com' }, isInternational: true },
};

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
});

const renderOrderPage = (state = orderData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state }]}>
    <Routes>
      <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
    </Routes>
  </MemoryRouter>
);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * A booking that failed after the server tried to reverse the payment.
 *
 * refundOnFulfillmentFailure answers `bookingFailed: true` and, from several
 * callers, no `code` - and the page offered "Try again" on a reference whose
 * payment was already reversed.
 */
describe('a failed booking whose payment the server tried to reverse', () => {
  it('offers no "Try again", whatever the code, and says the payment was reversed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(502, {
      success: false, bookingFailed: true, refunded: true, refundAction: 'VOID',
      error: 'We could not confirm your flight booking. Your payment has been reversed and will return to your original payment method.',
    })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/Booking Not Completed/));
    expect(container.textContent).toMatch(/Your payment has been reversed\. You do not need to do anything\. Booking reference: FLT1\./);
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Start a new search/ })).toBeTruthy();
  });

  it('says the payment is not reversed yet when the reversal failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(502, {
      success: false, bookingFailed: true, refunded: false, refundAction: 'FAILED',
      error: 'We could not confirm your flight booking. Your payment could not be reversed automatically.',
    })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/has not been reversed yet/));
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('still offers "Try again" for a failure that moved no money', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(503, {
      success: false, code: 'BOOKING_UNAVAILABLE', retryable: true,
      error: 'We could not start your booking just now. Your payment is safe - please try again in a minute.',
    })));
    renderOrderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy());
  });
});
