import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');

/**
 * Back to the order page after a cancel that released the PNR and voided the
 * payment, and whose record could not be written. The customer had been told
 * "Please do not try again - call (877) 538-7380".
 *
 * The order route answered it ALREADY_BOOKED and ticketed, and the order page
 * said "Booking Confirmed!" and handed the confirmation page an issued ticket.
 * It now answers 409 BOOKING_NEEDS_REVIEW with paymentState 'unconfirmed'
 * (tests/backend/alreadyBookedUnrecordedCancellation.test.js). This pins what
 * the page makes of that answer: our team has it, the payment is neither
 * called held nor refunded, and nothing goes on to the confirmation page.
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
  orderId: 'FLTHELD1',
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

// The order route's answer for this booking (notSentAgainMessage, 'unconfirmed').
const MESSAGE = 'This booking could not be completed and our team is reviewing it, so it was not sent to the airline again. '
  + 'Nothing more has been charged. If you have not heard from us within 2 business days, call (877) 538-7380 with booking reference FLTHELD1.';
const unrecordedCancellation = {
  success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: 'FLTHELD1', paymentState: 'unconfirmed', error: MESSAGE, message: MESSAGE,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('back to the order page after a cancel that could not be recorded', () => {
  it('says our team has it, claims no ticket and no held or refunded payment, and stays on the order page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(409, unrecordedCancellation)));
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
        <Routes>
          <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
          <Route path="/booking-confirmation" element={<BookingConfirmation />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(container.textContent).toMatch(/Our team will contact you about this booking and your payment/));
    const text = container.textContent;
    expect(text).toMatch(/Our team is reviewing your booking/);
    expect(text).toMatch(/FLTHELD1/);
    expect(text).not.toMatch(/Booking Confirmed|ticket has been issued|Redirecting to your booking confirmation/i);
    expect(text).not.toMatch(/payment is held|has been refunded|Booking Failed/i);
    expect(text).not.toMatch(/View All Trips/);
    expect(screen.queryByRole('button', { name: /Try again|Start a new search/ })).toBeNull();
  });
});
