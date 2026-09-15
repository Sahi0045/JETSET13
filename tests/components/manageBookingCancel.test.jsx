import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();
const mockCancelBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightETicket', () => ({
  default: React.forwardRef(() => null),
}));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: { cancelFlightBooking: (...args) => mockCancelBooking(...args) },
}));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

/**
 * Cancelling from Manage Booking when the server is slow to answer.
 *
 * The request gave up after 10 seconds while the cancel went through, the page
 * showed "timeout of 10000ms exceeded", and it showed it at the bottom of the
 * page, below the fold on a phone.
 */

const booking = {
  type: 'flight', bookingReference: 'FLT1', status: 'pending_ticketing', pnr: 'ABC123', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', amount: 291, currency: 'USD',
};

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/manage-booking/FLT1']}>
      <Routes>
        <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

const cancelThroughThePopUp = () => {
  fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);
  const buttons = screen.getAllByRole('button', { name: /^Cancel Booking$/ });
  fireEvent.click(buttons[buttons.length - 1]);
};

describe('a cancel that times out', () => {
  let refetch;
  beforeEach(() => {
    refetch = vi.fn();
    mockUseFlightBooking.mockReturnValue({ data: booking, isLoading: false, error: null, refetch });
    mockCancelBooking.mockResolvedValue({ success: false, timedOut: true, error: 'We did not get an answer in time.' });
  });

  it('reloads the booking and, when the cancel went through, says so at the top with focus on it', async () => {
    refetch.mockResolvedValue({ data: { ...booking, status: 'cancelled', cancellation: { paymentAction: 'REFUND', refundAmount: 291, currency: 'USD' } } });
    const { container } = renderPage();

    cancelThroughThePopUp();

    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('status'));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(document.activeElement.textContent).toMatch(/Booking Cancelled/);
    const text = container.textContent;
    expect(text.indexOf('Booking Cancelled')).toBeLessThan(text.indexOf('Flight Details'));
    expect(text).not.toMatch(/timeout of|exceeded/);
  });

  it('says the cancellation is not confirmed when the booking still shows active', async () => {
    refetch.mockResolvedValue({ data: booking });
    const { container } = renderPage();

    cancelThroughThePopUp();

    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('alert'));
    expect(document.activeElement.textContent).toMatch(/Cancellation Not Confirmed/);
    expect(document.activeElement.textContent).toMatch(/still shows as active/);
    expect(container.textContent).not.toMatch(/timeout of|exceeded/);
  });
});

describe('where a flight is cancelled', () => {
  it('cancels on the flights host, with the reference and the email the guest proved', async () => {
    mockUseFlightBooking.mockReturnValue({ data: booking, isLoading: false, error: null, refetch: vi.fn() });
    mockCancelBooking.mockResolvedValue({ success: true, cancellation: { paymentAction: 'VOID' } });
    renderPage();

    cancelThroughThePopUp();

    await waitFor(() => expect(mockCancelBooking).toHaveBeenCalledTimes(1));
    expect(mockCancelBooking.mock.calls[0][0]).toBe('FLT1');
    expect(mockCancelBooking.mock.calls[0][2]).toBe('Change of plans');
  });

  it('My Trips cancels a flight through the same call', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const trips = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');
    expect(trips).toMatch(/result = await ArcPayService\.cancelFlightBooking\(ref, userEmail, 'Customer request'\)/);
    expect(trips).not.toMatch(/method: 'DELETE'/);
  });
});
