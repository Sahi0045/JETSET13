import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

/**
 * Amadeus's certification review (test case 7, 24 Sep 2026) asked why the
 * review page priced one offer both statelessly and statefully. It priced it
 * three times: /flights/price for the total, then /flights/fare-rules from the
 * cancellation panel and again from the baggage panel. The page now makes ONE
 * request - /flights/price with withFareRules - and both panels read its answer.
 *
 * The two panels are rendered for real here; every other review-page test
 * mocks them out.
 */

const harness = async (name) => (await import('./reviewPageHarness.jsx')).pageMocks[name];
vi.mock('../../frontend/src/Pages/Common/Navbar', () => harness('navbar'));
vi.mock('../../frontend/src/Pages/Common/Footer', () => harness('footer'));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => harness('pageWrapper'));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => harness('auth'));
vi.mock('../../frontend/src/hooks/queries', () => harness('queries'));
vi.mock('../../frontend/src/hooks/queries/useSavedTravellers', () => harness('savedTravellers'));
vi.mock('../../frontend/src/Context/LocationContext', () => harness('location'));
vi.mock('../../frontend/src/components/CouponInput', () => harness('nothing'));
vi.mock('../../frontend/src/Services/ArcPayService', () => harness('arcPay'));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

const fare = () => offer({
  id: '1',
  itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }],
});

const RULES = {
  bags: [{ weight: 23, weightUnit: 'KG', name: 'CHECKED_BAG 23KG', price: null, segmentIds: ['1'] }],
  fareRules: [{ title: 'PENALTIES', text: 'CANCELLATIONS ANY TIME CHARGE USD 150.00 FOR CANCEL/REFUND.' }],
  cancellation: {
    hasData: true, currency: 'USD', cutoffHours: null, changeFee: null, cancelFee: 150, refundable: null, fareTotal: 200, fareCurrency: 'USD',
  },
};

const answer = (body, ok = true) => Promise.resolve({ ok, json: async () => body });

/** The server: /flights/price answers with the price and, when asked, the rules. */
const server = ({ priceOk = true } = {}) => {
  const fetch = vi.fn((url, init) => {
    const body = JSON.parse(init?.body || '{}');
    if (String(url).includes('/flights/price')) {
      fetch.priceRequests.push(body);
      if (!priceOk) return answer({ success: false, error: 'Upstream error' }, false);
      return answer({
        success: true,
        data: { flightOffers: [{ price: body.flightOffer.price }] },
        meta: {},
        ...(body.withFareRules ? { fareRules: RULES } : {}),
      });
    }
    if (String(url).includes('/flights/fare-rules')) fetch.ruleRequests.push(body);
    return answer({}, false);
  });
  fetch.priceRequests = [];
  fetch.ruleRequests = [];
  return fetch;
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the review page checks the fare once', () => {
  it('asks for the price and the rules in one request, and both panels read it', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare()), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    // The cancellation panel reads the fee from the one answer...
    expect((await screen.findAllByText('$150')).length).toBeGreaterThan(0);
    // ...and so does the baggage and rules panel.
    expect(screen.getByText(/\+23 KG checked baggage/)).toBeTruthy();
    expect(fetch.priceRequests).toHaveLength(1);
    expect(fetch.priceRequests[0].withFareRules).toBe(true);
    // No panel prices the offer again.
    expect(fetch.ruleRequests).toHaveLength(0);
  });

  it('says the rules could not be reached when the one check fails, and asks nothing more', async () => {
    const fetch = server({ priceOk: false });
    vi.stubGlobal('fetch', fetch);

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare()), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    expect(await screen.findByText(/We could not reach the airline for this fare's cancellation rules/)).toBeTruthy();
    expect(screen.getByText('Fare rules unavailable for this fare.')).toBeTruthy();
    await waitFor(() => expect(fetch.priceRequests).toHaveLength(1));
    expect(fetch.ruleRequests).toHaveLength(0);
  });
});
