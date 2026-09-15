import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

/**
 * BOOKING_IN_PROGRESS: another request holds this booking and is confirming it.
 * The page showed a red "Booking Failed".
 */
describe('a booking another request is already confirming', () => {
  const inProgress = (error = 'This booking is already being confirmed. Please wait a moment before trying again.') =>
    reply(409, { success: false, code: 'BOOKING_IN_PROGRESS', error });
  const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  it('says it is still confirming, asks again, and shows the booking once it is made', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(inProgress())
      .mockResolvedValueOnce(inProgress())
      .mockResolvedValueOnce(reply(200, { success: true, pnr: 'ABC123', bookingReference: 'FLT1', ticketed: false, mode: 'ALREADY_BOOKED' }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderOrderPage();

    await flush();
    await flush();
    expect(container.textContent).toMatch(/Still confirming your booking/);
    expect(container.textContent).not.toMatch(/Booking Failed/);
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();

    await flush(8000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toMatch(/Still confirming your booking/);

    await flush(8000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toMatch(/Reservation Held/);
  });

  it('stops after a few tries and says the customer will be emailed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn(async () => inProgress());
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderOrderPage();

    await flush();
    for (let i = 0; i < 5; i += 1) await flush(8000);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(container.textContent).toMatch(/Your booking is still being confirmed/);
    expect(container.textContent).toMatch(/we will email you as soon as the airline confirms it/);
    expect(container.textContent).not.toMatch(/Booking Failed/);

    await flush(60000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not keep asking about a booking that is being cancelled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn(async () => inProgress('This booking is being cancelled, so it cannot be confirmed.'));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderOrderPage();

    await flush();
    await flush(60000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/This booking is being cancelled/);
  });
});

/**
 * No captured payment behind the reference (PAYMENT_NOT_CAPTURED or
 * PAYMENT_NOT_FOUND). The page said "Booking Failed" and offered "Try again",
 * which reloaded the same 402 for ever.
 */
describe('a payment the server found no capture for', () => {
  const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const notCaptured = (extra = {}) => reply(402, {
    success: false, code: 'PAYMENT_NOT_CAPTURED',
    error: 'Payment for this booking has not been captured. Please complete payment before confirming.', ...extra,
  });

  it('says the payment did not complete and offers the trip or a search, not "Try again"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notCaptured()));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/Payment not completed/));
    expect(container.textContent).toMatch(/nothing has been booked/);
    expect(screen.getByRole('button', { name: /Back to your trip/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Search flights/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
    expect(container.textContent).not.toMatch(/Booking Failed/);
  });

  it('takes the customer back to the review page with the flight they were paying for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(402, { success: false, code: 'PAYMENT_NOT_FOUND', error: 'No payment was found for this booking.' })));
    const ReviewPage = () => <p>review of {useLocation().state?.flightData?.originalOffer?.itineraries?.[0]?.segments?.[0]?.number}</p>;
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
        <Routes>
          <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
          <Route path="/flights/booking-confirmation" element={<ReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Back to your trip/ }));

    expect(container.textContent).toMatch(/review of 614/);
  });

  it('checks again after a short wait when the gateway could not be reached, and books once it answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(notCaptured({ retryable: true, error: 'We could not reach the payment gateway to confirm your payment.' }))
      .mockResolvedValueOnce(reply(200, { success: true, pnr: 'ABC123', bookingReference: 'FLT1', ticketed: false }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderOrderPage();

    await flush();
    await flush();
    expect(container.textContent).toMatch(/Checking your payment/);
    expect(container.textContent).not.toMatch(/Booking Failed|Payment not completed/);

    await flush(15000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toMatch(/Reservation Held/);
  });

  it('stops checking after a few tries and offers to check again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn(async () => notCaptured({ retryable: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderOrderPage();

    await flush();
    for (let i = 0; i < 3; i += 1) await flush(15000);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toMatch(/We could not check your payment/);
    expect(container.textContent).toMatch(/we will confirm your booking or refund you by email/);
    expect(screen.getByRole('button', { name: /Check again/ })).toBeTruthy();

    await flush(60000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

/**
 * The order page opened with nothing to book.
 *
 * It said "Booking data not found. Please start your booking again." and sent
 * the customer to the flights page - a customer who had just paid included.
 */
describe('the order page with nothing to book', () => {
  it('names the payment reference checkout left, and says we will confirm or refund by email', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('pendingPaymentSession', JSON.stringify({ orderId: 'FLT9', sessionId: 'SESSION-1' }));
    const { container } = renderOrderPage(null);

    await waitFor(() => expect(container.textContent).toMatch(/We received your payment reference/));
    expect(container.textContent).toMatch(/Your payment reference is FLT9/);
    expect(container.textContent).toMatch(/confirm your booking or refund you by email/);
    expect(container.textContent).toMatch(/\(877\) 538-7380/);
    expect(container.textContent).not.toMatch(/start your booking again|Booking data not found/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the reference the payment page handed over when nothing else survived', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = renderOrderPage({ orderId: 'FLT7', transactionId: 'SI-7' });

    await waitFor(() => expect(container.textContent).toMatch(/Your payment reference is FLT7/));
  });

  it('with no reference at all, says where a paid booking will appear, and never to start again', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = renderOrderPage(null);

    await waitFor(() => expect(container.textContent).toMatch(/No booking in progress on this page/));
    expect(container.textContent).toMatch(/appear in My Trips/);
    expect(container.textContent).not.toMatch(/start your booking again/);
  });

  it('never books under an invented reference', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { orderId: _reference, ...withoutReference } = orderData;
    localStorage.setItem('pendingFlightBooking', JSON.stringify(withoutReference));
    const { container } = renderOrderPage(null);

    await waitFor(() => expect(container.textContent).toMatch(/No booking in progress on this page/));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Travellers' documents in localStorage.
 *
 * The review page's `pendingFlightBooking` (names, dates of birth, passport
 * numbers) was never removed, and this page wrote two more copies of the same
 * details that no page read.
 */
describe('what the order page leaves in the browser', () => {
  const draft = JSON.stringify({ passengerData: [{ firstName: 'Jane', passportNumber: 'X1234567', dateOfBirth: '1990-01-01' }] });

  it('removes the draft once the booking is made, and keeps no copy of it', async () => {
    localStorage.setItem('pendingFlightBooking', draft);
    localStorage.setItem('completedFlightBookings', JSON.stringify([{ passengerData: [{ passportNumber: 'OLD1234' }] }]));
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { success: true, pnr: 'ABC123', bookingReference: 'FLT1', ticketed: false })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/Reservation Held/));
    expect(localStorage.getItem('pendingFlightBooking')).toBeNull();
    expect(localStorage.getItem('completedFlightBookings')).toBeNull();
    expect(localStorage.getItem('completedFlightBooking')).toBeNull();
  });

  it('removes it when the server refuses the order too', async () => {
    localStorage.setItem('pendingFlightBooking', draft);
    vi.stubGlobal('fetch', vi.fn(async () => reply(402, { success: false, code: 'PAYMENT_NOT_CAPTURED', error: 'Payment for this booking has not been captured.' })));
    const { container } = renderOrderPage();

    await waitFor(() => expect(container.textContent).toMatch(/Payment not completed/));
    expect(localStorage.getItem('pendingFlightBooking')).toBeNull();
  });

  it('keeps it when no answer came, so reloading can still book', async () => {
    localStorage.setItem('pendingFlightBooking', draft);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    renderOrderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy());
    expect(localStorage.getItem('pendingFlightBooking')).toBe(draft);
  });

  it('writes no booking copies at all', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightCreateOrders.jsx'), 'utf8');
    expect(src).not.toMatch(/setItem\('completedFlightBooking/);
  });
});
