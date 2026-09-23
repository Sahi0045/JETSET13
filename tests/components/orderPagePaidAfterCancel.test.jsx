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
 * The order page of a payer who paid on a checkout's payment page after the
 * checkout was cancelled, on every answer the order route gives them
 * (tests/backend/paidAfterCancelToldOnEveryAnswer.test.js): the payment held,
 * returned since, or partly returned since.
 *
 * Partly returned read "Your payment has not been reversed yet. Our team has
 * been alerted and will refund you" - the answer's `refunded` is false - of a
 * payment part of which had already gone back.
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

const orderData = {
  orderId: 'FLTOPEN1',
  transactionId: 'SI-FLTOPEN1',
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

const LATE = 'This booking was cancelled before your payment went through, so it has not been booked.';
const lateAnswer = (paymentState) => ({
  success: false, error: LATE, message: LATE, code: 'BOOKING_CANCELLED', bookingFailed: true,
  refunded: paymentState === 'returned', paymentState,
});

const renderWith = (status, body) => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(status, body)));
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
      <Routes><Route path="/flight-create-orders" element={<FlightCreateOrders />} /></Routes>
    </MemoryRouter>
  );
};

afterEach(() => vi.unstubAllGlobals());

describe('a payment made after the checkout was cancelled', () => {
  it('partly returned since: says what went back, not that nothing was', async () => {
    const { container } = renderWith(409, lateAnswer('partly_returned'));

    await waitFor(() => expect(container.textContent).toMatch(/Booking Not Completed/));
    expect(container.textContent).toContain(LATE);
    expect(container.textContent).toMatch(/Part of your payment has been refunded\. Please call \(877\) 538-7380 with your booking reference about the rest\./);
    expect(container.textContent).not.toMatch(/has not been reversed yet/);
  });

  // Fences: held, and returned, read as the first answer always has.
  it('still held: not reversed yet, and our team will refund it', async () => {
    const { container } = renderWith(409, lateAnswer('held'));

    await waitFor(() => expect(container.textContent).toMatch(/Booking Not Completed/));
    expect(container.textContent).toContain(LATE);
    expect(container.textContent).toMatch(/Your payment has not been reversed yet\. Our team has been alerted and will refund you\./);
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('returned since: says it was reversed', async () => {
    const { container } = renderWith(409, lateAnswer('returned'));

    await waitFor(() => expect(container.textContent).toMatch(/Your payment has been reversed\. You do not need to do anything\./));
    expect(container.textContent).not.toMatch(/Part of your payment/);
  });

  it('the gateway could not be asked: the server\'s words, and no line claiming a payment', async () => {
    const text = 'This booking was cancelled, so it cannot be completed. We could not check with the payment gateway just now '
      + 'whether a payment was taken for it. If you paid for it after it was cancelled, it has not been booked, and our team will refund you. '
      + 'If you have any questions, call (877) 538-7380 with booking reference FLTOPEN1.';
    const { container } = renderWith(409, { success: false, error: text, message: text, code: 'BOOKING_CANCELLED' });

    await waitFor(() => expect(container.textContent).toContain(text));
    expect(container.textContent).not.toMatch(/has not been reversed yet|has been reversed|Part of your payment/);
  });
});
