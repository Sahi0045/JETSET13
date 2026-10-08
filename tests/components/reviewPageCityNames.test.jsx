import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';
import { clearCache } from '../../frontend/src/Services/AirportService.js';

/**
 * The review page names an airport the built-in list does not have.
 *
 * Its segment cards printed the city name the results page had written from
 * airports.js ("DBR") and "DBR Airport" beneath it.
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

beforeEach(() => {
  clearCache();
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the review page', () => {
  it('names Darbhanga on the flight it is reviewing', async () => {
    const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'DBR', '2026-11-18T13:25:00', '2026-11-18T15:20:00', { carrier: 'SG', number: '495' })] }] });
    const airlineFetch = airline();
    vi.stubGlobal('fetch', vi.fn((url, init) => (String(url).includes('/airports/search')
      ? Promise.resolve({ ok: true, json: async () => ({ success: true, data: [{ code: 'DBR', cityCode: 'DBR', name: 'Darbhanga Airport', cityName: 'Darbhanga' }] }) })
      : airlineFetch(url, init))));
    const flight = reviewFlight(fare, {
      segments: [{
        departure: { airport: 'DEL', at: '2026-11-18T13:25:00', time: '13:25', cityName: 'New Delhi' },
        arrival: { airport: 'DBR', at: '2026-11-18T15:20:00', time: '15:20', cityName: 'DBR' },
        airline: { code: 'SG', name: 'SpiceJet' },
        flightNumber: 'SG 495',
        duration: 'PT1H55M',
      }],
    });

    renderReviewPage(FlightBookingConfirmation, {
      state: { flightData: flight, searchData: { from: 'DEL', to: 'DBR', departDate: '2026-11-18' } },
    });

    expect((await screen.findAllByText('Darbhanga Airport')).length).toBeGreaterThan(0);
    expect(screen.queryByText('DBR Airport')).toBeNull();
  });
});
