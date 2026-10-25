import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1', email: 'jane@example.com' }, isAuthenticated: true, loading: false }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));
const downloadTicketPdf = vi.fn();
vi.mock('../../frontend/src/utils/ticketDownload', () => ({ downloadTicketPdf: (...args) => downloadTicketPdf(...args) }));

const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];
const trip = (over = {}) => ({
  id: 'bk-1', type: 'flight', bookingReference: 'FLTQ1', orderId: 'FLTQ1', totalAmount: 300, amount: 300, currency: 'USD',
  paymentStatus: 'paid', payment_status: 'paid', pnr: 'Q1PNR', origin: 'JFK', destination: 'LHR', departureDate: '2099-11-15',
  status: 'confirmed', tickets: [{ number: '057-1000000001', travelerId: '1' }], needs_review: null, gds: { ticketed: true }, queued: false, cancellation: null,
  voided_tickets: [], travelers: travellers, passengerData: travellers, cancel_failed: false,
  ...over,
});
const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});
const showTrips = (rows) => {
  vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('flights/bookings')
    ? reply(200, { success: true, data: rows })
    : reply(200, { success: true, data: [] }))));
  render(<MemoryRouter initialEntries={['/my-trips']}><MyTrips /></MemoryRouter>);
};

afterEach(() => vi.unstubAllGlobals());

describe('the e-ticket in My Trips', () => {
  it('downloads from the trip card', async () => {
    downloadTicketPdf.mockResolvedValue(undefined);
    showTrips([trip()]);

    const card = (await screen.findByText('#FLTQ1')).closest('.group');
    fireEvent.click(within(card).getByRole('button', { name: /Download E-Ticket/ }));

    await waitFor(() => expect(downloadTicketPdf).toHaveBeenCalledWith('FLTQ1', expect.anything()));
  });

  it('is not offered for a held seat whose payment went back', async () => {
    showTrips([trip({ status: 'pending_ticketing', tickets: [], gds: { ticketed: false }, payment_status: 'refunded', paymentStatus: 'refunded' })]);

    const card = (await screen.findByText('#FLTQ1')).closest('.group');
    expect(within(card).queryByRole('button', { name: /Download/ })).toBeNull();
  });
});
