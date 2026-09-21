import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('../../frontend/src/Services/ArcPayService', () => harness('arcPay'));

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

// Whether a trip crosses a border was read from the flights out only. A round
// trip whose way home connects abroad - Mumbai to Delhi through Dubai - read
// as domestic, so no passport fields were drawn; checkout, which reads every
// itinerary (backend/utils/itinerary.js), then refused the booking for the
// passport number the page never asked for. The server's own answer corrects
// the page when the arrival price check succeeds; this is the page on its own,
// when that check fails.
describe('a round trip that goes abroad only on the way home', () => {
  it('asks for passports, as checkout will', async () => {
    const fare = offer({
      id: '1',
      itineraries: [
        { segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] },
        { segments: [
          segment('BOM', 'DXB', '2026-11-22T08:00:00', '2026-11-22T10:00:00', { carrier: 'EK', number: '501' }),
          segment('DXB', 'DEL', '2026-11-22T12:00:00', '2026-11-22T17:00:00', { carrier: 'EK', number: '510' }),
        ] },
      ],
    });
    vi.stubGlobal('fetch', airline({ price: { 1: serverError } }));

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15', returnDate: '2026-11-22' } } });

    expect(await screen.findByText(/We couldn't check this fare with the airline just now/)).toBeTruthy();
    expect(screen.getByLabelText(/Passport Number/)).toBeTruthy();
  });

  it('still leaves them out of a trip that stays in one country both ways', async () => {
    const fare = offer({
      id: '1',
      itineraries: [
        { segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] },
        { segments: [segment('BOM', 'DEL', '2026-11-22T08:00:00', '2026-11-22T10:00:00', { number: '102' })] },
      ],
    });
    vi.stubGlobal('fetch', airline({ price: { 1: serverError } }));

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15', returnDate: '2026-11-22' } } });

    expect(await screen.findByText(/We couldn't check this fare with the airline just now/)).toBeTruthy();
    expect(screen.queryByLabelText(/Passport Number/)).toBeNull();
  });
});

// One flight number that lands on the way (AI2592 DEL-BOM stops at Indore,
// #168). The results page counts that stop and so does the strip on this
// page - "1 Stop" - while the panel right under it said "Direct Flight" and
// named nowhere.
describe('a single flight with a technical stop', () => {
  it('says it stops, and where, under a strip that says the same', async () => {
    const fare = offer({
      id: '1',
      itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T11:30:00', {
        number: '2592', stops: [{ iataCode: 'IDR', arrivalAt: '2026-11-15T09:30:00', departureAt: '2026-11-15T10:15:00' }],
      })] }],
    });
    vi.stubGlobal('fetch', airline());
    const flightData = reviewFlight(fare, {
      stops: 1,
      stopDetails: [{ airport: 'IDR', duration: '0h 45m', technical: true }],
      segments: [{
        departure: { airport: 'DEL', time: '08:00', at: '2026-11-15T08:00:00' },
        arrival: { airport: 'BOM', time: '11:30', at: '2026-11-15T11:30:00' },
        airline: { code: 'AI', name: 'Air India' },
        flightNumber: 'AI 2592',
        duration: 'PT3H30M',
      }],
    });

    const { container } = renderReviewPage(FlightBookingConfirmation, { state: { flightData } });

    expect(await screen.findByText('1 Stop')).toBeTruthy();
    expect(screen.queryByText('Direct Flight')).toBeNull();
    expect(container.querySelector('.stops-label').textContent).toMatch(/1 Stop.*IDR/);
  });

  it('still says Direct Flight for a flight that does not stop', async () => {
    vi.stubGlobal('fetch', airline());

    const { container } = renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(delBom('1')) } });

    expect(await screen.findByText('Direct Flight')).toBeTruthy();
    expect(container.querySelector('.stops-label').textContent.trim()).toBe('Direct Flight');
  });
});

/** Fill the first traveller in enough for Pay to go ahead on a domestic trip. */
const fillLeadTraveller = async () => {
  fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Female' }));
  fireEvent.change(screen.getByLabelText(/Mobile No/), { target: { value: '5550100' } });
};

// The attempt id ties the traveller draft to one booking: without it, two
// bookings of the same flight for the same party share a draft, and one
// customer's names and passport numbers fill the other's form
// (utils/flightTravellerDraft.js). The booking saved for the payment page did
// not carry it, so after a cancelled payment the tab was back in exactly that
// unguarded state.
describe('a cancelled payment', () => {
  it('comes back with the attempt it left with', async () => {
    const fare = delBom('1');
    vi.stubGlobal('fetch', airline());
    const first = renderReviewPage(FlightBookingConfirmation, {
      state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' }, attemptId: 'attempt-9' },
    });
    await fillLeadTraveller();

    fireEvent.click(screen.getByRole('button', { name: /^Pay US\$/ }));
    await waitFor(() => expect(sessionStorage.getItem('pendingFlightBooking')).toBeTruthy());
    expect(JSON.parse(sessionStorage.getItem('pendingFlightBooking')).attemptId).toBe('attempt-9');
    first.unmount();

    // ARC's cancel link: this page, marked, with no router state.
    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    expect(await screen.findByText(/Payment was cancelled - nothing was charged/)).toBeTruthy();
    await waitFor(() => expect(where.current.state?.flightData).toBeTruthy());
    expect(where.current.state.attemptId).toBe('attempt-9');
  });
});

/** The withdrawn-fare panel, once it has something to say. */
const alternativesPanel = async () => (await screen.findByText('Fares available now')).closest('section');
const chooseFlight = (panel, flightNumber) => {
  fireEvent.click(within(panel).getByText(new RegExp(flightNumber)).closest('li').querySelector('button'));
};

// Only the fare that died last was left out. After a second refusal the first
// dead fare - the cheapest, so listed first - was offered again, and choosing
// it cost another pricing round trip to be refused by the fare the customer
// started with.
describe('a second refusal on the same page', () => {
  const searchData = { from: 'DEL', to: 'BOM', departDate: '2026-11-15', adults: 1 };
  const first = delBom('1', { number: '101', total: '100.00' });
  const second = delBom('2', { number: '202', total: '150.00', at: '12:00' });
  const third = delBom('3', { number: '303', total: '200.00', at: '16:00' });

  it('never offers back a fare the airline has already refused here', async () => {
    const everything = [searchResult(first), searchResult(second), searchResult(third)];
    const fetch = airline({ price: { 1: fareUnavailable, 2: fareUnavailable }, search: [everything] });
    vi.stubGlobal('fetch', fetch);

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(first), searchData } });

    await waitFor(async () => expect(within(await alternativesPanel()).getAllByRole('button', { name: 'Choose' })).toHaveLength(2));
    // Priced as the summary charges it: the fare plus the page's service fee.
    expect(within(await alternativesPanel()).getByText('US$160.00')).toBeTruthy();
    chooseFlight(await alternativesPanel(), 'AI-202');

    await waitFor(() => expect(fetch.searchRequests).toHaveLength(2));
    await waitFor(async () => expect(within(await alternativesPanel()).getAllByRole('button', { name: 'Choose' })).toHaveLength(1));
    const panel = await alternativesPanel();
    expect(within(panel).queryByText(/AI-101/)).toBeNull();
    expect(within(panel).queryByText(/AI-202/)).toBeNull();
    expect(within(panel).getByText(/AI-303/)).toBeTruthy();
  });

  it('says the airline refused them all, rather than that the route has nothing', async () => {
    const fetch = airline({ price: { 1: fareUnavailable, 2: fareUnavailable }, search: [[searchResult(first), searchResult(second)]] });
    vi.stubGlobal('fetch', fetch);

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(first), searchData } });

    await waitFor(async () => expect(within(await alternativesPanel()).getAllByRole('button', { name: 'Choose' })).toHaveLength(1));
    chooseFlight(await alternativesPanel(), 'AI-202');

    await waitFor(() => expect(fetch.searchRequests).toHaveLength(2));
    const panel = await alternativesPanel();
    await waitFor(() => expect(within(panel).getByText(/The airline has refused every fare this search found/)).toBeTruthy());
    expect(within(panel).queryByRole('button', { name: 'Choose' })).toBeNull();
    expect(within(panel).queryByText(/nothing else on this route/)).toBeNull();
  });
});
