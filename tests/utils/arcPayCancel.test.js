import { afterEach, describe, expect, it, vi } from 'vitest';
import ArcPayService, { CANCEL_BOOKING_PATH, CANCEL_TIMEOUT_MS, flightCancelPath } from '../../frontend/src/Services/ArcPayService.js';

// The session's own headers, as authHeaders builds them for a signed-in owner.
vi.mock('../../frontend/src/utils/authHeaders', () => ({
  authHeaders: async (extra = {}) => ({ Authorization: 'Bearer test-token', ...extra }),
}));

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

    expect(fetchMock.mock.calls[0][0]).toBe(`/api/payments/${CANCEL_BOOKING_PATH}`);
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

/**
 * Flights are cancelled on the flights host, which can reach the airline. The
 * payments endpoint cannot, and now refuses a flight with a PNR.
 */
describe('cancelFlightBooking', () => {
  it('posts to the flights host with the session headers and credentials, and passes the outcome on', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, message: 'Booking cancelled', cancellation: { paymentAction: 'VOID', refundAmount: 291 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ArcPayService.cancelFlightBooking('FLT1', 'jane@example.com', 'Other');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/flights\/order\/FLT1\/cancel$/);
    expect(url).not.toMatch(/action=cancel-booking/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ email: 'jane@example.com', reason: 'Other' });
    expect(result).toMatchObject({ success: true, cancellation: { paymentAction: 'VOID', refundAmount: 291 } });
  });

  it('sends no email for a signed-in owner, and escapes the reference', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await ArcPayService.cancelFlightBooking('FLT1', null, 'Change of plans');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: 'Change of plans' });
    expect(flightCancelPath('A/B 1')).toBe('flights/order/A%2FB%201/cancel');
  });

  it('waits a full minute, then reports the timeout as unconfirmed', async () => {
    // Loaded before the clock is faked, as the first call above already did.
    await import('../../frontend/src/utils/apiHelper');
    await import('../../frontend/src/utils/authHeaders');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
    })));

    let settled = false;
    const pending = ArcPayService.cancelFlightBooking('FLT1', null, 'Other').then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(10_001);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS);

    expect(await pending).toMatchObject({ success: false, timedOut: true });
  });

  it('passes a refusal on in the server\'s words, with its code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { success: false, code: 'CANCEL_IN_PROGRESS', error: 'This booking is already being cancelled.' })));

    const result = await ArcPayService.cancelFlightBooking('FLT1');

    expect(result).toMatchObject({ success: false, code: 'CANCEL_IN_PROGRESS', error: 'This booking is already being cancelled.' });
  });
});
