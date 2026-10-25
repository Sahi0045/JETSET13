import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();
const downloadTicketPdf = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
  useBookedFeeRules: () => ({ isLoading: false, data: null }),
  useCancelQuote: () => ({ isLoading: false, data: null, refetch: () => {} }),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelBooking: vi.fn() } }));
vi.mock('../../frontend/src/utils/ticketDownload', () => ({ downloadTicketPdf: (...args) => downloadTicketPdf(...args) }));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

const ticketed = {
  type: 'flight', bookingReference: 'FLT1', status: 'confirmed', pnr: 'ABC123', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [{ number: '057-1000000001', travelerId: '1' }], source: 'database',
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

describe('the e-ticket on Manage Booking', () => {
  beforeEach(() => {
    mockUseFlightBooking.mockReset();
    downloadTicketPdf.mockReset();
    mockUseFlightBooking.mockReturnValue({ data: ticketed, isLoading: false, error: null, refetch: vi.fn() });
  });

  it('downloads the PDF the server draws', async () => {
    downloadTicketPdf.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Download E-Ticket/ }));

    await waitFor(() => expect(downloadTicketPdf).toHaveBeenCalledWith('FLT1', expect.objectContaining({})));
  });

  it("says why when the ticket can't be downloaded", async () => {
    downloadTicketPdf.mockRejectedValue(new Error('This booking has no travel document to download.'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Download E-Ticket/ }));

    expect(await screen.findByText('This booking has no travel document to download.')).toBeTruthy();
  });
});
