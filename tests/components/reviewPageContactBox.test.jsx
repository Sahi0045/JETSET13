import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment, signedInUser } from './reviewPageHarness.jsx';

/**
 * The Contact Information box on the review page. Both fields were read-only
 * copies - the lead traveller's number and the account's email - so the owner
 * could not change either where they were shown (28 Oct).
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

const checkout = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: {
    createHostedCheckout: async (request) => {
      checkout.calls.push(request);
      return { success: false, error: { error: 'Declined in test.' } };
    },
  },
}));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  checkout.calls = [];
  vi.stubGlobal('fetch', airline());
});
afterEach(() => vi.unstubAllGlobals());

async function openPage() {
  renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });
  fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Female' }));
}

async function pay() {
  fireEvent.click((await screen.findAllByRole('button', { name: /^Pay US\$/ }))[0]);
  await waitFor(() => expect(checkout.calls).toHaveLength(1));
  return checkout.calls[0];
}

describe('the contact box', () => {
  it('takes the mobile number, as the lead traveller\'s', async () => {
    await openPage();
    fireEvent.change(screen.getByLabelText('Contact mobile number'), { target: { value: '555-0100' } });

    expect(screen.getByLabelText(/^Mobile No/).value).toBe('5550100');
    expect((await pay()).customerPhone).toBe('5550100');
  });

  it('shows the account email, and sends the one typed over it', async () => {
    await openPage();
    fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });
    const email = screen.getByLabelText('Contact email address');
    expect(email.value).toBe(signedInUser.email);

    fireEvent.change(email, { target: { value: 'tickets@example.com' } });

    expect((await pay()).customerEmail).toBe('tickets@example.com');
  });

  it('goes back to the account email when left empty', async () => {
    await openPage();
    fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });
    const email = screen.getByLabelText('Contact email address');

    fireEvent.change(email, { target: { value: '' } });
    expect(email.value).toBe('');
    fireEvent.blur(email);

    expect(email.value).toBe(signedInUser.email);
    expect((await pay()).customerEmail).toBe(signedInUser.email);
  });
});
