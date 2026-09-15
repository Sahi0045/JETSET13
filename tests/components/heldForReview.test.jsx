import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BookingConfirmation from '../../frontend/src/Pages/Common/BookingConfirmation.jsx';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

/**
 * A reservation held for staff, as the customer is told about it.
 *
 * The order page saved `needsReview` and the confirmation page read
 * `needs_review`, so the "our team is working on it" line never showed, and
 * both pages promised an email the server had not sent.
 */

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

const held = { type: 'flight', bookingReference: 'FLT1', status: 'PENDING_TICKETING', pnr: 'HELD42', ticketed: false, queued: false };

describe('the confirmation page for a held reservation', () => {
  it('says our team is finishing the ticket when it was held for staff', () => {
    const text = confirmationText({ ...held, needsReview: true, needs_review: { reason: null } });

    expect(text).toMatch(/Reservation Held/);
    expect(text).toMatch(/Our team is working on it and will email you/);
    expect(text).toMatch(/Our team is finishing your ticket/);
    expect(text).not.toMatch(/has been sent/);
  });

  it('claims no email was sent for an ordinary held reservation either', () => {
    const text = confirmationText(held);

    expect(text).toMatch(/We email your e-ticket to the address you booked with once it is issued/);
    expect(text).not.toMatch(/has been sent/);
    expect(text).not.toMatch(/Our team is working on it/);
  });
});

describe('the order page hands the review flag on under the name that is read', () => {
  const src = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightCreateOrders.jsx'), 'utf8');

  it('saves needs_review and words a held-for-review booking honestly', () => {
    expect(src).toMatch(/needs_review: needsReview \? \{ reason: null \} : null/);
    expect(src).toMatch(/could not be issued automatically\. Our team is finishing it/);
    expect(src).not.toMatch(/your ticket is being issued\. We'll email your e-ticket as soon as it is ready/);
  });
});
