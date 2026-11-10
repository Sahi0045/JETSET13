import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, priceConfigRead, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

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

/**
 * The review page appears before the admin price settings arrive.
 *
 * It used to wait for them before showing anything. On 10 Nov 2026 that read
 * stalled for 45 seconds on the live site, behind "Loading your booking
 * details...". The flight and the traveller forms need no fee; only the charge
 * does, so only the fare summary and Pay wait.
 */

const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-12-10T08:00:00', '2026-12-10T10:00:00')] }] });
const open = () => renderReviewPage(FlightBookingConfirmation, {
  state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-12-10' } },
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', airline());
});
afterEach(() => {
  priceConfigRead.current = priceConfigRead.settled;
  vi.unstubAllGlobals();
});

describe('while the price settings are loading', () => {
  it('shows the flight and the traveller form, with no total and no way to pay', async () => {
    priceConfigRead.current = { data: undefined, error: null, refetch: () => {} };
    open();

    expect(await screen.findByText('Review your Booking')).toBeTruthy();
    expect(screen.getByLabelText(/First Name/)).toBeTruthy();
    expect(screen.getByText('Adding the platform fee to your total…')).toBeTruthy();
    expect(screen.queryByText(/^Pay US\$/)).toBeNull();
    expect(screen.queryByText('Platform Fee')).toBeNull();
    expect(screen.getByRole('button', { name: /Proceed to Payment/ }).disabled).toBe(true);
    expect(screen.queryByText('Cancellation policy')).toBeNull();
  });
});

describe('when the price settings cannot be read', () => {
  it('keeps the page and offers to try again, instead of replacing it with an error', async () => {
    const refetch = vi.fn();
    priceConfigRead.current = { data: undefined, error: new Error('Pricing configuration is temporarily unavailable'), refetch };
    open();

    expect(await screen.findByText('Review your Booking')).toBeTruthy();
    expect(screen.queryByText("We can't show this booking")).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Proceed to Payment/ }).disabled).toBe(true);
  });
});

describe('once the price settings are in', () => {
  it('shows the total with the fee and lets the customer pay', async () => {
    open();

    expect(await screen.findByText('Platform Fee')).toBeTruthy();
    expect(screen.getByText(/^Pay US\$210\.00/)).toBeTruthy();
    expect(screen.getByText('Total in USD')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Proceed to Payment/ }).disabled).toBe(false);
  });
});
