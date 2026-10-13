import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');

afterEach(() => vi.unstubAllGlobals());

const booked = (over = {}) => ({
  type: 'flight', bookingReference: 'FLT1', status: 'confirmed', pnr: 'ABC123', payment_status: 'paid', amount: 122.2,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], gds: { ticketed: true }, source: 'database',
  chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 0, total: 122.2, currency: 'USD' },
  ...over,
});
const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>,
).container.textContent;

describe('the booking confirmation with a trip-reward voucher', () => {
  it('says the coins come after the trip, and takes nothing off the price', () => {
    const text = confirmationText(booked({ tripReward: { code: 'SHUBHAM', coins: 5000 } }));
    expect(text).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/);
    expect(text).toMatch(/USD 122\.20/);
    expect(text).not.toMatch(/- \$50\.00/);
  });

  it('says nothing about a voucher the booking does not carry', () => {
    expect(confirmationText(booked())).not.toMatch(/after your trip/);
  });

  it('says nothing for a voucher that was only on the charge, never reserved', () => {
    const text = confirmationText(booked({ chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 0, total: 122.2, currency: 'USD', voucher: { code: 'SHUBHAM', coins: 5000 } } }));
    expect(text).not.toMatch(/after your trip/);
  });
});

describe('the order page', () => {
  const offer = {
    itineraries: [{ segments: [{ id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614' }] }],
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

  it('hands the reward the server reserved to the confirmation page', async () => {
    const tripReward = { code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' };
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { success: true, pnr: 'ABC123', bookingReference: 'FLT1', ticketed: true, tripReward })));
    const seen = { state: null };
    const Probe = () => { seen.state = useLocation().state; return null; };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
        <Routes>
          <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
          <Route path="/booking-confirmation" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(seen.state?.bookingData?.tripReward).toEqual(tripReward), { timeout: 5000 });
  });
});
