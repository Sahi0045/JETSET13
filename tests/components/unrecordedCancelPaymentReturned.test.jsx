import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus');

/**
 * A cancel that went through and could not be recorded, on a row whose
 * payment status has since been written refunded (a gateway reconcile, the
 * Payments tab).
 *
 * The row says the money went back, and every page still said "Our team will
 * confirm what happened to your payment" and "Being confirmed by our team".
 * paymentReturned is read first now, as it is for every other flagged
 * booking; with the row still saying paid, the sentence is as it was.
 */

const A = '220-1111111111';
const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];

// As both booking reads send it (toClientBooking), and as My Trips keeps it.
const unrecorded = (paymentStatus) => ({
  id: 'bk-held1',
  type: 'flight',
  bookingReference: 'FLTHELD1',
  orderId: 'FLTHELD1',
  status: 'confirmed',
  totalAmount: 291,
  amount: 291,
  currency: 'USD',
  paymentStatus,
  payment_status: paymentStatus,
  pnr: 'HELD99',
  origin: 'JFK',
  destination: 'LHR',
  departureDate: '2099-11-15',
  cancellation: null,
  tickets: [{ number: A, travelerId: '1' }],
  voided_tickets: [],
  travelers: travellers,
  passengerData: travellers,
  needs_review: {
    reason: 'cancellation carried out but not recorded: airline reservation released, payment REFUND 291 USD; check the airline and ARC Pay and record it by hand',
    no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false, unrecorded_cancellation: true,
  },
  gds: { ticketed: true },
  source: 'database',
});

const LEAD = 'Your cancellation went through, but our record of it is still being updated, so this booking may not show as cancelled yet. ';
const CALL = 'If you have any questions, call (877) 538-7380 with your booking reference.';
const CONFIRMING = /confirm what happened to your payment|Being confirmed/;

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

describe('an unrecorded cancel whose payment reads returned', () => {
  it.each(['refunded', 'reversed'])('in full (%s): says it was refunded, not that our team will confirm it', (status) => {
    const booking = unrecorded(status);

    expect(attentionMessage(booking)).toBe(`${LEAD}It is not valid for travel, and your payment for it has been refunded - please do not try again. ${CALL}`);

    const text = confirmationText(booking);
    expect(text).toMatch(/Cancellation Being Recorded/);
    expect(text).toMatch(/Payment refunded/);
    expect(text).toMatch(/Your payment for it has been refunded - please do not try again/);
    expect(text).not.toMatch(CONFIRMING);
  });

  it('in part: says what went back, and that our team will confirm the rest', () => {
    const booking = unrecorded('partially_refunded');

    expect(attentionMessage(booking)).toBe(`${LEAD}It is not valid for travel. Part of your payment for it has been refunded, `
      + `and our team will confirm what happened to the rest - please do not try again. ${CALL}`);

    const text = confirmationText(booking);
    expect(text).toMatch(/Partly refunded/);
    expect(text).toMatch(/Part of your payment for it has been refunded, and our team will confirm what happened to the rest/);
    expect(text).not.toMatch(/Being confirmed by our team/);
  });
});

// Fence: the row still says paid - what the money did is still ours to confirm.
describe('next to it', () => {
  it('still paid: our team will confirm what happened to the payment, as before', () => {
    const booking = unrecorded('paid');

    expect(attentionMessage(booking)).toBe(`${LEAD}It is not valid for travel. Our team will confirm what happened to your payment - please do not try again. ${CALL}`);

    const text = confirmationText(booking);
    expect(text).toMatch(/Being confirmed by our team/);
    expect(text).toMatch(/Our team will confirm what happened to your payment - please do not try again/);
    expect(text).not.toMatch(/Payment refunded|Partly refunded/);
  });
});
