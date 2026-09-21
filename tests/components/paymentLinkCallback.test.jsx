import React from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: PaymentCallback } = await import('../../frontend/src/Pages/Common/PaymentCallback.jsx');

/**
 * Where ARC returns a payment-link payer.
 *
 * complete-payment-link answers 403 when the payment cannot be verified and
 * 402 when the gateway holds no capture for it. The page read the body, never
 * looked at `success`, said "Payment confirmed!" and opened the receipt - which
 * prints "Payment Successful!" and PAID for any payment it is given. A request
 * that never answered said "Your payment went through" and did the same.
 */

const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

let replies = [];
const stubServer = () => vi.stubGlobal('fetch', vi.fn(async () => {
  const next = replies.length > 1 ? replies.shift() : replies[0];
  if (next instanceof Error) throw next;
  return next;
}));

const renderCallback = () => render(
  <MemoryRouter initialEntries={['/payment/callback?orderId=PL-5a6b7c8d-A1B2C3D4E5&bookingType=flight&paymentLinkToken=tok-1&resultIndicator=SI-1']}>
    <Routes>
      <Route path="/payment/callback" element={<PaymentCallback />} />
      <Route path="/payment/success" element={<p>receipt page</p>} />
      <Route path="/payment/failed" element={<p>failed page</p>} />
    </Routes>
  </MemoryRouter>
);

/** Let the page ask, wait and move on, however long it waits. */
const settle = async (ms = 20_000) => {
  for (let waited = 0; waited < ms; waited += 500) {
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  replies = [];
  stubServer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const expectNoAssurance = (text) => {
  expect(text).not.toMatch(/confirmed!|went through|Payment received|receipt page|Successful/i);
};

describe('a payment-link payer returning from ARC', () => {
  it('is shown the receipt once the payment is confirmed', async () => {
    replies = [answer(200, { success: true, paymentId: 'pay-1' })];
    const { container } = renderCallback();

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(container.textContent).toMatch(/Payment confirmed/);
    await settle(3000);
    expect(container.textContent).toMatch(/receipt page/);
  });

  it('is not told the payment is confirmed when it could not be verified', async () => {
    replies = [answer(403, { success: false, error: 'This payment could not be verified' })];
    const { container } = renderCallback();

    await settle();
    expectNoAssurance(container.textContent);
    expect(container.textContent).toMatch(/could not verify/i);
    expect(container.textContent).toMatch(/\(877\) 538-7380/);
    expect(container.textContent).not.toMatch(/Redirecting/);
  });

  it('is not told the payment is confirmed when the gateway holds none, and can go back to the link', async () => {
    replies = [answer(402, { success: false, error: 'This payment has not been captured' })];
    const { container } = renderCallback();

    await settle();
    expectNoAssurance(container.textContent);
    expect(container.querySelector('a[href="/pay/tok-1"]')).not.toBeNull();
  });

  it('is asked to wait while the gateway cannot be reached, and shown the receipt when it answers', async () => {
    replies = [
      answer(402, { success: false, retryable: true, error: 'We could not reach the payment gateway' }),
      answer(200, { success: true, paymentId: 'pay-1' }),
    ];
    const { container } = renderCallback();

    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toMatch(/receipt page/);
  });

  it('is not told the payment is confirmed when the gateway never answers', async () => {
    replies = [answer(402, { success: false, retryable: true, error: 'We could not reach the payment gateway' })];
    const { container } = renderCallback();

    await settle();
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    expectNoAssurance(container.textContent);
    expect(container.textContent).toMatch(/do not pay again/i);
  });

  it('is not told the payment went through when the request itself failed', async () => {
    replies = [new TypeError('Failed to fetch')];
    const { container } = renderCallback();

    await settle();
    expectNoAssurance(container.textContent);
    expect(container.textContent).toMatch(/\(877\) 538-7380/);
  });
});
