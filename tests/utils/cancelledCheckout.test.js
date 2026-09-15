import { beforeEach, describe, expect, it } from 'vitest';
import { cancelUrlFor, isCancelledReturn, readCancelledCheckout } from '../../frontend/src/utils/cancelledCheckout.js';
import { safeReturnUrl } from '../../backend/utils/returnUrl.js';

/**
 * Cancelling on ARC's payment page brings the customer back to their booking.
 *
 * The cancel link went to /flights?cancelled=true, which the landing page
 * ignores, after the review page had cleared the flight it kept: the flight and
 * every detail typed were lost, and nothing said whether anything was charged.
 */

const saved = {
  selectedFlight: { id: '1', airline: { code: 'LH' }, originalOffer: { id: '1', travelerPricings: [{ travelerType: 'ADULT' }] } },
  searchData: { from: 'JFK', to: 'FRA', departDate: '2026-10-04' },
  passengerData: [{ id: 1, type: 'ADULT', firstName: 'Jane', lastName: 'Doe', passportNumber: 'X1234567' }],
  bookingDetails: { contact: { email: 'jane@example.com', phone: '5550100', countryCode: '1' } },
};

beforeEach(() => {
  localStorage.clear();
});

describe('the cancel link', () => {
  it('returns to the review page, marked as a cancelled payment', () => {
    const url = cancelUrlFor('https://www.jetsetterss.com');

    expect(url).toBe('https://www.jetsetterss.com/flights/booking-confirmation?payment=cancelled');
    expect(isCancelledReturn(new URL(url).search)).toBe(true);
  });

  // Checkout sends ARC only the site's own URLs (PR #110).
  it("is one of the site's own URLs, which checkout accepts", () => {
    const url = cancelUrlFor('https://www.jetsetterss.com');
    expect(safeReturnUrl(url, 'fallback', { NODE_ENV: 'production' })).toBe(url);
  });

  it('marks no other visit as a cancelled payment', () => {
    expect(isCancelledReturn('')).toBe(false);
    expect(isCancelledReturn('?cancelled=true')).toBe(false);
  });
});

describe('readCancelledCheckout', () => {
  it('restores the flight, the search, the travellers and the contact details', () => {
    localStorage.setItem('pendingFlightBooking', JSON.stringify(saved));

    expect(readCancelledCheckout()).toEqual({
      reviewState: { flightData: saved.selectedFlight, searchData: saved.searchData },
      travellers: saved.passengerData,
      contact: saved.bookingDetails.contact,
    });
  });

  it('restores nothing when nothing, or no bookable offer, was saved', () => {
    expect(readCancelledCheckout()).toBeNull();

    localStorage.setItem('pendingFlightBooking', '{not json');
    expect(readCancelledCheckout()).toBeNull();

    localStorage.setItem('pendingFlightBooking', JSON.stringify({ ...saved, selectedFlight: { id: '1' } }));
    expect(readCancelledCheckout()).toBeNull();
  });
});
