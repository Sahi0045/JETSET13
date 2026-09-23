import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');

/**
 * My Trips "View Details" on a booking that is not a trip any more.
 *
 * A cancelled booking, and a cancel that went through and could not be
 * recorded ("This booking is not valid for travel"), still had "N days until
 * your trip" under the heading. The countdown is for a trip someone is taking.
 */

const A = '220-1111111111';
const COUNTDOWN = /days until your trip|Your trip is today|Your trip is tomorrow/;

// As both booking reads send it (toClientBooking), and as My Trips keeps it.
const flight = (over = {}) => ({
  id: 'bk-1',
  type: 'flight',
  bookingReference: 'FLT1',
  orderId: 'FLT1',
  status: 'confirmed',
  totalAmount: 291,
  amount: 291,
  currency: 'USD',
  paymentStatus: 'paid',
  payment_status: 'paid',
  pnr: 'ABC123',
  origin: 'JFK',
  destination: 'LHR',
  departureDate: '2099-11-15',
  cancellation: null,
  tickets: [{ number: A, travelerId: '1' }],
  voided_tickets: [],
  needs_review: null,
  gds: { ticketed: true },
  source: 'database',
  ...over,
});

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const unrecordedFlag = {
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; check the airline and ARC Pay and record it by hand',
  no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false, unrecorded_cancellation: true,
};

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

describe('no countdown to a trip that is not being taken', () => {
  it.each([
    ['cancelled', () => flight({ status: 'cancelled', payment_status: 'refunded', paymentStatus: 'refunded', cancellation: { paymentAction: 'VOID', refundAmount: 291 } }), /Booking Cancelled/],
    ['cancelled, departing today', () => flight({ status: 'cancelled', departureDate: localToday() }), /Booking Cancelled/],
    ['cancelled and not recorded', () => flight({ needs_review: unrecordedFlag }), /This booking is not valid for travel/],
    ['cancelled and not recorded, departing today', () => flight({ needs_review: unrecordedFlag, departureDate: localToday() }), /This booking is not valid for travel/],
  ])('%s', (_label, make, heading) => {
    const text = confirmationText(make());

    expect(text).toMatch(heading);
    expect(text).not.toMatch(COUNTDOWN);
  });
});

// Fences: a trip that is going ahead keeps its countdown.
describe('next to it', () => {
  it('ticketed: "Booking Confirmed!" and the countdown, as before', () => {
    const text = confirmationText(flight());

    expect(text).toMatch(/Booking Confirmed!/);
    expect(text).toMatch(/days until your trip/);
  });

  it('ticketed, departing today: "Your trip is today!", as before', () => {
    expect(confirmationText(flight({ departureDate: localToday() }))).toMatch(/Your trip is today!/);
  });

  it('a reservation held for its ticket: the countdown, as before', () => {
    const text = confirmationText(flight({ status: 'pending_ticketing', tickets: [], gds: { ticketed: false } }));

    expect(text).toMatch(/Reservation Held/);
    expect(text).toMatch(/days until your trip/);
  });
});
