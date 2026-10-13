import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
vi.mock('../../frontend/src/Pages/Common/flights/FlightFareRules', () => harness('nothing'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCancellationPolicy', () => harness('nothing'));

const checkout = vi.hoisted(() => ({ calls: [], answer: null }));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: {
    createHostedCheckout: async (request) => {
      checkout.calls.push(request);
      return { success: false, error: checkout.answer };
    },
  },
}));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });
const searchData = { from: 'DEL', to: 'BOM', departDate: '2026-11-15' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const voucherOk = () => json(200, { success: true, data: { kind: 'trip', code: 'SHUBHAM', coins: 5000 } });
const server = { voucher: voucherOk, voucherRequests: [], couponRequests: [], walletBalance: 0 };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  checkout.calls = [];
  checkout.answer = { error: 'Declined in test.' };
  server.voucher = voucherOk;
  server.voucherRequests = [];
  server.couponRequests = [];
  server.walletBalance = 0;
  const flights = airline();
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    const target = String(url);
    if (target.endsWith('/wallet')) {
      return Promise.resolve(json(200, { success: true, data: { balance: server.walletBalance, balanceUsd: server.walletBalance / 100, held: 0, entries: [], pending: [] } }));
    }
    if (target.includes('/wallet/voucher-check')) {
      server.voucherRequests.push(JSON.parse(init?.body || '{}'));
      return Promise.resolve(server.voucher());
    }
    if (target.includes('/coupons/validate')) {
      const body = JSON.parse(init?.body || '{}');
      server.couponRequests.push(body);
      return Promise.resolve(body.code === 'SAVE20'
        ? json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE20' }, discountAmount: 20, finalTotal: 190 })
        : json(404, { success: false, message: 'Invalid or expired coupon code.' }));
    }
    return flights(url, init);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete Element.prototype.scrollIntoView;
});

async function openPage() {
  renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData } });
  fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Female' }));
  fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });
}

const typeCode = (code) => {
  fireEvent.change(screen.getByPlaceholderText('Coupon or voucher code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
};
const page = () => document.body.textContent;
const payButton = async (amount) => (await screen.findAllByRole('button', { name: new RegExp(`^Pay US\\$${amount.replace('.', '\\.')}`) }))[0];

describe('a trip-reward voucher on the review page', () => {
  it('takes a voucher in the coupon box, shows it, and sends it to checkout at the same price', async () => {
    await openPage();
    typeCode('shubham');

    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));
    expect(page()).toMatch(/You'll get 5,000 Jet Coins after your trip/);
    expect(server.couponRequests[0]).toMatchObject({ code: 'SHUBHAM', bookingType: 'flights' });
    expect(server.voucherRequests).toEqual([{ code: 'SHUBHAM' }]);

    fireEvent.click(await payButton('210.00'));
    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0]).toMatchObject({ amount: 210, voucherCode: 'SHUBHAM' });
    expect(checkout.calls[0].couponCode).toBeUndefined();
  });

  it('says why a voucher was refused, and sends none to checkout', async () => {
    server.voucher = () => json(409, { success: false, code: 'VOUCHER_FIRST_TIME_ONLY', error: 'This voucher is for first-time customers only.' });
    await openPage();
    typeCode('SHUBHAM');

    expect(await screen.findByText('This voucher is for first-time customers only.')).toBeTruthy();
    fireEvent.click(await payButton('210.00'));
    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0].voucherCode).toBeUndefined();
  });

  it('takes the voucher off when checkout refuses it, and says why', async () => {
    checkout.answer = { code: 'VOUCHER_USED_UP', error: 'This voucher has been fully used.' };
    await openPage();
    typeCode('SHUBHAM');
    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));

    fireEvent.click(await payButton('210.00'));

    await waitFor(() => expect(page()).toMatch(/This voucher has been fully used\. The voucher has been removed\. Nothing has been charged\./));
    expect(page()).not.toMatch(/Voucher SHUBHAM: 5,000/);
  });

  it('keeps the voucher, the coupon and the coins when checkout cannot check the voucher, and brings the message into view each time', async () => {
    const scrolled = [];
    Element.prototype.scrollIntoView = vi.fn(function scrollIntoView() { scrolled.push(this); });
    checkout.answer = { code: 'VOUCHER_UNAVAILABLE', error: 'We could not check your voucher just now. Please try again in a moment. Nothing has been charged.' };
    server.walletBalance = 5000;
    await openPage();
    typeCode('SAVE20');
    await payButton('190.00');
    typeCode('SHUBHAM');
    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));
    fireEvent.click(await screen.findByRole('switch'));

    fireEvent.click(await payButton('140.00'));

    const message = await screen.findByText(checkout.answer.error);
    await waitFor(() => expect(scrolled).toEqual([message]));
    expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/);
    expect(page()).toMatch(/Coupon\s*SAVE20\s*applied/);
    expect(screen.getByRole('switch').checked).toBe(true);
    expect(checkout.calls).toHaveLength(1);

    fireEvent.click(await payButton('140.00'));

    await waitFor(() => expect(scrolled).toEqual([message, message]));
    expect(checkout.calls).toHaveLength(2);
    expect(checkout.calls[1]).toMatchObject({ amount: 140, walletCoins: 5000, couponCode: 'SAVE20', voucherCode: 'SHUBHAM' });
  });

  it('keeps a coupon and a voucher on one booking, each on its own line, the price taking only the coupon', async () => {
    await openPage();
    typeCode('SAVE20');
    await payButton('190.00');
    typeCode('SHUBHAM');

    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));
    expect(page()).toMatch(/Coupon\s*SAVE20\s*applied/);
    expect(screen.getAllByRole('button', { name: /^Pay US\$190\.00/ }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Remove voucher SHUBHAM' }));

    expect(page()).not.toMatch(/Voucher SHUBHAM: 5,000/);
    expect(page()).toMatch(/Coupon\s*SAVE20\s*applied/);
  });

  it('puts a voucher back after a cancelled payment, once it has been checked again', async () => {
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify({
      selectedFlight: reviewFlight(fare),
      searchData,
      passengerData: [{ id: 1, type: 'ADULT', firstName: 'Jane', lastName: 'Doe', gender: 'female', mobile: '5550100', countryCode: '+1' }],
      bookingDetails: { contact: { email: 'traveller@example.com', phone: '5550100', countryCode: '1' } },
      amount: 210,
      voucherCode: 'SHUBHAM',
    }));

    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));
    expect(server.voucherRequests).toEqual([{ code: 'SHUBHAM' }]);
  });
});
