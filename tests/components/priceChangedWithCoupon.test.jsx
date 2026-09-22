import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

/**
 * Checkout refuses PRICE_CHANGED while a coupon is applied.
 *
 * The server's message quotes the new total WITH the coupon's discount
 * (flightCheckout.service.js, charge.total). The page then takes the coupon
 * off and shows the new total without it - and the notice said "The total for
 * this booking is 240.00 USD ... The total has been updated" over a Pay
 * button for 260.00. Neither was what the customer would pay once the coupon
 * went back on. With a coupon, the notice now quotes no figure and says the
 * coupon was removed and should be applied again. Without one, it is as it was.
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
// PRICE_CHANGED refusal. Set per test.
const refusal = { current: null };
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: { createHostedCheckout: async () => ({ success: false, error: refusal.current }) },
}));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

async function fillLeadTraveller() {
  const flights = airline();
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    if (String(url).includes('/coupons/validate')) {
      // 200 + 10 fee = 210; SAVE20 takes 20.
      return Promise.resolve(json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE20' }, discountAmount: 20, finalTotal: 190 }));
    }
    return flights(url, init);
  }));

  renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

  fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Female' }));
  fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });
}

describe('PRICE_CHANGED at checkout', () => {
  it('with a coupon applied, quotes no total the page does not show, and asks for the coupon again', async () => {
    refusal.current = {
      code: 'PRICE_CHANGED',
      // 250 + 10 fee - 20 = 240: the discounted figure.
      error: 'The total for this booking is 240.00 USD. Please review it before paying.',
      pricedFare: { total: 250, base: 187.5, currency: 'USD' },
    };
    await fillLeadTraveller();

    fireEvent.change(screen.getByPlaceholderText('Enter coupon code'), { target: { value: 'SAVE20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click((await screen.findAllByRole('button', { name: /^Pay US\$190\.00/ }))[0]);

    const notice = (await screen.findByText(/The total has been updated/)).textContent;
    const payButton = (await screen.findAllByRole('button', { name: /^Pay US\$260\.00/ }))[0];

    expect(payButton).toBeTruthy();
    expect(notice).not.toMatch(/240\.00/);
    expect(notice).toMatch(/coupon SAVE20 has been removed/i);
    expect(notice).toMatch(/apply it again/i);
    expect(notice).toMatch(/Nothing has been charged\./);
  });

  it('without a coupon, keeps the server\'s total in the notice, as before', async () => {
    refusal.current = {
      code: 'PRICE_CHANGED',
      error: 'The total for this booking is 260.00 USD. Please review it before paying.',
      pricedFare: { total: 250, base: 187.5, currency: 'USD' },
    };
    await fillLeadTraveller();

    fireEvent.click((await screen.findAllByRole('button', { name: /^Pay US\$210\.00/ }))[0]);

    expect((await screen.findByText(/The total has been updated/)).textContent).toBe(
      'The total for this booking is 260.00 USD. Please review it before paying. The total has been updated. Nothing has been charged.',
    );
    expect((await screen.findAllByRole('button', { name: /^Pay US\$260\.00/ }))[0]).toBeTruthy();
  });
});
