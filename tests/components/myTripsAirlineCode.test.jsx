import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1', email: 'jane@example.com' }, isAuthenticated: true, loading: false }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));
vi.mock('../../frontend/src/utils/ticketDownload', () => ({ downloadTicketPdf: vi.fn() }));

const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];
const trip = (over = {}) => ({
  id: 'bk-1', type: 'flight', bookingReference: 'FLTQ1', orderId: 'FLTQ1', totalAmount: 300, amount: 300, currency: 'USD',
  paymentStatus: 'paid', payment_status: 'paid', pnr: 'Q7XK2M', origin: 'SFO', destination: 'EWR', departureDate: '2099-11-15',
  status: 'confirmed', tickets: [{ number: '016-1000000001', travelerId: '1' }], needs_review: null, gds: { ticketed: true }, queued: false, cancellation: null,
  voided_tickets: [], travelers: travellers, passengerData: travellers, cancel_failed: false,
  ...over,
});
const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});
const cardFor = async (rows) => {
  vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('flights/bookings')
    ? reply(200, { success: true, data: rows })
    : reply(200, { success: true, data: [] }))));
  render(<MemoryRouter initialEntries={['/my-trips']}><MyTrips /></MemoryRouter>);
  const trip = await screen.findByTestId('trip-FLTQ1');
  fireEvent.click(within(trip).getByRole('button', { name: /booking details/i }));
  return within(within(trip).getByTestId('trip-details'));
};

afterEach(() => vi.unstubAllGlobals());

describe('the booking code on a My Trips card', () => {
  it("shows the airline's own code, as the airline PNR, and ours as the GDS PNR", async () => {
    const card = await cardFor([trip({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] })]);

    expect(card.getByText('Airline PNR')).toBeTruthy();
    expect(card.getByText('H8KQ2P')).toBeTruthy();
    expect(card.getByText('GDS PNR Q7XK2M')).toBeTruthy();
  });

  it('prints the ticket number as one run of digits', async () => {
    const card = await cardFor([trip()]);

    expect(card.getByText('0161000000001')).toBeTruthy();
    expect(card.queryByText(/016-1000000001/)).toBeNull();
  });

  it('calls our code a PNR while the airline has not sent its own', async () => {
    const card = await cardFor([trip()]);

    expect(card.getByText('Booking code (PNR)')).toBeTruthy();
    expect(card.getByText('Q7XK2M')).toBeTruthy();
  });
});
