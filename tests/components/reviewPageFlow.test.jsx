import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  airline, fareUnavailable, offer, renderReviewPage, reviewFlight, searchResult, segment, serverError, where,
} from './reviewPageHarness.jsx';

const harness = async (name) => (await import('./reviewPageHarness.jsx')).pageMocks[name];
vi.mock('../../frontend/src/Pages/Common/Navbar', () => harness('navbar'));
vi.mock('../../frontend/src/Pages/Common/Footer', () => harness('footer'));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => harness('pageWrapper'));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => harness('auth'));
vi.mock('../../frontend/src/hooks/queries', () => harness('queries'));
vi.mock('../../frontend/src/hooks/queries/useSavedTravellers', () => harness('savedTravellers'));
vi.mock('../../frontend/src/Context/LocationContext', () => harness('location'));
vi.mock('../../frontend/src/components/CouponInput', () => harness('nothing'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFareRules', () => harness('nothing'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCancellationPolicy', () => harness('nothing'));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

const delBom = (id, { number = '101', total = '200.00', at = '08:00' } = {}) => offer({
  id,
  total,
  itineraries: [{ segments: [segment('DEL', 'BOM', `2026-11-15T${at}:00`, '2026-11-15T10:00:00', { number })] }],
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the review page harness', () => {
  it('renders an arrival from search and checks the fare with the airline', async () => {
    const fetch = airline();
    vi.stubGlobal('fetch', fetch);
    const fare = delBom('1');

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    expect(await screen.findByText('Review your Booking')).toBeTruthy();
    await waitFor(() => expect(fetch.priceRequests).toHaveLength(1));
    expect(screen.getAllByText(/US\$210\.00/).length).toBeGreaterThan(0);
  });
});

// Back from the login page, the flight comes from this tab's storage, not from
// router state (utils/flightReviewResume.js). Choosing another fare built the
// new router state from the router state - empty on that arrival - so the
// search and the attempt were dropped. With the search gone, a second refusal
// searched without the cabin: a business-class booking was offered economy
// fares under "Same route, same dates, same travellers".
describe('choosing another fare after the round trip through the login page', () => {
  const searchData = { from: 'DEL', to: 'BOM', departDate: '2026-11-15', travelClass: 'BUSINESS', adults: 1 };

  it('keeps the search and the attempt, so a second refusal searches the same cabin', async () => {
    const dead = delBom('1');
    const alternative = delBom('2', { number: '202', total: '250.00', at: '12:00' });
    const fetch = airline({
      price: { 1: fareUnavailable, 2: fareUnavailable },
      search: [[searchResult(dead), searchResult(alternative)]],
    });
    vi.stubGlobal('fetch', fetch);
    sessionStorage.setItem('jt_flight_review', JSON.stringify({ flightData: reviewFlight(dead), searchData, attemptId: 'attempt-7' }));

    renderReviewPage(FlightBookingConfirmation);

    fireEvent.click(await screen.findByRole('button', { name: 'Choose' }));
    await waitFor(() => expect(fetch.searchRequests).toHaveLength(2));
    expect(fetch.searchRequests[0].travelClass).toBe('BUSINESS');
    expect(fetch.searchRequests[1].travelClass).toBe('BUSINESS');
    expect(where.current.state).toMatchObject({ searchData, attemptId: 'attempt-7' });
  });

  // The same arrival, adding a traveller: the search came back, the attempt
  // did not, and the traveller draft lost what ties it to this booking.
  it('keeps the attempt when the travellers change', async () => {
    const one = delBom('1');
    const two = { ...delBom('1'), travelerPricings: [...one.travelerPricings, { ...one.travelerPricings[0], travelerId: '2' }] };
    const fetch = airline({ search: [[searchResult(two)]] });
    vi.stubGlobal('fetch', fetch);
    sessionStorage.setItem('jt_flight_review', JSON.stringify({ flightData: reviewFlight(one), searchData, attemptId: 'attempt-7' }));

    renderReviewPage(FlightBookingConfirmation);

    fireEvent.click(await screen.findByRole('button', { name: /Add or remove travellers/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add one adult/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Update price' }));
    await waitFor(() => expect(where.current.state?.flightData?.originalOffer?.travelerPricings).toHaveLength(2));
    expect(where.current.state).toMatchObject({ attemptId: 'attempt-7', searchData: { travelClass: 'BUSINESS', adults: 2 } });
  });
});
