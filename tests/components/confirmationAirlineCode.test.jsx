import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/utils/ticketDownload', () => ({ downloadTicketPdf: vi.fn() }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');

const booking = (over = {}) => ({
  type: 'flight', bookingReference: 'FLTNUM8', status: 'confirmed', pnr: 'Q7XK2M', payment_status: 'paid', amount: 291,
  origin: 'SFO', destination: 'EWR', departureDate: '2099-01-15', email: 'jane@example.com',
  tickets: [{ number: '016-1000000001', travelerId: '1' }], source: 'database',
  ...over,
});

const renderPage = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
);

describe('the booking code on the confirmation page', () => {
  it("shows the airline's own code, as the airline PNR, and ours as the GDS PNR", () => {
    renderPage(booking({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] }));

    expect(screen.getByText('Airline PNR')).toBeTruthy();
    expect(screen.getByText('H8KQ2P').className).not.toMatch(/blue/);
    expect(screen.getByText('GDS PNR Q7XK2M')).toBeTruthy();
  });

  it('calls our code a PNR while the airline has not sent its own', () => {
    renderPage(booking());

    expect(screen.getByText('Booking code (PNR)')).toBeTruthy();
    expect(screen.getByText('Q7XK2M')).toBeTruthy();
  });
});
