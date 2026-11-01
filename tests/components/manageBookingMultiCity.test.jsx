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
  useBookedFeeRules: () => ({ isLoading: false, data: null }),
  useCancelQuote: () => ({ isLoading: false, data: null, refetch: () => {} }),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelBooking: vi.fn() } }));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

const leg = (origin, destination, date, number) => ({
  direction: 'onward', origin, destination, departureDate: date, arrivalDate: date, stops: 0, duration: 'PT4H',
  segments: [{ flightNumber: `EK${number}`, carrierCode: 'EK', origin, destination, departureDate: date, departureTime: '09:00', arrivalDate: date, arrivalTime: '13:00' }],
});

const multiCity = {
  type: 'flight', bookingReference: 'FLT1', status: 'confirmed', pnr: 'ABC123', payment_status: 'paid',
  origin: 'DEL', destination: 'DXB', departureDate: '2099-11-24', tickets: [], source: 'database',
  itineraries: [leg('DEL', 'DXB', '2099-11-24', '511'), leg('DXB', 'LHR', '2099-11-28', '3'), leg('LHR', 'DEL', '2099-12-05', '6')],
};

describe('Manage Booking for a multi-city trip', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it('names the whole route, not just the first flight', () => {
    mockUseFlightBooking.mockReturnValue({ data: multiCity, isLoading: false, error: null, refetch: vi.fn() });
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/manage-booking/FLT1' }]}>
          <Routes>
            <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(container.textContent).toMatch(/Multi-city: DEL → DXB → LHR → DEL/);
    expect(container.textContent).not.toMatch(/Return/);
  });
});
