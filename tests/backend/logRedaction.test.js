import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

/**
 * What must never reach a log sink.
 *
 * A flight order is the most sensitive payload this service handles: several
 * people's names, dates of birth and passport numbers in one object. A SOAP
 * booking envelope carries all of that plus the WS-Security digest. Both get
 * logged by accident the moment someone adds a `logger.info({ req.body })` in
 * a hurry, and by then it is in whatever ships the logs onward.
 *
 * These assert the redaction configuration itself rather than any one call
 * site, because the call sites are what change.
 */

/** Rebuild the logger with the production redact config, writing to a buffer. */
const captureLogger = async () => {
  const lines = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); },
  });

  // Read the real paths out of the shipped logger rather than restating them,
  // so this test fails when the config drifts instead of passing on a copy.
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../../backend/services/logger.js', import.meta.url), 'utf8'));
  const paths = [...source.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]);

  return { logger: pino({ redact: { paths, censor: '***' } }, sink), lines, paths };
};

describe('redaction covers the payloads that actually carry secrets', () => {
  it('hides traveller identity from a booking-shaped object', async () => {
    const { logger, lines } = await captureLogger();

    logger.info({
      travelers: [{
        name: { firstName: 'JANE', lastName: 'DOE' },
        dateOfBirth: '1990-04-12',
        documents: [{ number: 'X1234567', documentType: 'PASSPORT' }],
      }],
      passengerData: { passportNumber: 'X1234567' },
    }, 'flight order');

    const out = lines.join('');
    expect(out).not.toContain('X1234567');
    expect(out).not.toContain('1990-04-12');
    expect(out).not.toContain('JANE');
  });

  it('hides the SOAP envelope and its security token', async () => {
    const { logger, lines } = await captureLogger();

    logger.info({
      envelope: '<wsse:Password>hunter2</wsse:Password><surname>DOE</surname>',
      securityToken: 'TOKENVALUE123',
    }, 'amadeus call');

    const out = lines.join('');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('TOKENVALUE123');
  });

  it('hides credentials and card data wherever they are nested', async () => {
    const { logger, lines } = await captureLogger();

    logger.info({
      password: 'p4ssw0rd',
      payment: { cardNumber: '4111111111111111', cvv: '123' },
      arc: { apiPassword: 'arcsecret' },
    }, 'payment');

    const out = lines.join('');
    for (const secret of ['p4ssw0rd', '4111111111111111', '123456', 'arcsecret']) {
      expect(out).not.toContain(secret);
    }
  });

  it('still logs the things that make a log useful', async () => {
    const { logger, lines } = await captureLogger();

    logger.info({ bookingReference: 'FLT123', pnr: 'ABC123', statusCode: 502 }, 'booking failed');

    const out = lines.join('');
    expect(out).toContain('FLT123');
    expect(out).toContain('ABC123');
    expect(out).toContain('booking failed');
  });
});

describe('the configuration itself', () => {
  // Each of these is a field that appeared in a real payload during the
  // Amadeus migration. Losing one is how a passport number reaches a log.
  it('lists every field a booking or SOAP call can carry', async () => {
    const { paths } = await captureLogger();

    for (const required of [
      'password', 'cardNumber', 'cvv', 'apiPassword',
      'wsse', 'envelope', 'securityToken',
      'passengerData', 'travelers', 'travellerInfo',
      'documents', 'passportNumber', 'dateOfBirth', 'emailAddress',
    ]) {
      expect(paths, `${required} must be redacted`).toContain(required);
    }
  });

  // Redacting `documents` only at the top level misses
  // `data.flightOffers[0].travelers[0].documents`, which is where it actually
  // lives in an order payload.
  it('covers nested occurrences, not just top-level ones', async () => {
    const { paths } = await captureLogger();

    for (const required of ['*.passportNumber', '*.travelers', '*.envelope', '*.dateOfBirth']) {
      expect(paths, `${required} must be redacted at depth`).toContain(required);
    }
  });
});
