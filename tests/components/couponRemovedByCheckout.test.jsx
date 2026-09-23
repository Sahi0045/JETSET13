import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, searchResult, segment } from './reviewPageHarness.jsx';

/**
 * The coupon box, when the page takes the coupon off by itself.
 *
 * Checkout can refuse a coupon the preview accepted (COUPON_INVALID: used up
 * since it was applied, already on another of the customer's open checkouts,
 * or already used by their email), and a changed fare or a swapped flight
 * drops it too. The page cleared its own coupon and charged the full total -
 * but the box keeps its own "applied" state until it is remounted, and it is
 * remounted only for a changed total. With the total unchanged it went on
 * saying "Coupon SAVE20 applied! ... New total: US$190.00" beside a Pay
 * button for US$210.00.
 */

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

// What checkout answers, as checkout.handlers.js passes on verifyFlightCharge's
// refusal. Set per test.
const refusal = { current: null };
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: { createHostedCheckout: async () => ({ success: false, error: refusal.current }) },
}));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

const delBom = (id, { number = '101', at = '08:00' } = {}) => offer({
  id,
  itineraries: [{ segments: [segment('DEL', 'BOM', `2026-11-15T${at}:00`, '2026-11-15T10:00:00', { number })] }],
});
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

/** The lead traveller typed in and SAVE20 applied: 200 fare + 10 fee = 210, less 20. */
async function payWithCoupon(flights = airline()) {
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    if (String(url).includes('/coupons/validate')) {
      return Promise.resolve(json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE20' }, discountAmount: 20, finalTotal: 190 }));
    }
    return flights(url, init);
  }));

  renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(delBom('1')), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

  fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Female' }));
  fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });

  fireEvent.change(screen.getByPlaceholderText('Enter coupon code'), { target: { value: 'SAVE20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  fireEvent.click((await screen.findAllByRole('button', { name: /^Pay US\$190\.00/ }))[0]);
}

/** Checkout's refusal is shown in a dialog; closed, the page is back. */
async function closeNotice() {
  fireEvent.click((await screen.findAllByRole('button', { name: 'Close' }))[0]);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

const boxSaysApplied = () => /Coupon\s*SAVE20\s*applied/.test(document.body.textContent)
  || /New total:\s*US\$190\.00/.test(document.body.textContent);

describe('a coupon the page takes off by itself', () => {
  it('is no longer shown as applied when checkout refuses the coupon', async () => {
    refusal.current = {
      code: 'COUPON_INVALID',
      error: 'This coupon has reached its maximum usage limit.',
      pricedFare: { total: 200, base: 150, currency: 'USD' },
    };
    await payWithCoupon();

    await screen.findByText(/The coupon has been removed/);
    expect((await screen.findAllByRole('button', { name: /^Pay US\$210\.00/ }))[0]).toBeTruthy();
    expect(boxSaysApplied()).toBe(false);
    // The box is ready for a code again.
    expect(screen.getByPlaceholderText('Enter coupon code')).toBeTruthy();
  });

  // The fare came back at the same figure (the discount was what differed),
  // so the total the box is keyed on did not move.
  it('is no longer shown as applied when checkout reports a change that leaves the total where it was', async () => {
    refusal.current = {
      code: 'PRICE_CHANGED',
      error: 'The total for this booking is 195.00 USD. Please review it before paying.',
      pricedFare: { total: 200, base: 150, currency: 'USD' },
    };
    await payWithCoupon();

    await screen.findByText(/has been removed/);
    expect((await screen.findAllByRole('button', { name: /^Pay US\$210\.00/ }))[0]).toBeTruthy();
    expect(boxSaysApplied()).toBe(false);
  });

  it('is no longer shown as applied after swapping to another flight at the same price', async () => {
    refusal.current = { code: 'FARE_UNAVAILABLE', error: 'The airline can no longer sell this fare.' };
    const dead = delBom('1');
    const sameMoney = delBom('2', { number: '202', at: '12:00' });
    await payWithCoupon(airline({ search: [[searchResult(dead), searchResult(sameMoney)]] }));
    fireEvent.click(await screen.findByRole('button', { name: 'See the fares available now' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Choose' }));

    await screen.findByText(/Flight changed/);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pay US\$210\.00/ }).length).toBeGreaterThan(0));
    expect(boxSaysApplied()).toBe(false);
  });
});

describe('a coupon the page keeps', () => {
  it('stays applied, at the discounted total, through a refusal that has nothing to do with it', async () => {
    refusal.current = { error: 'Declined in test.' };
    await payWithCoupon();
    await screen.findByText(/Please try again in a moment/);
    await closeNotice();

    expect(boxSaysApplied()).toBe(true);
    expect(screen.getAllByRole('button', { name: /^Pay US\$190\.00/ }).length).toBeGreaterThan(0);
  });

  it('comes off when the customer removes it, and the total goes back', async () => {
    refusal.current = { error: 'Declined in test.' };
    await payWithCoupon();
    await screen.findByText(/Please try again in a moment/);
    await closeNotice();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(boxSaysApplied()).toBe(false);
    expect(screen.getAllByRole('button', { name: /^Pay US\$210\.00/ }).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Enter coupon code').value).toBe('');
  });
});
