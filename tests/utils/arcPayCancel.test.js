import { afterEach, describe, expect, it, vi } from 'vitest';
import ArcPayService, { CANCEL_BOOKING_URL, CANCEL_TIMEOUT_MS } from '../../frontend/src/Services/ArcPayService.js';

/**
 * Cancelling a booking from Manage Booking.
 *
 * The request shared the service's 10-second timeout. Cancelling with the
 * airline and refunding takes longer, so the page gave up while the cancel
 * went through, and showed "timeout of 10000ms exceeded".
 */

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cancelBooking', () => {
  it('waits a full minute rather than ten seconds, and reports a timeout as unconfirmed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
    })));

    let settled = false;
    const pending = ArcPayService.cancelBooking('FLT1', null, 'Change of plans').then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(10_001);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS);
    const result = await pending;

    expect(CANCEL_TIMEOUT_MS).toBe(60_000);
    expect(result).toMatchObject({ success: false, timedOut: true });
    expect(result.error).not.toMatch(/timeout of|exceeded|ECONNABORTED/);
  });

  it('posts to the one cancel endpoint and passes the outcome on', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, cancellation: { paymentAction: 'REFUND', refundAmount: 291 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ArcPayService.cancelBooking('FLT1', 'jane@example.com', 'Other');

    expect(fetchMock.mock.calls[0][0]).toBe(CANCEL_BOOKING_URL);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ bookingReference: 'FLT1', email: 'jane@example.com', reason: 'Other' });
    expect(result).toMatchObject({ success: true, cancellation: { paymentAction: 'REFUND', refundAmount: 291 } });
  });

  it("gives the server's refusal in its words, and no raw network message", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { success: false, error: 'This booking cannot be cancelled online.' })));
    expect((await ArcPayService.cancelBooking('FLT1')).error).toBe('This booking cannot be cancelled online.');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const offline = await ArcPayService.cancelBooking('FLT1');
    expect(offline.timedOut).toBeUndefined();
    expect(offline.error).not.toMatch(/Failed to fetch/);
    expect(offline.error).toMatch(/could not reach our servers/);
  });
});
