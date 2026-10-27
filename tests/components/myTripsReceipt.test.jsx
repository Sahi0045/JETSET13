import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TripDetails } from '../../frontend/src/Pages/Common/login/myTrips/TripDetails.jsx';

/**
 * A trip's booking and payment details. They were one flat list in which the
 * airline's code, the ticket and the amount paid all read like "Cabin", with
 * nothing to copy a code with. The code and the amount are set large, the trip
 * facts are chips, and every code can be copied.
 */

const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];
const trip = (over = {}) => ({
  id: 'bk-1', type: 'flight', bookingReference: 'FLTE5D2CF23972C40', orderId: 'FLTE5D2CF23972C40', totalAmount: 2185.17, amount: 2185.17,
  currency: 'USD', pnr: 'CA5QGL', origin: 'MUC', destination: 'DEL', departureDate: '2099-11-04', status: 'confirmed',
  tickets: [{ number: '607-7513754074', travelerId: '1' }], gds: { ticketed: true }, voided_tickets: [], travelers: travellers,
  passengerData: travellers, transactionId: '629909187265', baggage: '35KG', cabinClass: 'BUSINESS', bookingDate: '2026-10-26',
  ...over,
});

const details = (booking = trip()) => {
  render(<TripDetails booking={booking} />);
  return within(screen.getByTestId('trip-details'));
};

afterEach(() => vi.unstubAllGlobals());

describe("a trip's booking and payment details", () => {
  it('can copy the booking code, the e-ticket, the reference and the transaction ID', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const panel = details();

    for (const [name, value] of [
      [/^Copy (Airline booking code|Booking code \(PNR\))$/, 'CA5QGL'],
      ['Copy E-ticket', '607-7513754074'],
      ['Copy Reference', 'FLTE5D2CF23972C40'],
      ['Copy Transaction ID', '629909187265'],
    ]) {
      await act(async () => { fireEvent.click(panel.getByRole('button', { name })); });
      expect(writeText).toHaveBeenLastCalledWith(value);
    }
  });

  it('shows the cabin, travellers and baggage as chips, in words', () => {
    const panel = details();
    const chips = within(panel.getByRole('list', { name: 'Trip facts' }));
    expect(chips.getByText('1 traveller')).toBeTruthy();
    expect(chips.getByText('35 kg checked')).toBeTruthy();
  });

  it('offers nothing to copy where there is no number', () => {
    const panel = details(trip({ transactionId: null }));
    expect(panel.queryByRole('button', { name: 'Copy Transaction ID' })).toBeNull();
    expect(panel.getByText('N/A')).toBeTruthy();
  });
});
