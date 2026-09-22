import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: PaymentCallback } = await import('../../frontend/src/Pages/Common/PaymentCallback.jsx');
const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');

/**
 * The address the order page carries as the booking's customerEmail.
 *
 * The payment callback and the order page's storage fallback set it to the
 * lead traveller's typed email, whatever it held - "jane@gmailcom" included -
 * and that address, being there, hid a usable one: the order page's own
 * fallback put the lead's address ahead of the one the callback handed over,
 * and buildFlightOrderBody then found no usable contact at all. Everything
 * else that picks this address (orderDataFromCheckoutRow, the order route)
 * takes the first one that can be delivered to (isUsableEmail): checkout's
 * customerEmail, then the lead traveller's.
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
const lead = (email) => ({ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email, type: 'ADULT' });

const json = (body) => ({ ok: true, status: 200, json: async () => body });

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe('the payment callback', () => {
  /** What the callback hands the order page as customerEmail, for a checkout the server kept. */
  const handedOver = async (checkout) => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('get-pending-booking')) return json({ success: true, pendingBookingData: checkout });
      if (String(url).includes('reconcile-booking-payment')) return json({ success: true, paid: true });
      return json({});
    }));
    const Probe = () => <p data-testid="probe">{JSON.stringify({ customerEmail: useLocation().state?.customerEmail ?? null })}</p>;
    const { findByTestId } = render(
      <MemoryRouter initialEntries={['/payment/callback?orderId=FLT1&bookingType=flight&resultIndicator=SI-1']}>
        <Routes>
          <Route path="/payment/callback" element={<PaymentCallback />} />
          <Route path="/flight-create-orders" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    );
    return JSON.parse((await findByTestId('probe', {}, { timeout: 4000 })).textContent).customerEmail;
  };
  const checkout = (customerEmail, leadEmail) => ({
    ...(customerEmail !== undefined ? { customerEmail } : {}),
    bookingData: { selectedFlight: { originalOffer: offer }, originalOffer: offer, amount: 291, passengerData: [lead(leadEmail)] },
  });

  it("passes over a lead traveller's address that cannot be delivered to, for checkout's", async () => {
    expect(await handedOver(checkout('jane@gmail.com', 'jane@gmailcom'))).toBe('jane@gmail.com');
  });

  it('hands over no address rather than one that cannot be delivered to', async () => {
    expect(await handedOver(checkout(undefined, 'jane@gmailcom'))).toBe('');
  });

  // Fences.
  it("a usable lead traveller's address with no checkout address: as before", async () => {
    expect(await handedOver(checkout(undefined, 'jane@example.com'))).toBe('jane@example.com');
  });

  it('no address anywhere: none, as before', async () => {
    expect(await handedOver(checkout(undefined, ''))).toBe('');
  });
});

describe("the order page's storage fallback", () => {
  /** The contact email the order page posts, from a draft in this tab's storage. */
  const postedContact = async ({ state, draft }) => {
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify({ orderId: 'FLT1', ...draft }));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: '',
      headers: { get: () => 'application/json', forEach: (fn) => fn('application/json', 'content-type') },
      text: async () => JSON.stringify({ success: true, pnr: 'ABC123', ticketed: true, tickets: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state }]}>
        <Routes>
          <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    return JSON.parse(fetchMock.mock.calls[0][1].body).contactInfo.email;
  };
  const draft = (leadEmail, over = {}) => ({
    selectedFlight: { originalOffer: offer }, originalOffer: offer, amount: 291, passengerData: [lead(leadEmail)],
    bookingDetails: { isInternational: true }, ...over,
  });

  it("passes over the lead traveller's unusable address for the one the callback handed over", async () => {
    expect(await postedContact({ state: { orderId: 'FLT1', customerEmail: 'jane@gmail.com' }, draft: draft('jane@gmailcom') }))
      .toBe('jane@gmail.com');
  });

  // Fences.
  it("a usable lead traveller's address with none handed over: as before", async () => {
    expect(await postedContact({ state: { orderId: 'FLT1' }, draft: draft('jane@example.com') })).toBe('jane@example.com');
  });

  it("the review page's contact email still goes first", async () => {
    expect(await postedContact({
      state: { orderId: 'FLT1', customerEmail: 'jane@gmail.com' },
      draft: draft('jane@example.com', { bookingDetails: { isInternational: true, contact: { email: 'contact@example.com' } } }),
    })).toBe('contact@example.com');
  });
});
