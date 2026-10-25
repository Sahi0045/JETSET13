import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const downloadTicketPdf = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/utils/ticketDownload', () => ({ downloadTicketPdf: (...args) => downloadTicketPdf(...args) }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');

const booking = (over = {}) => ({
  type: 'flight', bookingReference: 'FLTNUM8', status: 'confirmed', pnr: 'NUM888', payment_status: 'paid', amount: 291,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', email: 'jane@example.com',
  tickets: [{ number: '057-1000000001', travelerId: '1' }], source: 'database',
  ...over,
});

const renderPage = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
);

describe('the e-ticket on the confirmation page', () => {
  it('can be downloaded once the ticket is issued', async () => {
    downloadTicketPdf.mockResolvedValue(undefined);
    renderPage(booking());

    fireEvent.click(screen.getByRole('button', { name: /Download E-Ticket/ }));

    await waitFor(() => expect(downloadTicketPdf).toHaveBeenCalledWith('FLTNUM8', { email: 'jane@example.com' }));
  });

  it('is offered as a booking confirmation while the ticket is pending', () => {
    renderPage(booking({ tickets: [], status: 'pending_ticketing', gds: { ticketed: false } }));

    expect(screen.getByRole('button', { name: /Download Booking Confirmation/ })).toBeTruthy();
  });

  it('is not offered for a booking the airline does not hold', () => {
    renderPage(booking({ pnr: null, tickets: [], status: 'pending' }));

    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
  });

  it("says why when the PDF can't be prepared", async () => {
    downloadTicketPdf.mockRejectedValue(new Error('We could not prepare your ticket. Please try again.'));
    renderPage(booking());

    fireEvent.click(screen.getByRole('button', { name: /Download E-Ticket/ }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'We could not prepare your ticket. Please try again.');
  });
});
