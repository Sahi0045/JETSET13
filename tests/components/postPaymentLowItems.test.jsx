import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelBooking: vi.fn() } }));

const { default: FlightETicket } = await import('../../frontend/src/Pages/Common/flights/FlightETicket.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

/**
 * The small things the audit found after payment: amounts converted out of the
 * USD that was charged, a pop-up that was not a dialog, a class nobody read, a
 * baggage allowance read off the wrong shape, raw database words on a travel
 * document, and money printed as "USD 512.4".
 */

const booking = {
  type: 'flight', bookingReference: 'FLT1', status: 'pending_ticketing', pnr: 'ABC123', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', amount: 512.4, currency: 'USD', baggage: '23kg',
  travelers: [{ id: '1', firstName: 'Ann', lastName: 'Lee' }],
};

describe('the travel document', () => {
  const text = () => render(<FlightETicket bookingData={booking} />).container.textContent;

  it('prints the status in words, the baggage allowance, and no bare " Class"', () => {
    const printed = text();
    expect(printed).not.toMatch(/pending_ticketing/i);
    expect(printed).toMatch(/Ticket pending/);
    expect(printed).toMatch(/23kg/);
    expect(printed).toMatch(/Cabin not recorded/);
    expect(printed).not.toMatch(/(^|[^a-z]) Class/);
  });

  it('prints the total charged in USD', () => {
    expect(text()).toMatch(/\$512\.40/);
  });
});

describe('the confirmation page', () => {
  it('shows the cabin the flight flow records', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData: { ...booking, cabinClass: 'PREMIUM_ECONOMY' } } }]}>
        <BookingConfirmation />
      </MemoryRouter>
    );
    expect(container.textContent).toMatch(/Class\s*premium economy/i);
  });
});

describe('Manage Booking', () => {
  const renderPage = () => {
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

  it('formats money as money', () => {
    const { container } = renderPage();
    expect(container.textContent).toMatch(/\$512\.40/);
    expect(container.textContent).not.toMatch(/USD 512\.4/);
  });

  it('opens the cancel pop-up as a labelled dialog with focus inside, and closes it on Escape', () => {
    renderPage();
    const trigger = screen.getAllByRole('button', { name: /Cancel Booking/ })[0];
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Cancel Booking' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement.textContent).toMatch(/Keep Booking/);
    expect(screen.getByLabelText('Reason for cancellation').tagName).toBe('SELECT');

    // Tab from the last control wraps to the first; Shift+Tab from the first to the last.
    const controls = dialog.querySelectorAll('button:not([disabled]), select:not([disabled])');
    controls[controls.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(controls[0]);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(controls[controls.length - 1]);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('My Trips', () => {
  it('shows amounts in the USD charged', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');
    expect(src).not.toMatch(/<Price /);
    expect(src).toMatch(/amt > 0 \? formatUsd\(amt\)/);
  });
});
