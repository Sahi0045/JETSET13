import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';
import { readCancelledCheckout } from '../../frontend/src/utils/cancelledCheckout.js';

const harness = async (name) => (await import('./reviewPageHarness.jsx')).pageMocks[name];
vi.mock('../../frontend/src/Pages/Common/Navbar', () => harness('navbar'));
vi.mock('../../frontend/src/Pages/Common/Footer', () => harness('footer'));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => harness('pageWrapper'));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => harness('auth'));
vi.mock('../../frontend/src/hooks/queries', () => harness('queries'));
vi.mock('../../frontend/src/hooks/queries/useSavedTravellers', () => harness('savedTravellers'));
vi.mock('../../frontend/src/Context/LocationContext', () => harness('location'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFareRules', () => harness('nothing'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCancellationPolicy', () => harness('nothing'));
vi.mock('../../frontend/src/Services/ArcPayService', () => harness('arcPay'));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

/**
 * The coupon, after cancelling on ARC's payment page.
 *
 * Coming back restored the flight, the travellers and the contact details
 * (utils/cancelledCheckout.js), but not the coupon: appliedCoupon started
 * empty, and the customer had to type it again. It is now put back - checked
 * again the normal way, through the coupon box's own /coupons/validate call,
 * because it may have expired or been used up meanwhile. A coupon that call
 * refuses is not applied.
 */

// The review page's total for this fare: 200.00 plus the harness's 10.00 fee.
const TOTAL = 210;
const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });

/** What the review page saves on its way to ARC (FlightBookingConfirmation.jsx bookingDataForStorage). */
const savedBooking = (over = {}) => ({
  selectedFlight: reviewFlight(fare),
  searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' },
  passengerData: [{ id: 1, type: 'ADULT', firstName: 'Jane', lastName: 'Doe', gender: 'female', mobile: '5550100', countryCode: '+1' }],
  bookingDetails: { contact: { email: 'traveller@example.com', phone: '5550100', countryCode: '1' } },
  amount: TOTAL - 21,
  couponCode: 'SAVE10',
  ...over,
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const validCoupon = (code = 'SAVE10', discount = 21) => json(200, {
  success: true, coupon: { id: 'c-1', code }, discountAmount: discount, finalTotal: TOTAL - discount,
});

/** The airline, plus the coupon service answering `coupon(body)`. */
const withCoupons = (coupon) => {
  const flights = airline();
  const fetch = vi.fn((url, init) => {
    if (String(url).includes('/coupons/validate')) {
      const body = JSON.parse(init?.body || '{}');
      fetch.couponRequests.push(body);
      return Promise.resolve(coupon(body));
    }
    return flights(url, init);
  });
  fetch.couponRequests = [];
  return fetch;
};

const discountRow = () => screen.queryByText(/^Coupon SAVE10$/);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('back from a cancelled payment with a coupon applied', () => {
  it('the saved booking gives the coupon back', () => {
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(savedBooking()));
    expect(readCancelledCheckout().couponCode).toBe('SAVE10');
  });

  it('puts the coupon back once the coupon service accepts it again, on the total now on the page', async () => {
    const fetch = withCoupons(() => validCoupon());
    vi.stubGlobal('fetch', fetch);
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(savedBooking()));

    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    expect(await screen.findByText(/Payment was cancelled - nothing was charged/)).toBeTruthy();
    await waitFor(() => expect(discountRow()).toBeTruthy());
    expect(fetch.couponRequests).toHaveLength(1);
    expect(fetch.couponRequests[0]).toMatchObject({ code: 'SAVE10', orderTotal: TOTAL, bookingType: 'flights', userId: 'user-1' });
    expect(screen.getByText(/Coupon/, { selector: 'p' }).textContent).toMatch(/SAVE10.*applied/);
    expect(screen.getByRole('button', { name: /^Pay US\$189\.00/ })).toBeTruthy();
  });

  it('does not apply a coupon the coupon service now refuses, and says why', async () => {
    const fetch = withCoupons(() => json(400, { success: false, message: 'This coupon has expired.' }));
    vi.stubGlobal('fetch', fetch);
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(savedBooking()));

    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    expect(await screen.findByText('This coupon has expired.')).toBeTruthy();
    expect(fetch.couponRequests).toHaveLength(1);
    expect(discountRow()).toBeNull();
    expect(screen.getByRole('button', { name: /^Pay US\$210\.00/ })).toBeTruthy();
  });

  it('asks once, and does not apply a coupon that would leave nothing to pay', async () => {
    const fetch = withCoupons(() => validCoupon('SAVE10', TOTAL));
    vi.stubGlobal('fetch', fetch);
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(savedBooking()));

    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    expect(await screen.findByText(/This coupon covers the whole fare/)).toBeTruthy();
    // Give any second ask a chance to happen before counting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetch.couponRequests).toHaveLength(1);
    expect(discountRow()).toBeNull();
  });
});

/**
 * The airline's price check on arrival can change the total while the
 * restored coupon is being checked. The box is remounted for the new total and
 * asks again; the first answer, worked out on the old total, arrives last and
 * must not be the one applied.
 */
describe('a restored coupon, when the total changes while it is being checked', () => {
  it('is applied on the new total, and the answer for the old total is dropped', async () => {
    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      return { promise, resolve };
    };
    const priceCheck = deferred();
    const answers = [deferred(), deferred()];
    const flights = airline({ price: { 1: () => priceCheck.promise } });
    const couponRequests = [];
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      if (String(url).includes('/coupons/validate')) {
        couponRequests.push(JSON.parse(init?.body || '{}'));
        return answers[couponRequests.length - 1].promise;
      }
      return flights(url, init);
    }));
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(savedBooking()));

    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    // The restored coupon is asked about on the search total...
    await waitFor(() => expect(couponRequests).toHaveLength(1));
    expect(couponRequests[0].orderTotal).toBe(TOTAL);
    // ...then the airline's price moves the total to 260.00, and it is asked about again.
    priceCheck.resolve({ ok: true, json: async () => ({ success: true, data: { flightOffers: [{ price: { total: '250.00', grandTotal: '250.00', base: '187.50', currency: 'USD' } }] } }) });
    await waitFor(() => expect(couponRequests).toHaveLength(2));
    expect(couponRequests[1].orderTotal).toBe(260);

    answers[1].resolve(json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE10' }, discountAmount: 26, finalTotal: 234 }));
    await waitFor(() => expect(discountRow()).toBeTruthy());
    answers[0].resolve(validCoupon());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByRole('button', { name: /^Pay US\$234\.00/ })).toBeTruthy();
  });
});

/**
 * Fence: the arrivals next to it, as on main.
 */
describe('fence: no coupon is restored anywhere else', () => {
  it('back from a cancelled payment with no coupon: none is asked about or applied', async () => {
    const fetch = withCoupons(() => validCoupon());
    vi.stubGlobal('fetch', fetch);
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(savedBooking({ couponCode: null })));

    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    expect(await screen.findByText(/Payment was cancelled - nothing was charged/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Pay US\$210\.00/ })).toBeTruthy();
    expect(fetch.couponRequests).toHaveLength(0);
    expect(discountRow()).toBeNull();
  });

  it('an ordinary arrival from search: a saved coupon is not restored', async () => {
    const fetch = withCoupons(() => validCoupon());
    vi.stubGlobal('fetch', fetch);
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify(savedBooking()));

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    expect(await screen.findByRole('button', { name: /^Pay US\$210\.00/ })).toBeTruthy();
    expect(fetch.couponRequests).toHaveLength(0);
    expect(discountRow()).toBeNull();
  });

  it('a coupon typed and applied by hand works as before', async () => {
    const fetch = withCoupons(() => validCoupon());
    vi.stubGlobal('fetch', fetch);

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    fireEvent.change(await screen.findByPlaceholderText('Enter coupon code'), { target: { value: 'save10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(discountRow()).toBeTruthy());
    expect(fetch.couponRequests).toEqual([expect.objectContaining({ code: 'SAVE10', orderTotal: TOTAL })]);
  });
});
