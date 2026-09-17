import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { default: PaymentSuccess } = await import('../../frontend/src/Pages/Common/PaymentSuccess.jsx');

/**
 * "Transaction ID 1" on a customer's booking.
 *
 * ARC Pay numbers the transactions inside each order, so the first payment on
 * every order is transaction "1", and that is what was saved and shown. The
 * bank's reference for the payment is the transaction's `receipt` - 625923098465
 * for FLTE00528103C4A42 on the test merchant, 17 Sep 2026. Straight after
 * checkout the confirmation page showed something else again: ARC's result
 * indicator, the value that proves the payment to our server.
 */

const RECEIPT = '625923098465';

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

// What the payment page hands over: `transactionId` is ARC's result indicator.
const orderData = {
  orderId: 'FLT1',
  transactionId: 'SI-9f8e7d6c5b4a',
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
  json: async () => body,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the confirmation page after checkout', () => {
  it('shows the bank reference the server answered with, not the result indicator', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, {
      success: true, pnr: 'BH9F9H', bookingReference: 'FLT1', ticketed: true,
      tickets: [{ number: '074-7491175288', travelerId: '1' }], transactionId: RECEIPT,
    })));

    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
        <Routes>
          <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
          <Route path="/booking-confirmation" element={<BookingConfirmation />} />
        </Routes>
      </MemoryRouter>
    );

    const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    await flush();
    await flush();
    expect(container.textContent).toMatch(/BH9F9H/);
    await flush(2500);

    expect(container.textContent).toMatch(/Airline Reference/);
    expect(container.textContent).toMatch(new RegExp(`Transaction ID\\s*${RECEIPT}`));
    expect(container.textContent).not.toMatch(new RegExp(orderData.transactionId));
  });
});

describe('the payment receipt', () => {
  // PaymentSuccess.jsx relies on the build's automatic JSX runtime and never
  // imports React; this test project compiles JSX the classic way.
  globalThis.React = React;

  const renderReceipt = (payment) => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { success: true, payment })));
    return render(
      <MemoryRouter initialEntries={['/payment/success?paymentId=p1']}>
        <PaymentSuccess />
      </MemoryRouter>
    ).container;
  };

  it('shows the bank reference, not the transaction count', async () => {
    const container = renderReceipt({ id: 'p1', amount: 100, currency: 'USD', arc_transaction_id: '1', arc_receipt: RECEIPT });

    await waitFor(() => expect(container.textContent).toMatch(new RegExp(`Transaction ID\\s*${RECEIPT}`)));
  });

  it('leaves the line out when there is no bank reference, rather than print "1"', async () => {
    const container = renderReceipt({ id: 'p1', amount: 100, currency: 'USD', arc_transaction_id: '1' });

    await waitFor(() => expect(container.textContent).toMatch(/Receipt No\./));
    expect(container.textContent).not.toMatch(/Transaction ID/);
  });
});
