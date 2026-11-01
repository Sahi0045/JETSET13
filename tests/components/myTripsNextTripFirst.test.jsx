import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDateToISO } from '../../frontend/src/utils/dateUtils.js';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1', email: 'jane@example.com' }, isAuthenticated: true, loading: false }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));
vi.mock('../../frontend/src/utils/ticketDownload', () => ({ downloadTicketPdf: vi.fn() }));

const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

const inDays = (n) => {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return formatDateToISO(date);
};

const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];
const flight = (reference, origin, destination, departureDate, over = {}) => ({
  id: `id-${reference}`, type: 'flight', bookingReference: reference, orderId: reference, totalAmount: 420, amount: 420, currency: 'USD',
  paymentStatus: 'paid', payment_status: 'paid', pnr: `P${reference}`, origin, destination, departureDate,
  status: 'confirmed', tickets: [{ number: '607-7513754074', travelerId: '1' }], needs_review: null, gds: { ticketed: true }, queued: false,
  cancellation: null, voided_tickets: [], travelers: travellers, passengerData: travellers, cancel_failed: false,
  itineraries: [{
    direction: 'outbound', duration: 'PT2H10M', origin, destination, departureDate, arrivalDate: departureDate, stops: 0,
    segments: [{ flightNumber: 'EY128', carrierCode: 'EY', origin, destination, departureDate, departureTime: '21:10', arrivalDate: departureDate, arrivalTime: '23:20' }],
  }],
  ...over,
});

const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});

const showTrips = async (rows) => {
  vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('flights/bookings')
    ? reply(200, { success: true, data: rows })
    : reply(200, { success: true, data: [] }))));
  render(<MemoryRouter initialEntries={['/my-trips']}><MyTrips /></MemoryRouter>);
  await screen.findAllByText(/upcoming/i);
};

afterEach(() => vi.unstubAllGlobals());

describe('My Trips, next trip first', () => {
  it('leads with the soonest trip, its city and how many days are left', async () => {
    await showTrips([
      flight('LATER', 'BOM', 'DXB', inDays(30)),
      flight('SOON', 'MUC', 'DEL', inDays(9)),
    ]);

    const next = await screen.findByTestId('trip-SOON');
    expect(within(next).getByText('Your next trip')).toBeTruthy();
    expect(within(next).getByText('9 days')).toBeTruthy();
    expect(within(next).getByText('until you fly')).toBeTruthy();
    expect(within(next).getAllByText('New Delhi').length).toBeGreaterThan(0);

    const alsoComing = screen.getByText('Also coming up').closest('section');
    expect(within(alsoComing).getByTestId('trip-LATER')).toBeTruthy();
  });

  it('counts the trips in the bar at the top', async () => {
    await showTrips([
      flight('SOON', 'MUC', 'DEL', inDays(9)),
      flight('GONE', 'DEL', 'BOM', inDays(-40)),
      flight('OFF', 'DEL', 'GOI', inDays(20), { status: 'cancelled' }),
    ]);

    expect(screen.getByText('1 upcoming')).toBeTruthy();
    expect(screen.getByText(/1 past · 1 cancelled/)).toBeTruthy();
  });

  it('opens a booking row to its details and buttons', async () => {
    await showTrips([
      flight('SOON', 'MUC', 'DEL', inDays(9)),
      flight('LATER', 'BOM', 'DXB', inDays(30)),
    ]);

    const row = await screen.findByTestId('trip-LATER');
    expect(within(row).queryByTestId('trip-details')).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: /details/i }));

    expect(within(row).getByTestId('trip-details')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /manage trip/i })).toBeTruthy();
  });

  it('shows past trips as city cards, and one opens in the past list', async () => {
    await showTrips([
      flight('SOON', 'MUC', 'DEL', inDays(9)),
      flight('GONE', 'DEL', 'BOM', inDays(-40)),
    ]);

    const past = screen.getByText("Where you've been").closest('section');
    fireEvent.click(within(past).getByRole('button', { name: /Mumbai/ }));

    expect(await screen.findByRole('heading', { name: 'Past trips' })).toBeTruthy();
    expect(within(screen.getByTestId('trip-GONE')).getByTestId('trip-details')).toBeTruthy();
  });

  it('lists cancelled trips from the link under the trips, and goes back', async () => {
    await showTrips([
      flight('SOON', 'MUC', 'DEL', inDays(9)),
      flight('OFF', 'DEL', 'GOI', inDays(20), { status: 'cancelled' }),
    ]);

    expect(screen.queryByTestId('trip-OFF')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cancelled \(1\)/ }));

    expect(await screen.findByRole('heading', { name: 'Cancelled trips' })).toBeTruthy();
    expect(screen.getByTestId('trip-OFF')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /All trips/ }));
    expect(await screen.findByTestId('trip-SOON')).toBeTruthy();
  });

  it('says so when no trip is coming up, and offers a flight search', async () => {
    await showTrips([flight('GONE', 'DEL', 'BOM', inDays(-40))]);

    expect(screen.getByText('No trips coming up')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Search flights/ })).toBeTruthy();
  });

  it('shows one kind of booking at a time from the tabs at the top', async () => {
    await showTrips([
      flight('SOON', 'MUC', 'DEL', inDays(9)),
      { id: 'id-CRU', type: 'cruise', bookingReference: 'CRU1', orderId: 'CRU1', status: 'confirmed', amount: 1800, cruiseDestination: 'Bahamas', cruiseDepartureDate: inDays(20) },
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /Cruise/ }));

    expect(within(await screen.findByTestId('trip-CRU1')).getByText('Your next trip')).toBeTruthy();
    expect(screen.queryByTestId('trip-SOON')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Requests/ }));
    expect(await screen.findByRole('heading', { name: 'Your requests' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Flights/ }));
    expect(await screen.findByTestId('trip-SOON')).toBeTruthy();
    expect(screen.queryByTestId('trip-CRU1')).toBeNull();
  });
});
