import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { laterLegsOf, returnLegOf } from '../../frontend/src/utils/reviewTrip.js';

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
const { airline, offer, renderReviewPage, reviewFlight, segment } = await import('./reviewPageHarness.jsx');

const threeFlights = () => offer({
  id: '1',
  itineraries: [
    { segments: [segment('DEL', 'DXB', '2026-11-24T09:00:00', '2026-11-24T11:30:00', { carrier: 'EK', number: '511' })] },
    { segments: [segment('DXB', 'LHR', '2026-11-28T08:00:00', '2026-11-28T12:30:00', { carrier: 'EK', number: '3' })] },
    { segments: [
      segment('LHR', 'DXB', '2026-12-05T13:00:00', '2026-12-05T23:00:00', { carrier: 'EK', number: '6' }),
      segment('DXB', 'DEL', '2026-12-06T03:00:00', '2026-12-06T07:30:00', { carrier: 'EK', number: '516' }),
    ] },
  ],
});

const openJaw = () => offer({
  id: '1',
  itineraries: [
    { segments: [segment('DEL', 'DXB', '2026-11-24T09:00:00', '2026-11-24T11:30:00', { carrier: 'EK', number: '511' })] },
    { segments: [segment('LHR', 'DEL', '2026-12-05T13:00:00', '2026-12-06T02:00:00', { carrier: 'AI', number: '162' })] },
  ],
});

describe('the later flights of a multi-city trip', () => {
  it('are every itinerary after the first, with their stops', () => {
    const legs = laterLegsOf(reviewFlight(threeFlights()));

    expect(legs).toHaveLength(2);
    expect(legs[0].segments[0].departure.airport).toBe('DXB');
    expect(legs[1].stops).toBe(1);
    expect(returnLegOf(reviewFlight(threeFlights()))).toBeNull();
  });

  it('a two-flight open-jaw trip has a second flight, not a return', () => {
    expect(returnLegOf(reviewFlight(openJaw()))).toBeNull();
    expect(laterLegsOf(reviewFlight(openJaw()))).toHaveLength(1);
  });
});

describe('the review page for a multi-city trip', () => {
  it('shows every flight, numbered, and no return', async () => {
    vi.stubGlobal('fetch', airline());

    const { container } = renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(threeFlights()) } });

    expect(await screen.findByText('Flight 1')).toBeTruthy();
    expect(screen.getByText('Flight 2')).toBeTruthy();
    expect(screen.getByText('Flight 3')).toBeTruthy();
    expect(screen.queryByText('Return')).toBeNull();
    expect(container.querySelectorAll('[data-later-leg]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-later-leg]')[1].textContent).toMatch(/1 Stop/);
  });

  it('shows an open-jaw trip as two flights', async () => {
    vi.stubGlobal('fetch', airline());

    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(openJaw()) } });

    expect(await screen.findByText('Flight 2')).toBeTruthy();
    expect(screen.queryByText('Return')).toBeNull();
  });
});
