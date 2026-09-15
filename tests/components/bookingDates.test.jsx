import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import BookingConfirmation from '../../frontend/src/Pages/Common/BookingConfirmation.jsx';
import FlightETicket from '../../frontend/src/Pages/Common/flights/FlightETicket.jsx';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

/**
 * The booking pages on the morning of a New York departure.
 *
 * "2026-11-15" read as UTC midnight is 19:00 on the 14th in New York, so the
 * confirmation page printed the 14th and hid the countdown (the trip looked a
 * day in the past), and the travel document printed the day before too.
 */
describe('booking pages in New York', () => {
  let originalTz;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });
  afterEach(() => vi.useRealTimers());

  const flight = {
    type: 'flight', bookingReference: 'FLT1', status: 'pending_ticketing', pnr: 'ABC123',
    origin: 'JFK', destination: 'LHR', departureDate: '2026-11-15', payment_status: 'paid',
  };

  it('the confirmation page counts down to today and prints the day booked', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 9, 0));

    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData: flight } }]}>
        <BookingConfirmation />
      </MemoryRouter>
    );

    expect(container.textContent).toMatch(/Your trip is today/);
    expect(container.textContent).toMatch(/Sun, Nov 15, 2026/);
    expect(container.textContent).not.toMatch(/Nov 14/);
  });

  it('the travel document prints the day booked', () => {
    const { container } = render(<FlightETicket bookingData={flight} />);

    expect(container.textContent).toMatch(/Sunday, November 15, 2026/);
    expect(container.textContent).not.toMatch(/November 14/);
  });
});

describe('no booking page parses a travel date as UTC', () => {
  const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

  it('My Trips counts days and sorts Past from the calendar day', () => {
    const src = read('frontend/src/Pages/Common/login/mytrips.jsx');
    expect(src).not.toMatch(/new Date\(travelDate\)/);
    expect(src).not.toMatch(/new Date\(request\.(flight_departure_date|hotel_checkin_date|cruise_departure_date|package_start_date)\)/);
    expect(src).toMatch(/daysUntilDate\(travelDate\)/);
  });

  it('Manage Booking decides Cancel and prints dates from the calendar day', () => {
    const src = read('frontend/src/Pages/Common/flights/ManageBooking.jsx');
    expect(src).not.toMatch(/new Date\(bookingData\.(departureDate|arrivalDate)/);
    expect(src).toMatch(/daysUntilDate\(bookingData\?\.departureDate\)/);
  });
});
