import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, priceConfig, renderReviewPage, reviewFlight, segment, signedInUser, where } from './reviewPageHarness.jsx';

/**
 * The flight review page with a Jet Coins balance.
 *
 * The page sends the coins it expects to use and the card amount it works out;
 * checkout recomputes both from the balance and refuses with PRICE_CHANGED when
 * the amount differs from its own, so the page's figure has to be the server's:
 * never less than $1.00 left on the card, the coupon taken off first.
 */

const harness = async (name) => (await import('./reviewPageHarness.jsx')).pageMocks[name];
const authState = vi.hoisted(() => ({ user: undefined }));
vi.mock('../../frontend/src/Pages/Common/Navbar', () => harness('navbar'));
vi.mock('../../frontend/src/Pages/Common/Footer', () => harness('footer'));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => harness('pageWrapper'));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', async () => {
  const { signedInUser: user } = await import('./reviewPageHarness.jsx');
  const signedIn = { user, loading: false, renewServerSession: async () => true };
  const guest = { user: null, loading: false, renewServerSession: async () => false };
  return { useSupabaseAuth: () => (authState.user === null ? guest : signedIn) };
});
vi.mock('../../frontend/src/hooks/queries', async () => {
  const { pageMocks } = await import('./reviewPageHarness.jsx');
  return { ...pageMocks.queries, useGuestFlightBooking: () => ({ isSuccess: true, data: true, isPending: false }) };
});
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
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const walletBody = (balance, held = 0) => ({ success: true, data: { balance, balanceUsd: balance / 100, held, entries: [] } });

const wallets = { replies: [], requests: 0 };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  checkout.calls = [];
  checkout.answer = { error: 'Declined in test.' };
  authState.user = undefined;
  wallets.replies = [];
  wallets.requests = 0;
  priceConfig.flight_coin_bands = [{ from: 0, usd: 1000 }];
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete priceConfig.flight_coin_bands;
});

/** The review page for a 200 + 10 fee = 210 trip, the lead traveller typed in. */
const openPage = (...balances) => openPageFor(fare, ...balances);

async function openPageFor(amadeusOffer, ...balances) {
  wallets.replies = balances.map((entry) => (typeof entry === 'number' ? walletBody(entry) : entry));
  const flights = airline();
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    const target = String(url);
    if (target.endsWith('/wallet')) {
      wallets.requests += 1;
      const reply = wallets.replies.length > 1 ? wallets.replies.shift() : wallets.replies[0];
      return Promise.resolve(reply ? json(200, reply) : json(401, { success: false }));
    }
    if (target.includes('/coupons/validate')) {
      return Promise.resolve(json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE20' }, discountAmount: 20, finalTotal: 190 }));
    }
    return flights(url, init);
  }));

  renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(amadeusOffer), searchData: { from: 'DEL', to: 'BOM', departDate: '2026-11-15' } } });

  fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Female' }));
  fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });
}

const payButton = async (amount) => (await screen.findAllByRole('button', { name: new RegExp(`^Pay US\\$${amount.replace('.', '\\.')}`) }))[0];

describe('paying part of a flight with Jet Coins', () => {
  it('offers the switch to a signed-in customer with coins, and sends the coins and the card amount', async () => {
    await openPage(5000);
    fireEvent.click(await screen.findByRole('switch'));

    expect(document.body.textContent).toMatch(/−\$50\.00/);
    fireEvent.click(await payButton('160.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0].amount).toBe(160);
    expect(checkout.calls[0].walletCoins).toBe(5000);
  });

  it('shows the coins as their own line in the summary, beside the total', async () => {
    await openPage(5000);
    expect(screen.queryByText('5,000 coins')).toBeNull();
    fireEvent.click(await screen.findByRole('switch'));

    expect(await screen.findByText('5,000 coins')).toBeTruthy();
    expect(screen.getByText('Jet Coins')).toBeTruthy();
  });

  it('sends no coins while the switch is off', async () => {
    await openPage(5000);
    await screen.findByRole('switch');
    fireEvent.click(await payButton('210.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0].amount).toBe(210);
    expect(checkout.calls[0].walletCoins).toBeUndefined();
  });

  it('leaves $1.00 on the card when the balance is bigger than the trip', async () => {
    await openPage(50000);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('1.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0].amount).toBe(1);
    expect(checkout.calls[0].walletCoins).toBe(20900);
  });

  it('takes the coupon off first, then the coins', async () => {
    await openPage(5000);
    fireEvent.change(screen.getByPlaceholderText('Coupon or voucher code'), { target: { value: 'SAVE20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await payButton('190.00');
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('140.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0]).toMatchObject({ amount: 140, walletCoins: 5000, couponCode: 'SAVE20' });
  });

  it('shows no switch to a customer with no coins', async () => {
    await openPage(0);
    await payButton('210.00');
    await waitFor(() => expect(wallets.requests).toBeGreaterThan(0));
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('does not ask for a wallet, or show a switch, when nobody is signed in', async () => {
    authState.user = null;
    await openPage(5000);
    await payButton('210.00');
    expect(wallets.requests).toBe(0);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(signedInUser.id).toBe('user-1');
  });

  it('shows no switch when the wallet cannot be read', async () => {
    await openPage(undefined);
    await payButton('210.00');
    await waitFor(() => expect(wallets.requests).toBeGreaterThan(0));
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('the coins one booking may use', () => {
  beforeEach(() => { delete priceConfig.flight_coin_bands; });

  it('uses at most $4 of coins on a $200 fare, and says so', async () => {
    await openPage(5000);
    expect(await screen.findByText(/This booking can use up to \$4\.00 of your Jet Coins/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('206.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0]).toMatchObject({ amount: 206, walletCoins: 400 });
  });

  it('reads the band from the base fare, not the fare with taxes', async () => {
    const taxed = offer({ id: '1', total: '170.36', itineraries: fare.itineraries });
    taxed.price.base = '141.00';
    await openPageFor(taxed, 5000);
    expect(await screen.findByText(/This booking can use up to \$3\.00 of your Jet Coins/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('177.36'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0]).toMatchObject({ amount: 177.36, walletCoins: 300 });
  });

  it('follows the bands an admin saved, by the airline fare without our fee', async () => {
    priceConfig.flight_coin_bands = [{ from: 0, usd: 2 }, { from: 205, usd: 7 }];
    await openPage(5000);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('208.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0]).toMatchObject({ amount: 208, walletCoins: 200 });
  });

  it('picks the band from the fare, before the coupon', async () => {
    await openPage(5000);
    fireEvent.change(screen.getByPlaceholderText('Coupon or voucher code'), { target: { value: 'SAVE20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await payButton('190.00');
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('186.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0]).toMatchObject({ amount: 186, walletCoins: 400, couponCode: 'SAVE20' });
  });
});

describe('the Jet Coins a booking earns', () => {
  it('says how many coins the card amount earns, and fewer once coins pay part of it', async () => {
    await openPage(5000);
    await screen.findByRole('switch');
    expect(document.body.textContent).toMatch(/You'll earn 210 Jet Coins \(\$2\.10\) on this booking/);
    fireEvent.click(screen.getByRole('switch'));
    await payButton('160.00');
    expect(document.body.textContent).toMatch(/You'll earn 160 Jet Coins \(\$1\.60\) on this booking/);
  });

  it('says what the booking earns to a signed-in customer with no coins yet', async () => {
    await openPage(0);
    await payButton('210.00');
    await waitFor(() => expect(document.body.textContent).toMatch(/You'll earn 210 Jet Coins \(\$2\.10\) on this booking/));
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('asks a guest to log in to earn them, below the coupon box, and the button goes to log in', async () => {
    authState.user = null;
    await openPage(5000);
    await payButton('210.00');
    expect(document.body.textContent).toMatch(/Log in to earn 210 Jet Coins \(\$2\.10\) on this booking and use your Jet Coins at checkout\./);
    expect(document.body.textContent).not.toMatch(/You'll earn/);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(where.current.pathname).toBe('/login'));
  });
});

describe('checkout refusing the coins', () => {
  it.each(['WALLET_CHANGED', 'WALLET_UNAVAILABLE'])('on %s, says why, turns the coins off and reads the balance again', async (code) => {
    checkout.answer = { code, error: 'Your Jet Coins changed while you were paying. Nothing has been charged.' };
    await openPage(5000, 3000);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('160.00'));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Your Jet Coins changed while you were paying\. Nothing has been charged\./);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pay US\$210\.00/ }).length).toBeGreaterThan(0));
    expect(wallets.requests).toBe(2);
    await waitFor(() => expect(document.body.textContent).toMatch(/3,000 Jet Coins available/));
    expect(screen.getByRole('switch').checked).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends the coins that are left on the next Pay, after the balance dropped behind the page', async () => {
    checkout.answer = { code: 'WALLET_CHANGED', error: 'Your Jet Coins changed while you were checking out. Please review the total and try again. Nothing has been charged.' };
    await openPage(5000, 3000);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(await payButton('160.00'));
    await screen.findByRole('alert');
    await waitFor(() => expect(document.body.textContent).toMatch(/3,000 Jet Coins available/));

    checkout.answer = { error: 'Declined in test.' };
    fireEvent.click(screen.getByRole('switch'));
    expect((await screen.findAllByRole('button', { name: /^Pay US\$180\.00/ })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(await payButton('180.00'));

    await waitFor(() => expect(checkout.calls).toHaveLength(2));
    expect(checkout.calls[0]).toMatchObject({ amount: 160, walletCoins: 5000 });
    expect(checkout.calls[1]).toMatchObject({ amount: 180, walletCoins: 3000 });
  });
});
