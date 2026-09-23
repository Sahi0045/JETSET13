import { afterEach, describe, expect, it, vi } from 'vitest';
import ArcPayService from '../../frontend/src/Services/ArcPayService.js';

vi.mock('../../frontend/src/utils/authHeaders', () => ({
  authHeaders: async (extra = {}) => ({ Authorization: 'Bearer test-token', ...extra }),
}));

/**
 * The cancel's answer when it went through and could not be recorded
 * (payment/operations.handlers.js flagUnrecordedCancellation): a 500 that says
 * so, and carries what the cancel did as `cancellation`.
 *
 * The client dropped that record from every answer that was not a success, so
 * Manage Booking and My Trips could not tell this answer from a refusal, and
 * kept showing the booking as they had loaded it - Ticketed, Download
 * E-Ticket, Cancel - to a customer just told not to try again.
 */

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
});

const UNSAVED = 'Your cancellation was processed, but we could not save it. Please do not try again - '
  + 'call (877) 538-7380 and we will confirm what happened to your payment.';
const carriedOut = { paymentAction: 'VOID', refundAmount: 291, ticketsVoided: true };

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ['cancelFlightBooking'],
  ['cancelBooking'],
])('%s, when the cancel went through and could not be recorded', (method) => {
  it('passes on what the cancel did, with the server\'s words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { success: false, error: UNSAVED, message: UNSAVED, cancellation: carriedOut })));

    const result = await ArcPayService[method]('FLT1', null, 'Other');

    expect(result).toMatchObject({ success: false, error: UNSAVED, cancellation: carriedOut });
  });

  // Fence: a refusal carries no record, and none is made up for it.
  it('a refusal still carries none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { success: false, code: 'CANCEL_IN_PROGRESS', error: 'This booking is already being cancelled.' })));

    const result = await ArcPayService[method]('FLT1');

    expect(result).toMatchObject({ success: false, code: 'CANCEL_IN_PROGRESS' });
    expect(result.cancellation).toBeUndefined();
  });
});
