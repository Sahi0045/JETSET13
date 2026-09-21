import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

/**
 * The flight review page, rendered for real, with only its outside world
 * replaced: the account, the fee settings, the airline (fetch) and the payment
 * service.
 *
 * Most checks of this page read its source (customerSurfaces.test.js says why).
 * The ones here are about what happens across several steps - a fare refused,
 * an alternative chosen, a second refusal - which no regular expression over
 * the source can follow. Each test file that uses this declares the module
 * mocks below with vi.mock (it has to be in the test file itself: Vitest hoists
 * it there and nowhere else).
 */

/** Every mock the page needs, for `vi.mock(path, () => mocks[path])`. */
export const signedInUser = { id: 'user-1', email: 'traveller@example.com' };
// One object for the life of the test: the page's effects depend on these by
// identity, and a fresh object each render re-runs them without end.
export const priceConfig = { flight_taxes_fees: 10, flight_taxes_fees_percentage: 0 };
const auth = { user: signedInUser, loading: false, renewServerSession: async () => true };
const location = { country: 'US', callingCode: '+1', currency: 'USD' };
const priceConfigQuery = { data: priceConfig, error: null, refetch: () => {} };
const guestSwitch = { isSuccess: true, data: false, isPending: false };
const savedTravellers = { data: null };
const saveTravellers = { mutate: () => {} };

export const pageMocks = {
  navbar: { default: () => null },
  footer: { default: () => null },
  pageWrapper: { default: (Component) => Component },
  auth: { useSupabaseAuth: () => auth },
  queries: { useGuestFlightBooking: () => guestSwitch, usePriceConfig: () => priceConfigQuery },
  savedTravellers: { useSavedTravellers: () => savedTravellers, useSaveTravellers: () => saveTravellers },
  location: { useLocationContext: () => location },
  nothing: { default: () => null },
  // Checkout refuses, so Pay never leaves the page: what the page saved on
  // its way to the payment page is what a test reads.
  arcPay: { default: { createHostedCheckout: async () => ({ success: false, error: { error: 'Declined in test.' } }) } },
};

/** An Amadeus segment as the offer carries it. */
export const segment = (from, to, departAt, arriveAt, { carrier = 'AI', number = '101', stops } = {}) => ({
  departure: { iataCode: from, at: departAt },
  arrival: { iataCode: to, at: arriveAt },
  carrierCode: carrier,
  number,
  duration: 'PT2H',
  ...(stops ? { stops } : {}),
});

/** An offer as search returns it inside `originalOffer`. */
export const offer = ({ id = '1', itineraries, total = '200.00', types = ['ADULT'], rbd = 'Y' }) => ({
  id,
  itineraries,
  price: { total, grandTotal: total, base: String((Number(total) * 0.75).toFixed(2)), currency: 'USD' },
  travelerPricings: types.map((travelerType, index) => ({
    travelerId: String(index + 1),
    travelerType,
    fareDetailsBySegment: itineraries.flatMap((itinerary) => itinerary.segments).map(() => ({ class: rbd, fareBasis: `${rbd}OW` })),
  })),
  validatingAirlineCodes: [itineraries[0].segments[0].carrierCode],
});

/** The flight in the shape the results page hands the review page. */
export const reviewFlight = (amadeusOffer, overrides = {}) => {
  const outbound = amadeusOffer.itineraries[0].segments;
  const first = outbound[0];
  const last = outbound[outbound.length - 1];
  const total = Number(amadeusOffer.price.total);
  return {
    id: amadeusOffer.id,
    airline: { code: first.carrierCode, name: 'Air India', logo: '', flightNumber: first.number },
    flightNumber: `${first.carrierCode} ${first.number}`,
    departure: { airport: first.departure.iataCode, time: first.departure.at.slice(11, 16), rawDate: first.departure.at.slice(0, 10), date: '' },
    arrival: { airport: last.arrival.iataCode, time: last.arrival.at.slice(11, 16), rawDate: last.arrival.at.slice(0, 10), date: '' },
    duration: 'PT2H',
    stops: outbound.length - 1,
    stopDetails: [],
    segments: [],
    price: { amount: total, total: amadeusOffer.price.total, grandTotal: amadeusOffer.price.total, base: amadeusOffer.price.base, currency: 'USD' },
    baggage: { cabin: null, checked: null },
    cabin: 'ECONOMY',
    originalOffer: amadeusOffer,
    ...overrides,
  };
};

/** One entry of /api/flights/search's `data`. */
export const searchResult = (amadeusOffer, { flightNumber } = {}) => {
  const outbound = amadeusOffer.itineraries[0].segments;
  const first = outbound[0];
  const last = outbound[outbound.length - 1];
  return {
    id: amadeusOffer.id,
    airline: 'Air India',
    airlineCode: first.carrierCode,
    flightNumber: flightNumber ?? `${first.carrierCode}-${first.number}`,
    price: { amount: Number(amadeusOffer.price.total), total: amadeusOffer.price.total, grandTotal: amadeusOffer.price.total, base: amadeusOffer.price.base, currency: 'USD' },
    duration: '2h 0m',
    departure: { time: first.departure.at.slice(11, 16), airport: first.departure.iataCode, date: first.departure.at.slice(0, 10) },
    arrival: { time: last.arrival.at.slice(11, 16), airport: last.arrival.iataCode, date: last.arrival.at.slice(0, 10) },
    stops: outbound.length - 1,
    stopDetails: [],
    cabin: 'ECONOMY',
    originalOffer: amadeusOffer,
  };
};

const reply = (body, ok = true) => Promise.resolve({ ok, json: async () => body });

/** The airline's answer to a price check: the offer priced as it stands. */
export const priced = (amadeusOffer, meta = {}) => reply({
  success: true,
  data: { flightOffers: [{ price: amadeusOffer.price }] },
  meta,
});
export const fareUnavailable = () => reply({ success: false, code: 'FARE_UNAVAILABLE', error: 'The airline can no longer sell this fare.' }, false);
export const serverError = () => reply({ success: false, error: 'Upstream error' }, false);

/**
 * A fetch that answers /flights/price by offer id and /flights/search from a
 * list of replies, one per call (the last one repeats). Every request body is
 * kept on `fetch.priceRequests` / `fetch.searchRequests`.
 */
export function airline({ price = {}, search = [] } = {}) {
  const searchReplies = [...search];
  const fetch = vi.fn((url, init) => {
    const body = JSON.parse(init?.body || '{}');
    if (String(url).includes('/flights/price')) {
      fetch.priceRequests.push(body);
      const answer = price[body?.flightOffer?.id];
      return answer ? answer(body.flightOffer) : priced(body.flightOffer);
    }
    if (String(url).includes('/flights/search')) {
      fetch.searchRequests.push(body);
      const data = searchReplies.length > 1 ? searchReplies.shift() : searchReplies[0];
      return reply({ success: true, data: data ?? [] });
    }
    return reply({}, false);
  });
  fetch.priceRequests = [];
  fetch.searchRequests = [];
  return fetch;
}

/** Where the router is now, as the page last left it. */
export const where = { current: null };
const Probe = () => {
  where.current = useLocation();
  return null;
};

/**
 * Render the review page. `state` is the router state an arrival from search
 * carries; leave it out for an arrival with none (back from the login page).
 * `search` is the query string, e.g. "?payment=cancelled" for the return from
 * a cancelled payment.
 */
export function renderReviewPage(Page, { state, search = '' } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/flights/booking-confirmation', search, state: state ?? null }]}>
      <Routes>
        <Route path="/flights/booking-confirmation" element={<><Page /><Probe /></>} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}
