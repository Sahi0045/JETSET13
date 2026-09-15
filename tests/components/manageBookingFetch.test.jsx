import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightETicket', () => ({
  default: React.forwardRef(() => null),
}));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelBooking: vi.fn() } }));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

/**
 * Manage Booking opened from My Trips.
 *
 * It preferred the booking My Trips handed over in router state - a copy from
 * whenever the list loaded - and did not fetch at all, so a booking cancelled
 * or ticketed since showed as it had been, even after a reload.
 */

const snapshot = {
  type: 'flight', bookingReference: 'FLT1', status: 'pending_ticketing', pnr: 'ABC123', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], source: 'database',
};
const fresh = { ...snapshot, status: 'confirmed', tickets: [{ number: '057-1000000001', travelerId: '1' }] };

const renderPage = (state) => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[{ pathname: '/manage-booking/FLT1', state }]}>
      <Routes>
        <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

describe('Manage Booking fetches by reference', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it('fetches even with a snapshot, using it only as a placeholder, and shows the fetched record', () => {
    mockUseFlightBooking.mockReturnValue({ data: fresh, isLoading: false, error: null, refetch: vi.fn() });
    const { container } = renderPage({ bookingData: snapshot });

    const [reference, options] = mockUseFlightBooking.mock.calls[0];
    expect(reference).toBe('FLT1');
    expect(options.enabled).toBe(true);
    expect(options.placeholderData).toEqual(snapshot);
    expect(container.textContent).toMatch(/Booking Status: Ticketed/);
  });

  it('shows the snapshot, and says it may be out of date, when the fetch fails', () => {
    mockUseFlightBooking.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Failed to fetch booking (500)'), refetch: vi.fn() });
    const { container } = renderPage({ bookingData: snapshot });

    expect(container.textContent).toMatch(/Booking Status: Ticket pending/);
    expect(container.textContent).toMatch(/could not refresh this booking/);
    expect(container.textContent).not.toMatch(/We couldn't open this booking/);
  });

  it('shows the error screen when there is nothing to show', () => {
    mockUseFlightBooking.mockReturnValue({ data: undefined, isLoading: false, error: new Error('We could not find this booking in your account.'), refetch: vi.fn() });
    const { container } = renderPage(undefined);

    expect(container.textContent).toMatch(/We couldn't open this booking/);
  });
});
