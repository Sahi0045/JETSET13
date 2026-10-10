import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();
const mockUseCancelQuote = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightETicket', () => ({
  default: React.forwardRef(() => null),
}));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
  useBookedFeeRules: () => ({ isLoading: false, data: null }),
  useCancelQuote: (...args) => mockUseCancelQuote(...args),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: { cancelFlightBooking: vi.fn() },
}));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

/**
 * The cancel dialog says what the cancel returns before the customer confirms
 * it, and asks the server only once the dialog is open.
 */

const booking = {
  type: 'flight', bookingReference: 'FLT1', status: 'pending_ticketing', pnr: 'ABC123', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', amount: 300, currency: 'USD',
};
const quote = {
  policy: 'not_ticketed', paid: 300, serviceFeeKept: 12.5, airlinePrice: 287.5, refundAmount: 287.5,
  penalty: null, penaltyCurrency: null, cancellationFee: null, freeUntil: null,
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

const lastEnabled = () => mockUseCancelQuote.mock.calls.at(-1)?.[1]?.enabled;

beforeEach(() => {
  mockUseFlightBooking.mockReturnValue({ data: booking, isLoading: false, error: null, refetch: vi.fn() });
  mockUseCancelQuote.mockReset();
  mockUseCancelQuote.mockReturnValue({ isLoading: false, data: quote });
});

describe('the cancel dialog', () => {
  it('does not ask for the quote until the dialog opens', () => {
    renderPage();
    expect(lastEnabled()).toBe(false);

    fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);

    expect(lastEnabled()).toBe(true);
  });

  it('says what the cancel returns before the customer confirms', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);

    expect(screen.getByText('No ticket has been issued yet. You get back $287.50; the $12.50 service fee is not refundable.')).toBeTruthy();
    expect(screen.queryByText(/so no cancellation fee applies and what you paid is returned/)).toBeNull();
  });

  it('says it could not work the refund out, and still lets the customer cancel', () => {
    mockUseCancelQuote.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);

    expect(screen.getByText(/We could not work out your refund just now/)).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: /^Cancel Booking$/ });
    expect(buttons[buttons.length - 1].disabled).toBe(false);
  });
});

describe('the refund breakdown after a customer cancel', () => {
  const cancelled = (cancellation) => ({ ...booking, status: 'cancelled', payment_status: 'partially_refunded', cancellation });

  it('calls a kept service fee a service fee', () => {
    mockUseFlightBooking.mockReturnValue({
      data: cancelled({
        paymentAction: 'PARTIAL_REFUND', refundAmount: 287.5, cancellationFee: 12.5, currency: 'USD',
        policy: 'free_window', terms: { serviceFeeKept: 12.5, airlinePrice: 287.5 },
      }),
      isLoading: false, error: null, refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('Service fee (not refundable)')).toBeTruthy();
    expect(screen.queryByText('Cancellation Fee')).toBeNull();
  });

  it('keeps the cancellation fee label for a staff cancel', () => {
    mockUseFlightBooking.mockReturnValue({
      data: cancelled({ paymentAction: 'PARTIAL_REFUND', refundAmount: 250, cancellationFee: 50, currency: 'USD' }),
      isLoading: false, error: null, refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('Cancellation Fee')).toBeTruthy();
  });
});
