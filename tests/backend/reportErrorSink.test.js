import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `reportError` must always leave a trace, with or without Sentry.
 *
 * It was a silent discard when no provider was configured — which is the state
 * this deployment is actually in, since `SENTRY_DSN` is unset. Most callers log
 * something themselves first, so the gap was invisible. The two that don't are
 * the ones that matter:
 *
 *   - the Amadeus auth / session-limit fault path
 *   - the charged-but-committed `needs_review` case in POST /flights/order,
 *     where a customer has paid, a PNR exists, possibly ticketed, and the chain
 *     failed afterwards
 *
 * Both called `reportError` and nothing else, so both went nowhere at all.
 */

const logged = [];

vi.mock('../../backend/services/logger.js', () => {
  const record = (obj, msg) => logged.push({ obj, msg });
  const logger = {
    error: record,
    warn: record,
    info: record,
    debug: record,
    child: () => logger,
  };
  return { logger, default: logger };
});

let reportError;

beforeEach(async () => {
  logged.length = 0;
  vi.resetModules();
  ({ reportError } = await import('../../backend/services/monitoring.js'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('reportError always reaches a sink', () => {
  it('logs locally when no provider is configured', () => {
    reportError(new Error('amadeus auth rejected'), { service: 'amadeus-ws', operation: 'Air_SellFromRecommendation' });

    expect(logged).toHaveLength(1);
    expect(logged[0].obj.err).toBe('amadeus auth rejected');
    expect(logged[0].obj.reported).toBe(false);
  });

  it('carries the triage context through, not just the message', () => {
    reportError(new Error('chain failed after commit'), {
      service: 'amadeus-ws',
      flow: 'booking',
      wsap: '1ASIWJETJEC',
      step: 'issueTicket',
      pnr: 'CHOY42',
      ticketed: true,
    });

    const { obj } = logged[0];
    // A human triaging this needs the locator and whether a ticket exists -
    // those decide whether the booking may be cancelled at all.
    expect(obj.pnr).toBe('CHOY42');
    expect(obj.ticketed).toBe(true);
    expect(obj.step).toBe('issueTicket');
    expect(obj.wsap).toBe('1ASIWJETJEC');
  });

  it('records a stack so the report is actionable', () => {
    reportError(new Error('boom'));
    expect(logged[0].obj.stack).toContain('Error: boom');
  });

  it('survives a non-Error being thrown at it', () => {
    expect(() => reportError('a bare string')).not.toThrow();
    expect(logged[0].obj.err).toBe('a bare string');
  });

  // It is called from the express error handler and from the process crash
  // guards. Throwing there would replace a real error with this one.
  it('never throws, even when the provider explodes', async () => {
    const { _setProvider } = await import('../../backend/services/monitoring.js');
    _setProvider({ captureException: () => { throw new Error('sentry is down'); } });

    expect(() => reportError(new Error('original failure'))).not.toThrow();
    // The local log still happened, which is the point.
    expect(logged[0].obj.err).toBe('original failure');
    expect(logged[0].obj.reported).toBe(true);

    _setProvider(null);
  });
});
