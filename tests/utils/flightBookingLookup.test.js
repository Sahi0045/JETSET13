import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Manage Booking's lookup, when the server says to wait.
 *
 * Wrong emails for a guest booking are now capped (429). The page showed
 * "Failed to fetch booking (429)" and retried twice, which could not succeed.
 */

vi.mock('../../frontend/src/config/api.config', () => ({
  default: { API_URL: 'http://localhost:3001/api' },
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({
  authHeaders: async (extra = {}) => ({ ...extra }),
}));

const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });

let fetchFlightBooking;
let shouldRetryBookingLookup;

beforeEach(async () => {
  vi.resetModules();
  ({ fetchFlightBooking, shouldRetryBookingLookup } = await import('../../frontend/src/hooks/queries/useFlights.js'));
});

describe('opening a booking from Manage Booking', () => {
  it("shows the server's message when there have been too many wrong emails, and does not retry", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(reply(429, {
      success: false,
      error: 'Too many attempts with the wrong email for this booking. Please wait 15 minutes and try again.',
    }));

    const error = await fetchFlightBooking('FLTGUEST1', 'guess@example.com').catch((e) => e);
    expect(error.message).toMatch(/wait 15 minutes/);
    expect(error.status).toBe(429);
    expect(shouldRetryBookingLookup(0, error)).toBe(false);
  });

  it('still says to wait when the 429 has no readable body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 429, ok: false, json: async () => { throw new Error('not json'); } });
    const error = await fetchFlightBooking('FLTGUEST1', 'guess@example.com').catch((e) => e);
    expect(error.message).toMatch(/wait 15 minutes/);
  });

  it('sends the email in a header and returns the booking', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(reply(200, { success: true, data: { bookingReference: 'FLTGUEST1' } }));

    await expect(fetchFlightBooking('FLTGUEST1', 'jane@example.com')).resolves.toEqual({ bookingReference: 'FLTGUEST1' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/flights/bookings/FLTGUEST1');
    expect(init.headers['x-booking-email']).toBe('jane@example.com');
    expect(url).not.toContain('jane');
  });

  it('does not retry a not-found, and retries a server error twice', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(reply(404, { success: false }));
    const notFound = await fetchFlightBooking('FLTGUEST1', 'guess@example.com').catch((e) => e);
    expect(notFound.message).toBe('No booking matches that reference and email.');
    expect(shouldRetryBookingLookup(0, notFound)).toBe(false);

    const serverError = new Error('Failed to fetch booking (500)');
    expect(shouldRetryBookingLookup(0, serverError)).toBe(true);
    expect(shouldRetryBookingLookup(2, serverError)).toBe(false);
  });
});
