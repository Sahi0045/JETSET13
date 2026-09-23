import React from 'react';
import { screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

/**
 * Flight times on the page where the customer confirms and pays, as the
 * airports' clocks read them.
 *
 * Amadeus's `at` is the airport's own clock with no offset. The page printed a
 * connecting flight's times with `new Date(at).toLocaleTimeString()` and worked
 * out a connection with `new Date(dep) - new Date(arr)`, both through the
 * VIEWER's time zone: a time inside the viewer's spring-forward hour moved an
 * hour, and a connection across it lost one. The results page was fixed for
 * exactly this (searchResults.js airportClockLabel / minutesBetweenAirportTimes);
 * this page now reads the same helpers.
 *
 * 14 Mar 2027 is the day New York springs forward (02:00 -> 03:00).
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
vi.mock('../../frontend/src/Services/ArcPayService', () => harness('arcPay'));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

let originalTz;
beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});
beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

/** A one-way connecting trip DEL -> BOM -> GOI, in the shape the results page hands over. */
function connecting(firstLeg, secondLeg) {
  const fare = offer({
    id: '1',
    itineraries: [{
      segments: [
        segment('DEL', 'BOM', ...firstLeg, { number: '101' }),
        segment('BOM', 'GOI', ...secondLeg, { number: '202' }),
      ],
    }],
  });
  vi.stubGlobal('fetch', airline());
  const flight = reviewFlight(fare, {
    stops: 1,
    segments: fare.itineraries[0].segments.map((s) => ({
      departure: { airport: s.departure.iataCode, at: s.departure.at, time: s.departure.at.slice(11, 16) },
      arrival: { airport: s.arrival.iataCode, at: s.arrival.at, time: s.arrival.at.slice(11, 16) },
      airline: { code: 'AI', name: 'Air India' },
      flightNumber: `AI ${s.number}`,
      duration: 'PT2H',
    })),
  });
  renderReviewPage(FlightBookingConfirmation, {
    state: { flightData: flight, searchData: { from: 'DEL', to: 'GOI', departDate: firstLeg[0].slice(0, 10) } },
  });
}

describe('flight times seen from New York on its spring-forward day', () => {
  it("prints a connecting flight's departure as the airport's clock reads it", async () => {
    // DEL 02:40 -> BOM 04:40, then BOM 06:00 -> GOI 07:15 (all Indian clocks).
    connecting(['2027-03-14T02:40:00', '2027-03-14T04:40:00'], ['2027-03-14T06:00:00', '2027-03-14T07:15:00']);

    await screen.findByLabelText(/First Name/);
    // The airline's time is 02:40. The page must not move it an hour.
    expect(screen.queryByText('03:40')).toBeNull();
    expect(screen.getByText('02:40')).toBeTruthy();
  });

  it('works out a connection across that hour as the airport clock reads it', async () => {
    // Land BOM 01:30, leave BOM 03:10: 1h 40m on the ground at Mumbai.
    connecting(['2027-03-13T23:20:00', '2027-03-14T01:30:00'], ['2027-03-14T03:10:00', '2027-03-14T04:25:00']);

    await screen.findByLabelText(/First Name/);
    expect(document.body.textContent).toContain('Connecting Time: 1h 40m');
  });

  it("prints a direct flight home (always drawn as a list of flights) as the airport's clock reads it", async () => {
    const fare = offer({
      id: '1',
      itineraries: [
        { segments: [segment('JFK', 'LHR', '2027-03-07T19:00:00', '2027-03-08T07:00:00', { carrier: 'BA', number: '112' })] },
        { segments: [segment('LHR', 'JFK', '2027-03-14T02:30:00', '2027-03-14T05:30:00', { carrier: 'BA', number: '113' })] },
      ],
    });
    vi.stubGlobal('fetch', airline());
    renderReviewPage(FlightBookingConfirmation, {
      state: { flightData: reviewFlight(fare), searchData: { from: 'JFK', to: 'LHR', departDate: '2027-03-07', returnDate: '2027-03-14' } },
    });

    await screen.findByLabelText(/First Name/);
    const returnLeg = document.querySelector('[data-return-leg]');
    expect(returnLeg).toBeTruthy();
    expect(returnLeg.textContent).not.toContain('03:30');
    expect(returnLeg.textContent).toContain('02:30');
  });
});

describe('flight times on an ordinary day, as before', () => {
  it('prints each time and the connection in hours and minutes', async () => {
    connecting(['2026-11-15T08:00:00', '2026-11-15T10:05:00'], ['2026-11-15T12:05:00', '2026-11-15T13:20:00']);

    await screen.findByLabelText(/First Name/);
    ['08:00', '10:05', '12:05', '13:20'].forEach((time) => expect(screen.getByText(time)).toBeTruthy());
    expect(document.body.textContent).toContain('Connecting Time: 2h 0m');
  });

  it('counts a connection that runs past midnight', async () => {
    connecting(['2026-11-15T21:00:00', '2026-11-15T23:30:00'], ['2026-11-16T01:10:00', '2026-11-16T02:25:00']);

    await screen.findByLabelText(/First Name/);
    expect(screen.getByText('23:30')).toBeTruthy();
    expect(screen.getByText('01:10')).toBeTruthy();
    expect(document.body.textContent).toContain('Connecting Time: 1h 40m');
  });

  it('prints a midnight departure as 00:05, not 24:05', async () => {
    connecting(['2026-11-15T00:05:00', '2026-11-15T02:10:00'], ['2026-11-15T04:00:00', '2026-11-15T05:15:00']);

    await screen.findByLabelText(/First Name/);
    expect(screen.getByText('00:05')).toBeTruthy();
    expect(screen.queryByText('24:05')).toBeNull();
  });

  it('shows no connection time for flights whose times are out of order', async () => {
    connecting(['2026-11-15T08:00:00', '2026-11-15T10:00:00'], ['2026-11-15T09:00:00', '2026-11-15T11:00:00']);

    await screen.findByLabelText(/First Name/);
    expect(document.body.textContent).toContain('Change planes at');
    expect(document.body.textContent).not.toContain('Connecting Time');
  });

  it('prints a direct flight out, drawn from the times the results page gave, unchanged', async () => {
    const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2027-03-14T02:40:00', '2027-03-14T04:40:00')] }] });
    vi.stubGlobal('fetch', airline());
    renderReviewPage(FlightBookingConfirmation, {
      state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2027-03-14' } },
    });

    await screen.findByLabelText(/First Name/);
    expect(screen.getAllByText('02:40').length).toBeGreaterThan(0);
    expect(screen.getAllByText('04:40').length).toBeGreaterThan(0);
    expect(screen.queryByText('03:40')).toBeNull();
  });
});
