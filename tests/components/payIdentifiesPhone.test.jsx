import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

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

const crm = vi.hoisted(() => ({ crmIdentify: vi.fn(), crmTrack: vi.fn() }));
vi.mock('../../frontend/src/lib/crm', () => crm);

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  crm.crmIdentify.mockClear();
});

describe('pressing Pay', () => {
  it('tells the CRM the mobile number the lead traveller typed, with its calling code', async () => {
    vi.stubGlobal('fetch', vi.fn(airline()));
    const flight = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });
    renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(flight), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

    fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });
    fireEvent.click((await screen.findAllByRole('button', { name: /^Pay US\$/ }))[0]);

    await waitFor(() => expect(crm.crmIdentify).toHaveBeenCalled());
    const [, traits] = crm.crmIdentify.mock.calls.at(-1);
    expect(traits.phone).toBe('+1 5550100');
  });
});
