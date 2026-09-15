import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as T from '../../backend/services/email/templates.js';

/**
 * Travel dates in emails, on a server west of UTC.
 *
 * The templates parsed "2026-11-15" with `new Date`, UTC midnight, and then
 * printed it in the server's own zone: anywhere west of UTC the email said the
 * 14th.
 */
describe('email travel dates in New York', () => {
  let originalTz;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('prints the travel date the booking names', () => {
    const html = T.generateBookingConfirmationTemplate({
      customerName: 'Jane', bookingReference: 'FLT1', bookingType: 'flight', paymentAmount: 100,
      travelDate: '2026-11-15', passengers: 1,
      bookingDetails: { origin: 'JFK', destination: 'LHR', departureTime: '19:25', arrivalTime: '06:10' },
    });

    expect(html).toContain('Sunday, November 15, 2026');
    expect(html).toContain('Sun, Nov 15');
    expect(html).not.toMatch(/November 14|Nov 14/);
  });

  it('still prints a timestamp as the moment it names', () => {
    const html = T.generatePaymentLinkTemplate({
      customerName: 'Jane', description: 'Trip', amount: 10, paymentUrl: 'https://example.test/pay',
      expiresAt: '2026-11-16T15:00:00Z',
    });
    expect(html).toMatch(/Nov(ember)? 16/);
  });
});
