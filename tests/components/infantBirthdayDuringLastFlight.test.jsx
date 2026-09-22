import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

/**
 * The traveller check on the page where the customer confirms and pays, for
 * an infant whose second birthday falls while the last flight is in the air.
 *
 * The page read the infant's later age on the day the last flight lands, so a
 * baby on an overnight flight that leaves the day before the birthday was
 * never marked ready, and Pay listed "under 2 on every flight of the trip" -
 * while the baby is 1 when every flight departs. Checkout's side is tested in
 * tests/backend/infantBirthdayDuringLastFlight.test.js.
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
vi.mock('../../frontend/src/Pages/Common/flights/FlightFareRules', () => harness('nothing'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCancellationPolicy', () => harness('nothing'));
vi.mock('../../frontend/src/Services/ArcPayService', () => harness('arcPay'));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

// A domestic red-eye, one adult and a lap infant: DEL 23:30 on 15 Nov, BOM
// 01:40 on 16 Nov. Domestic, so no passports are asked for.
async function redEyeWithInfant(infantBirthday) {
  const fare = offer({
    id: '1',
    types: ['ADULT', 'HELD_INFANT'],
    itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T23:30:00', '2026-11-16T01:40:00')] }],
  });
  vi.stubGlobal('fetch', airline());
  renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

  const firstNames = await screen.findAllByLabelText(/First Name/);
  const lastNames = screen.getAllByLabelText(/Last Name/);
  const females = screen.getAllByRole('button', { name: 'Female', hidden: true });
  fireEvent.change(firstNames[0], { target: { value: 'Jane' } });
  fireEvent.change(lastNames[0], { target: { value: 'Doe' } });
  fireEvent.click(females[0]);
  fireEvent.change(screen.getAllByLabelText(/^Mobile No/)[0], { target: { value: '5550100' } });

  fireEvent.change(firstNames[1], { target: { value: 'Mia' } });
  fireEvent.change(lastNames[1], { target: { value: 'Doe' } });
  fireEvent.click(females[1]);
  fireEvent.change(screen.getAllByLabelText(/Date of Birth/)[1], { target: { value: infantBirthday } });
}

const progress = () => document.body.textContent.match(/Infant \d\/\d added/)?.[0];

describe('an infant on an overnight last flight', () => {
  it('is ready to pay for when the second birthday is the day the flight lands', async () => {
    await redEyeWithInfant('2024-11-16');

    expect(progress()).toBe('Infant 1/1 added');
    // Pay goes on to the payment service (which declines in this test)
    // rather than stopping at the traveller details.
    fireEvent.click(screen.getAllByRole('button', { name: /^Pay US\$/ })[0]);
    expect(await screen.findByText(/Please try again in a moment/)).toBeTruthy();
    expect(screen.queryByText('Check the traveller details')).toBeNull();
    expect(screen.queryByText(/under 2 on every flight/)).toBeNull();
  });

  it('is still refused when the second birthday is the day the flight leaves', async () => {
    await redEyeWithInfant('2024-11-15');

    expect(progress()).toBe('Infant 0/1 added');
    fireEvent.click(screen.getAllByRole('button', { name: /^Pay US\$/ })[0]);
    expect(await screen.findByText(/Infant fares are for travellers under 2 on the day of travel\./)).toBeTruthy();
  });

  it('is ready to pay for when under 2 the whole way', async () => {
    await redEyeWithInfant('2025-06-01');

    expect(progress()).toBe('Infant 1/1 added');
  });
});
