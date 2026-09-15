import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BookingConfirmation from '../../frontend/src/Pages/Common/BookingConfirmation.jsx';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

/**
 * The confirmation page's payment summary.
 *
 * It printed "Base Fare" as the total less taxes: a $50 service fee and a coupon
 * discount were both inside that figure, and neither was named.
 */

const textOf = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

describe('the payment summary', () => {
  it('shows the fare, the service fee and the discount checkout verified', () => {
    const text = textOf({
      type: 'flight', bookingReference: 'FLT1', status: 'pending_ticketing', pnr: 'ABC123', amount: 540.86,
      chargeBreakdown: { fare: 500, serviceFee: 50, discount: 9.14, total: 540.86, currency: 'USD', couponCode: 'SAVE' },
      fareBreakdown: { baseFare: 410, totalTax: 90 },
    });

    expect(text).toMatch(/Airline fare \(incl\. taxes\)\$500\.00/);
    expect(text).toMatch(/Service fee\$50\.00/);
    expect(text).toMatch(/Discount \(SAVE\)- \$9\.14/);
    expect(text).not.toMatch(/Base Fare/);
  });
});
