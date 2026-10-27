import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

/**
 * Manage Booking, polished. Its flight route read "EY EY128": the booking
 * stores the airline as its code, and the flight number carries it too.
 */

const booking = (over = {}) => ({
  type: 'flight', bookingReference: 'FLTE5D2CF23972C40', orderId: 'FLTE5D2CF23972C40', status: 'confirmed', pnr: 'CA5QGL',
  payment_status: 'paid', origin: 'MUC', destination: 'DEL', originCity: 'Munich', destinationCity: 'New Delhi',
  departureDate: '2099-11-04', airline: 'EY', airlineName: 'EY', flightNumber: 'EY128', amount: 2185.17,
  tickets: [{ number: '607-7513754074', travelerId: '1' }], source: 'database',
  ...over,
});

const renderPage = (data) => {
  mockUseFlightBooking.mockReturnValue({ data, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/manage-booking/FLTE5D2CF23972C40']}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  mockUseFlightBooking.mockReset();
  vi.unstubAllGlobals();
});

describe('Manage Booking', () => {
  it('names the airline once, by name, beside the flight number', () => {
    const { container } = renderPage(booking());
    expect(container.textContent).not.toMatch(/EY EY128/);
    expect(container.textContent).toMatch(/Etihad EY128/);
  });

  it('says where and when the trip is, under the title', () => {
    renderPage(booking());
    expect(screen.getByText('Munich → New Delhi · Wed, Nov 4, 2099')).toBeTruthy();
  });

  it('can copy the booking reference from the header', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderPage(booking());

    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Copy booking reference' })[0]); });
    expect(writeText).toHaveBeenCalledWith('FLTE5D2CF23972C40');
  });
});
