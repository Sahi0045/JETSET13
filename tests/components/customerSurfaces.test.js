import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Three customer-facing pages, three fabrications, zero component tests.
 *
 * Found by the 2026-09-12 flight-flow audit and fixed the next day:
 *
 *  - The review page - where money is taken - fell back to a hardcoded mock
 *    booking (Air India, Mumbai-Delhi, "John Smith" and "Emma Smith") on any
 *    load without router state, and let the customer pay for it.
 *  - Manage Booking's "Download E-Ticket" did not render the honest
 *    FlightETicket component it imported. It used a second, inline template
 *    that printed `328{pnr}{i+45}` under a column headed "E-Ticket No".
 *  - Its cancel handler called a `setBookingData` that did not exist, threw
 *    after the seat was released and the refund had run, and reported every
 *    successful cancellation as a failure.
 *
 * Reading the source is crude, but it is the one check that catches exactly
 * this class of regression - a fallback quietly re-added, a template quietly
 * restored - which no unit test of a helper can see. Same approach as
 * tests/backend/bookingOwnerWiring.test.js, for the same reason.
 */

// Resolved from the working directory rather than import.meta.url: this file
// runs under the jsdom project, where that URL is http://, not file://, and
// readFileSync refuses it. Vitest runs from the repo root.
const FLIGHTS = path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights');
const page = (name) => readFileSync(path.join(FLIGHTS, name), 'utf8');

describe('the review page has nothing to fall back to', () => {
  const src = page('FlightBookingConfirmation.jsx');

  it('no longer imports or loads a mock booking', () => {
    expect(src).not.toMatch(/data-mock-booking/);
    expect(src).not.toMatch(/fetchBookingFromMockData/);
    expect(src).not.toMatch(/TEST_BOOKING_123/);
  });

  it('the mock data file is gone', () => {
    expect(existsSync(path.join(FLIGHTS, 'data-mock-booking.js'))).toBe(false);
  });

  it('shows the honest error when there is no offer to review', () => {
    expect(src).toMatch(/No flight data available/);
  });
});

describe('Manage Booking downloads the honest document', () => {
  const src = page('ManageBooking.jsx');

  it('renders FlightETicket into the ref the download captures', () => {
    expect(src).toMatch(/<FlightETicket\s+ref=\{ticketRef\}/);
  });

  // The inline template, by its most damning line.
  it('has no fabricated ticket number', () => {
    expect(src).not.toMatch(/328\{bookingData/);
    expect(src).not.toMatch(/E-Ticket No/);
  });

  it('names the saved file for what it is', () => {
    expect(src).toMatch(/ticketState\(bookingData\) === 'issued' \? 'ETicket' : 'BookingConfirmation'/);
  });
});

describe('cancelling reports what actually happened', () => {
  const src = page('ManageBooking.jsx');

  it('never calls the setter that does not exist', () => {
    expect(src).not.toMatch(/setBookingData\(/);
  });

  it('never marks a booking cancelled in localStorage', () => {
    expect(src).not.toMatch(/completedFlightBooking/);
  });

  it('reads the refund outcome from the object that carries it', () => {
    expect(src).toMatch(/result\.cancellation \|\| result\.booking/);
  });

  // A refused cancellation is a failure, not a success with a note.
  it('does not report success when the server refused', () => {
    expect(src).not.toMatch(/Booking marked as cancelled\. Refund will be processed/);
  });
});

describe('FlightETicket can actually be captured', () => {
  const src = page('FlightETicket.jsx');

  // html2canvas renders layout; a display:none element has none. The wrapper
  // used to be `className="hidden"`, which is a blank PDF.
  it('is positioned off-screen, not display:none', () => {
    expect(src).toMatch(/top: '-10000px'/);
    expect(src).not.toMatch(/<div className="hidden">/);
  });
});
