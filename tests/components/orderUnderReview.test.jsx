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
 * The order page's answer to 409 BOOKING_NEEDS_REVIEW.
 *
 * The order route answers it for a PNR the airline confirmed no seat on (the
 * chain's step 'segmentStatus'), and again on any retry of a booking a person
 * is reviewing. The customer has paid. The page showed a red "Booking Failed
 * ... We encountered an issue" with one button, "Start a new search": a
 * charged customer sent to buy again, and a second flight is not caught as a
 * duplicate payment.
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

const renderOrderPage = () => render(
  <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
    <Routes>
      <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
    </Routes>
  </MemoryRouter>
);

afterEach(() => {
  vi.unstubAllGlobals();
});

const NO_SEAT = 'The airline has not confirmed a seat on every flight - our team will contact you';

describe('a booking our team has to review, on the order page', () => {
  it('for a PNR with no confirmed seat: the payment is held against the reservation, we will contact them, do not book again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(409, {
      success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: 'FLT1', pnr: 'XYZ789', paymentState: 'held', error: NO_SEAT, message: NO_SEAT,
    })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/Our team will contact you/));
    const text = container.textContent;
    expect(text).toMatch(new RegExp(NO_SEAT));
    expect(text).toMatch(/Your payment is held against your reservation \(airline reference XYZ789\)/);
    expect(text).toMatch(/Please do not book this trip again/);
    expect(text).toMatch(/FLT1/);
    expect(text).not.toMatch(/Booking Failed|encountered an issue/);
    expect(screen.queryByRole('button', { name: /Start a new search/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Back to home/ })).toBeTruthy();
  });

  it('on a retry the answer names no PNR, so it claims no reservation', async () => {
    const message = 'This booking could not be completed and our team is reviewing it, so it was not sent to the airline again. '
      + 'Nothing more has been charged. If you have not heard from us within 2 business days, call (877) 538-7380 with booking reference FLT1.';
    vi.stubGlobal('fetch', vi.fn(async () => reply(409, {
      success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: 'FLT1', paymentState: 'held', error: message, message,
    })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/Our team will contact you/));
    const text = container.textContent;
    expect(text).toMatch(/our team is reviewing it/);
    expect(text).toMatch(/Your payment is held with this booking while our team reviews it/);
    expect(text).not.toMatch(/against your reservation/);
    expect(text).toMatch(/Please do not book this trip again/);
    expect(text).not.toMatch(/Booking Failed/);
    expect(screen.queryByRole('button', { name: /Start a new search/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });
});

/**
 * The same screen for a booking whose payment was already returned.
 *
 * The order route answers BOOKING_NEEDS_REVIEW for any flagged booking that is
 * not cancelled, and it answers before the booking-disabled gate, so this is
 * reachable in production today. A flagged row refunded from the Payments tab
 * keeps its flag and reads refunded; the page told that customer "Your payment
 * is held with this booking ... do not book this trip again". Both false.
 */
describe('a booking under review whose payment was returned', () => {
  const refunded = 'This booking could not be completed, so it was not sent to the airline again. '
    + 'Your payment for it has been refunded. If you have any questions, call (877) 538-7380 with booking reference FLT1.';

  it('says the payment was refunded, never that it is held, and does not tell them not to rebook', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(409, {
      success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: 'FLT1', paymentState: 'returned', error: refunded, message: refunded,
    })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/has been refunded/));
    const text = container.textContent;
    expect(text).toMatch(/Your payment for this booking has been refunded\./);
    expect(text).toMatch(/This booking was not completed/);
    expect(text).not.toMatch(/payment is held|held with this booking|held against/i);
    expect(text).not.toMatch(/do not book this trip again|second booking is a second charge/i);
    expect(text).not.toMatch(/Booking Failed/);
  });

  it('says part of it was refunded when only part was', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(409, {
      success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: 'FLT1', paymentState: 'partly_returned', error: 'x', message: 'x',
    })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/has been refunded/));
    expect(container.textContent).toMatch(/Part of your payment for this booking has been refunded\./);
    expect(container.textContent).not.toMatch(/payment is held|do not book this trip again/i);
  });

  it('claims neither held nor refunded when the answer does not say', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(409, {
      success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: 'FLT1', error: 'x', message: 'x',
    })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/Our team will contact you about this booking and your payment/));
    expect(container.textContent).not.toMatch(/payment is held|has been refunded|do not book this trip again/i);
  });
});
