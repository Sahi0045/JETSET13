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
  sessionStorage.clear();
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
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(saved));

    expect(readCancelledCheckout()).toEqual({
      reviewState: { flightData: saved.selectedFlight, searchData: saved.searchData, attemptId: null },
      travellers: saved.passengerData,
      contact: saved.bookingDetails.contact,
    });
  });

  // What ties the traveller draft to this booking and no other
  // (utils/flightTravellerDraft.js). Dropped here, the tab was back to a draft
  // any booking of the same flight and party could restore.
  it('restores the attempt the booking was made under', () => {
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify({ ...saved, attemptId: 'attempt-9' }));

    expect(readCancelledCheckout().reviewState.attemptId).toBe('attempt-9');
  });

  // The draft is this tab's. In the browser-wide slot it outlived a closed tab
  // with passport numbers in it, and a second tab's payment overwrote the first
  // tab's, so a cancel restored the other trip's travellers.
  it('reads this tab\'s draft, never one left in the browser-wide storage', () => {
    localStorage.setItem('pendingFlightBooking', JSON.stringify(saved));

    expect(readCancelledCheckout()).toBeNull();
  });

  it('restores nothing when nothing, or no bookable offer, was saved', () => {
    expect(readCancelledCheckout()).toBeNull();

    sessionStorage.setItem('pendingFlightBooking', '{not json');
    expect(readCancelledCheckout()).toBeNull();

    sessionStorage.setItem('pendingFlightBooking', JSON.stringify({ ...saved, selectedFlight: { id: '1' } }));
    expect(readCancelledCheckout()).toBeNull();
  });
});
