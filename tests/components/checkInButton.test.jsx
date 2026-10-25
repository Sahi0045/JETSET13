import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1', email: 'jane@example.com' }, isAuthenticated: true, loading: false }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];
const flight = (departureDate) => ({
  carrierCode: 'UA', flightNumber: 'UA20', origin: 'SFO', destination: 'EWR', departureDate, departureTime: '10:00', arrivalDate: departureDate, arrivalTime: '18:30',
});
const trip = (over = {}) => {
  const departureDate = over.departureDate || '2099-12-01';
  return {
    id: 'bk-1', type: 'flight', bookingReference: 'FLTQ1', orderId: 'FLTQ1', totalAmount: 300, amount: 300, currency: 'USD',
    paymentStatus: 'paid', payment_status: 'paid', pnr: 'Q7XK2M', origin: 'SFO', destination: 'EWR', departureDate,
    status: 'confirmed', tickets: [{ number: '016-1000000001', travelerId: '1' }], gds: { ticketed: true }, queued: false, cancellation: null,
    voided_tickets: [], travelers: travellers, passengerData: travellers, source: 'database',
    airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }],
    itineraries: [{ direction: 'outbound', origin: 'SFO', destination: 'EWR', departureDate, arrivalDate: departureDate, stops: 0, segments: [flight(departureDate)] }],
    ...over,
  };
};

const manageBooking = (booking) => {
  mockUseFlightBooking.mockReturnValue({ data: booking, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/manage-booking/FLTQ1']}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});

afterEach(() => vi.unstubAllGlobals());

describe('the check-in button on Manage Booking', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it("opens the airline's own check-in page in a new tab, with the code to use", () => {
    manageBooking(trip());

    const link = screen.getByRole('link', { name: /Check in with United/ });
    expect(link.getAttribute('href')).toBe('https://www.united.com/en/us/checkin');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(within(link.closest('[data-check-in]')).getByText('H8KQ2P')).toBeTruthy();
    expect(screen.getByText('Opens 24 hours before departure')).toBeTruthy();
  });

  it('copies the code', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    manageBooking(trip());

    fireEvent.click(screen.getByRole('button', { name: 'Copy H8KQ2P' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('H8KQ2P'));
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('is not offered before the ticket is issued, after the trip, or after a cancel', () => {
    manageBooking(trip({ tickets: [], status: 'pending_ticketing', gds: { ticketed: false } }));
    expect(screen.queryByRole('link', { name: /Check in with/ })).toBeNull();
  });

  it('is not offered once the trip has flown', () => {
    manageBooking(trip({ departureDate: '2020-01-10' }));
    expect(screen.queryByRole('link', { name: /Check in with/ })).toBeNull();
  });
});

describe('the check-in button on My Trips', () => {
  it('is on an upcoming ticketed trip', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('flights/bookings')
      ? reply(200, { success: true, data: [trip()] })
      : reply(200, { success: true, data: [] }))));
    render(<MemoryRouter initialEntries={['/my-trips']}><MyTrips /></MemoryRouter>);

    const card = within((await screen.findByText('#FLTQ1')).closest('.group'));
    expect(card.getByRole('link', { name: /Check in with United/ }).getAttribute('href')).toBe('https://www.united.com/en/us/checkin');
  });
});
