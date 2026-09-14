import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FlightETicket from '../../frontend/src/Pages/Common/flights/FlightETicket.jsx';

/**
 * The document Manage Booking downloads, as rendered.
 *
 *  - A cancelled booking's document still said "E-Ticket" and printed every
 *    ticket number - voided or refunded tickets, on a page a customer could
 *    carry to an airport.
 *  - With an infant on a lap, the adult's and the infant's tickets named the
 *    same passenger, and a traveller could be printed someone else's number.
 */

const travellers = [
  { id: '1', firstName: 'Ann', lastName: 'Lee' },
  { id: '2', firstName: 'Mia', lastName: 'Lee' },
];
const tickets = [
  { number: '057-1000000001', travelerId: '1' },
  { number: '057-2000000002', travelerId: '2' },
];

const textOf = (bookingData) => render(<FlightETicket bookingData={bookingData} />).container.textContent;

describe('the travel document', () => {
  it('for a cancelled booking prints no ticket number and says it is not valid for travel', () => {
    const text = textOf({ status: 'cancelled', pnr: 'ABC123', bookingReference: 'FLT1', tickets, travelers: travellers, payment_status: 'refunded' });

    expect(text).toMatch(/Cancelled Booking/);
    expect(text).toMatch(/not valid for travel/);
    expect(text).not.toMatch(/057-1000000001|057-2000000002/);
    expect(text).not.toMatch(/E-Ticket/);
    expect(text).not.toMatch(/Payment Confirmed/);
  });

  it('for a ticketed booking still prints each traveller their own number', () => {
    const text = textOf({ status: 'confirmed', pnr: 'ABC123', bookingReference: 'FLT1', tickets, travelers: travellers, payment_status: 'paid' });

    expect(text).toMatch(/E-Ticket/);
    expect(text).toMatch(/Ticket #: 057-1000000001/);
    expect(text).toMatch(/Ticket #: 057-2000000002/);
  });

  it('prints "number pending" rather than a number that could be another traveller\'s', () => {
    // Saved before infant tickets were told apart: both name the adult.
    const ambiguous = [
      { number: '057-1000000001', travelerId: '1' },
      { number: '057-3000000003', travelerId: '1' },
    ];

    const text = textOf({ status: 'confirmed', pnr: 'ABC123', bookingReference: 'FLT1', tickets: ambiguous, travelers: travellers });

    expect(text).not.toMatch(/057-/);
    expect(text.match(/number pending/g)).toHaveLength(2);
  });
});
