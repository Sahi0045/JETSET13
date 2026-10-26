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

const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

/** My Trips says what a flight cancel returns before the customer says yes. */

const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];
const held = {
  id: 'bk-1', type: 'flight', bookingReference: 'FLTQ1', orderId: 'FLTQ1', totalAmount: 300, amount: 300, currency: 'USD',
  paymentStatus: 'paid', payment_status: 'paid', pnr: 'Q1PNR', origin: 'JFK', destination: 'LHR', departureDate: '2099-11-15',
  status: 'pending_ticketing', tickets: [], needs_review: null, gds: { ticketed: false }, queued: false, cancellation: null,
  voided_tickets: [], travelers: travellers, passengerData: travellers, cancel_failed: false,
};
const quote = {
  policy: 'not_ticketed', paid: 300, serviceFeeKept: 12.5, airlinePrice: 287.5, refundAmount: 287.5,
  penalty: null, penaltyCurrency: null, cancellationFee: null, freeUntil: null,
};
const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});

afterEach(() => vi.unstubAllGlobals());

describe('the My Trips cancel confirm', () => {
  it('gives the amount the cancel returns, from the server quote', async () => {
    const fetch = vi.fn(async (url) => {
      if (String(url).includes('/cancel-quote')) return reply(200, { success: true, quote });
      if (String(url).includes('flights/bookings')) return reply(200, { success: true, data: [held] });
      return reply(200, { success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetch);
    render(<MemoryRouter initialEntries={['/my-trips']}><MyTrips /></MemoryRouter>);

    const card = await screen.findByTestId('trip-FLTQ1');
    fireEvent.click(await within(card).findByRole('button', { name: /cancel booking/i }));

    expect(await within(card).findByText('No ticket has been issued yet. You get back $287.50; the $12.50 service fee is not refundable.')).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('flights/bookings/FLTQ1/cancel-quote'))).toBe(true);
  });
});
