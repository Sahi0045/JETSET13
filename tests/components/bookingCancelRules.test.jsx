import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Manage Booking's "Cancel & change": what cancelling does now, by ticket
 * state, and the airline's fee table read from the booking's PNR.
 */
vi.mock('../../frontend/src/Services/CurrencyService', () => ({
  default: { getExchangeRate: () => 1, hasLiveRates: () => true },
}));

const { default: BookingCancelRules } = await import('../../frontend/src/Pages/Common/flights/BookingCancelRules.jsx');

const cell = (allowed, amount = null) => ({ allowed, amount, varies: false });
const table = {
  currency: 'USD',
  bookBy: null,
  change: { before: cell(true, 336), noShowBefore: cell(true, 336), after: cell(false, 0), noShowAfter: cell(false, 0) },
  refund: { before: cell(false, 0), noShowBefore: cell(false, 0), after: cell(false, 0), noShowAfter: cell(false, 0) },
};
const held = { type: 'flight', status: 'pending_ticketing', pnr: 'AK2HNS', airlineName: 'Lufthansa', tickets: [] };

describe('Cancel & change on Manage Booking', () => {
  it('says what cancelling does now and once the ticket is issued, over the airline table', () => {
    render(<BookingCancelRules booking={held} feeRules={{ isLoading: false, data: table }} canCancel />);
    expect(screen.getByText('No ticket has been issued yet, so no cancellation fee applies and what you paid is returned.')).toBeTruthy();
    expect(screen.getByText("Once the ticket is issued, Lufthansa's rules apply: not refundable; a date change costs US$336 per adult plus any fare difference.")).toBeTruthy();
    expect(screen.getByText('Cancel or change: airline fees')).toBeTruthy();
  });

  it('says so when the airline table cannot be read', () => {
    render(<BookingCancelRules booking={held} feeRules={{ isLoading: false, data: null }} canCancel />);
    expect(screen.getByText(/fee table for this fare is not available right now/)).toBeTruthy();
    expect(screen.queryByText('Cancel or change: airline fees')).toBeNull();
  });

  it('shows no rules for a cancelled booking', () => {
    render(<BookingCancelRules booking={{ ...held, status: 'cancelled' }} feeRules={{ isLoading: false, data: null }} canCancel />);
    expect(screen.getByText('This booking is cancelled, so these rules no longer apply.')).toBeTruthy();
    expect(screen.queryByText(/No ticket has been issued yet/)).toBeNull();
  });

  it('names no airline from a bare carrier code, which is what bookings store', () => {
    render(<BookingCancelRules booking={{ ...held, airlineName: 'LH' }} feeRules={{ isLoading: false, data: table }} canCancel />);
    expect(screen.getByText("Once the ticket is issued, the airline's rules apply: not refundable; a date change costs US$336 per adult plus any fare difference.")).toBeTruthy();
  });

  it('says the booking cannot be cancelled online when the page offers no Cancel', () => {
    render(<BookingCancelRules booking={held} feeRules={{ isLoading: false, data: table }} canCancel={false} />);
    expect(screen.getByText('This booking cannot be cancelled online. For a change or a cancellation, call (877) 538-7380 with your booking reference.')).toBeTruthy();
    expect(screen.queryByText(/No ticket has been issued yet/)).toBeNull();
    expect(screen.queryByText('Cancel or change: airline fees')).toBeNull();
  });

  it('shows no table, and no "not available", for a booking with no airline reservation', () => {
    render(<BookingCancelRules booking={{ ...held, pnr: null }} feeRules={{ isLoading: false, data: null }} canCancel />);
    expect(screen.getByText('No ticket has been issued yet, so no cancellation fee applies and what you paid is returned.')).toBeTruthy();
    expect(screen.queryByText(/not available right now/)).toBeNull();
  });
});

