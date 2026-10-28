import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
  useBookedFeeRules: () => ({ isLoading: false, data: null }),
  useCancelQuote: () => ({ isLoading: false, data: null, refetch: () => {} }),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelBooking: vi.fn() } }));
vi.mock('../../frontend/src/utils/ticketDownload', () => ({ downloadTicketPdf: vi.fn() }));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

const ticketed = (over = {}) => ({
  type: 'flight', bookingReference: 'FLT1', status: 'confirmed', pnr: 'Q7XK2M', payment_status: 'paid',
  origin: 'SFO', destination: 'EWR', departureDate: '2099-01-15', tickets: [{ number: '016-7491175288', travelerId: '1' }], source: 'database',
  ...over,
});

const renderPage = (booking) => {
  mockUseFlightBooking.mockReturnValue({ data: booking, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/manage-booking/FLT1']}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('the booking code on Manage Booking', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it("shows the airline's own code, as the airline PNR, and ours as the GDS PNR", () => {
    renderPage(ticketed({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] }));

    expect(screen.getByText('Airline PNR')).toBeTruthy();
    expect(screen.getByText('H8KQ2P')).toBeTruthy();
    expect(screen.getByText('GDS PNR Q7XK2M')).toBeTruthy();
  });

  it('calls our code a PNR while the airline has not sent its own', () => {
    renderPage(ticketed());

    expect(screen.getByText('Booking code (PNR)')).toBeTruthy();
    expect(screen.getByText('Q7XK2M')).toBeTruthy();
    expect(screen.queryByText('Airline PNR')).toBeNull();
  });
});
