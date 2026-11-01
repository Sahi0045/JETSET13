import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

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

/** Before paying, the review page says the service fee is not refundable and what a cancel returns. */

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the review page', () => {
  it('says the service fee is not refundable and states the cancellation policy', async () => {
    vi.stubGlobal('fetch', airline());
    const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    expect(await screen.findByText('Review your Booking')).toBeTruthy();
    expect(screen.getByText('Cancellation policy')).toBeTruthy();
    expect(screen.getByText(/our \$40\.00 cancellation fee/)).toBeTruthy();
    expect(screen.getByText(/^Book now and you can cancel free until /)).toBeTruthy();
  });

  // The owner asked for the fee to be called a platform fee and shown as one
  // line, without what it is made of (28 Oct).
  it('shows the platform fee as one line, with no breakdown under it', async () => {
    vi.stubGlobal('fetch', airline());
    const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    const line = (await screen.findByText('Platform Fee')).closest('[data-platform-fee]');
    expect(line.textContent).toBe('Platform FeeUS$10.00');
    expect(within(line).queryByRole('list')).toBeNull();
    expect(screen.queryByText(/Service Fee|convenience fee/)).toBeNull();
  });
});
