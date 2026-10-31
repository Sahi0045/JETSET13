import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

/**
 * Booking.com repeats what the chosen fare includes on the step where the
 * traveller details go. Ours said only the bags and "Refunds: see fare rules",
 * though "Choose your fare" had just read the airline's terms.
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

const fare = () => offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'HYD', '2026-11-06T09:40:00', '2026-11-06T11:55:00', { carrier: 'AI', number: '2542' })] }] });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', airline());
});

describe('the review page', () => {
  it('says what the chosen fare includes', async () => {
    const flight = reviewFlight(fare(), {
      brandedFareLabel: 'ECO FLEX',
      baggage: { cabin: null, checked: { weight: 25, weightUnit: 'KG' } },
      fareServices: [
        { text: 'PRE RESERVED SEAT ASSIGNMENT', status: 'included' },
        { text: 'CHANGEABLE TICKET', status: 'included' },
        { text: 'REFUNDABLE TICKET', status: 'charged' },
      ],
    });
    renderReviewPage(FlightBookingConfirmation, { state: { flightData: flight, searchData: { from: 'DEL', to: 'HYD', departDate: '2026-11-06' } } });

    const box = await screen.findByTestId('review-fare-inclusions');
    expect(within(box).getByText('Eco Flex fare includes')).toBeTruthy();
    expect(within(box).getByText('25 kg checked bag')).toBeTruthy();
    expect(within(box).getByText('Date change included')).toBeTruthy();
    expect(within(box).getByText('Cancellation for a fee')).toBeTruthy();
    expect(within(box).getByText('Free seat selection')).toBeTruthy();
  });

  it('says nothing more when the airline stated nothing about the fare', async () => {
    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare()), searchData: { from: 'DEL', to: 'HYD', departDate: '2026-11-06' } } });

    await screen.findAllByText(/DEL/);
    expect(screen.queryByTestId('review-fare-inclusions')).toBeNull();
  });
});

// Air India DEL-HYD (PDT, 31 Oct): the search read the penalty text as
// non-refundable, and the strip said so beside the airline's own "refund for
// a fee" and a 999-rupee cancellation fee in the fare rules.
describe('the refund line on the review page', () => {
  it('follows the airline\'s terms for the chosen fare', async () => {
    const flight = reviewFlight(fare(), {
      refundable: false,
      fareServices: [{ text: 'REFUNDABLE TICKET', status: 'charged' }],
    });
    renderReviewPage(FlightBookingConfirmation, { state: { flightData: flight, searchData: { from: 'DEL', to: 'HYD', departDate: '2026-11-06' } } });

    await screen.findByTestId('review-fare-inclusions');
    expect(screen.queryByText('Non-refundable')).toBeNull();
    expect(screen.getAllByText('Cancellation for a fee').length).toBeGreaterThan(0);
  });

  it('keeps the search\'s word when the airline states no terms', async () => {
    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare(), { refundable: false }), searchData: { from: 'DEL', to: 'HYD', departDate: '2026-11-06' } } });

    expect(await screen.findByText('Non-refundable')).toBeTruthy();
  });
});

// Booking.com gives each bag's size; Amadeus sends weights only, so these are
// Air India's published limits (airindia.com cabin baggage page, 31 Oct 2026).
describe('the review page\'s bag sizes', () => {
  it('gives the airline\'s size limits for the cabin booked', async () => {
    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare(), { cabin: 'BUSINESS' }), searchData: { from: 'DEL', to: 'HYD', departDate: '2026-11-06' } } });

    const sizes = await screen.findByTestId('bag-size-limits');
    expect(sizes.textContent).toContain('Air India size limits');
    expect(sizes.textContent).toContain('Cabin bag: 55 × 40 × 20 cm · 10 kg');
    expect(sizes.textContent).toContain('Checked bag: 158 cm in total');
  });
});

