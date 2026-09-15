import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FlightETicket from '../../frontend/src/Pages/Common/flights/FlightETicket.jsx';

/**
 * The travel document says only what is true of the booking.
 *
 * "This is a confirmed reservation, not a ticket. Your seat is held under the
 * PNR below" was printed for every booking without a ticket - beside "PNR: N/A"
 * when nothing was held at all.
 */

const textOf = (bookingData) => render(<FlightETicket bookingData={bookingData} />).container.textContent;
const base = { bookingReference: 'FLT1', origin: 'JFK', destination: 'LHR', departureDate: '2026-11-15', travelers: [{ id: '1', firstName: 'Ann', lastName: 'Lee' }] };

describe('the travel document wording', () => {
  it('a PNR without a ticket is a held reservation', () => {
    const text = textOf({ ...base, status: 'pending_ticketing', pnr: 'ABC123', payment_status: 'paid' });

    expect(text).toMatch(/Booking Confirmation/);
    expect(text).toMatch(/Your seat is held under the PNR below/);
    expect(text).toMatch(/PNR: ABC123/);
  });

  it('a queued booking holds no seat yet', () => {
    const text = textOf({ ...base, status: 'pending_confirmation', queued: true, payment_status: 'paid' });

    expect(text).toMatch(/Booking Summary/);
    expect(text).toMatch(/being confirmed with the airline/);
    expect(text).toMatch(/no seat is held yet/);
    expect(text).toMatch(/PNR: Not yet assigned/);
    expect(text).not.toMatch(/held under the PNR|Booking Confirmation|N\/A/);
  });

  it('a paid booking never sent to the airline says so, and what happens next', () => {
    const text = textOf({ ...base, status: 'pending', payment_status: 'paid' });

    expect(text).toMatch(/has not been confirmed with the airline/);
    expect(text).toMatch(/confirm your booking or refund you by email/);
    expect(text).toMatch(/Not yet confirmed with the airline/);
    expect(text).not.toMatch(/held under the PNR/);
  });

  it('an unpaid booking says it was not paid for', () => {
    const text = textOf({ ...base, status: 'pending', payment_status: 'unpaid' });

    expect(text).toMatch(/has not been paid for/);
    expect(text).not.toMatch(/held under the PNR|Payment Confirmed/);
  });
});

describe('Manage Booking offers the document only with a PNR', () => {
  const src = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/ManageBooking.jsx'), 'utf8');

  it('gates both the button and the download on canDownloadDocument', () => {
    expect(src).toMatch(/\{canDownloadDocument\(bookingData\) && \(/);
    expect(src).toMatch(/if \(!canDownloadDocument\(bookingData\)\) return;/);
  });
});
