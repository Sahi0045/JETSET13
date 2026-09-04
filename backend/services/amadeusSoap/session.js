import { AsyncLocalStorage } from 'node:async_hooks';
import logger from '../logger.js';
import { OPERATIONS, STATELESS_OPERATIONS } from './codes.js';
import { getWsConfig } from './config.js';
import { getSemaphore } from './semaphore.js';
import { postEnvelope } from './transport.js';

const log = logger.child({ svc: 'amadeus-ws' });

/**
 * Tracks whether the current async context is already inside a session.
 *
 * A module-level flag cannot express this: two concurrent requests would see
 * each other's state and one would be refused for no reason. AsyncLocalStorage
 * scopes it to the call chain, which is exactly the boundary that matters.
 */
const activeSession = new AsyncLocalStorage();

/**
 * Session discipline for Amadeus Web Services.
 *
 * Two modes, and the difference is not cosmetic:
 *
 * - stateless: the Session header is omitted entirely. The previous client sent
 *   TransactionStatusCode="Start" on every call and never signed out, so each
 *   search opened a server-side session and abandoned it. Those count against
 *   the WSAP's max-simultaneous-sessions quota until they expire.
 *
 * - stateful: Start -> InSeries -> End, echoing the SessionId, SecurityToken
 *   and the SequenceNumber read back from the reply. Booking is a sequence of
 *   calls against one server-side context; there is no other way to express it.
 *
 * One HTTP request is one session. Nothing session-related is held on a module
 * singleton, so concurrent requests cannot collide.
 */

/** Send one stateless operation. Asserts Amadeus did not open a session anyway. */
export const callStateless = async (operationName, bodyXml, options = {}) => {
  const operation = OPERATIONS[operationName];
  if (!operation) throw new Error(`Unknown operation: ${operationName}`);
  if (!STATELESS_OPERATIONS.has(operationName)) {
    throw new Error(`${operationName} mutates GDS state and must run inside withSession()`);
  }

  const result = await postEnvelope({ operation, bodyXml, session: null, ...options });

  // This WSAP allocates a session even for a call sent without a Session
  // header, but closes it in the same exchange: the reply comes back with
  // TransactionStatusCode="End". Nothing is leaking, and signing out an
  // already-closed session just fails with "soap message header incorrect" -
  // a wasted round-trip on every search.
  //
  // Only a session Amadeus left open needs closing, which should not happen
  // here; if it does, that is worth knowing about.
  if (result.session?.sessionId && result.session.status !== 'End') {
    log.warn({ op: operationName, sessionId: result.session.sessionId, status: result.session.status },
      'stateless call left a session open; signing out');
    signOutQuietly(result.session, options.config).catch(() => {});
  }

  return result;
};

/**
 * Run a stateful sequence. `ctx.call(op, body)` handles Start/InSeries; sign-out
 * always runs, including when the body throws.
 */
export const withSession = async (fn, options = {}) => {
  const config = options.config ?? getWsConfig();
  let session = null;

  const ctx = {
    get sessionId() { return session?.sessionId ?? null; },

    async call(operationName, bodyXml, callOptions = {}) {
      const operation = OPERATIONS[operationName];
      if (!operation) throw new Error(`Unknown operation: ${operationName}`);

      const outgoing = session
        ? {
          status: 'InSeries',
          sessionId: session.sessionId,
          // Amadeus may skip numbers; always echo the reply's value + 1 rather
          // than counting locally.
          sequenceNumber: String((Number.parseInt(session.sequenceNumber, 10) || 0) + 1),
          securityToken: session.securityToken,
        }
        : { status: 'Start' };

      // The permit is already held for the whole session (below), so each call
      // inside it must not try to take a second one - with a low limit that is
      // an immediate self-deadlock.
      const result = await postEnvelope({
        operation, bodyXml, session: outgoing, config, bypassSemaphore: true, ...callOptions,
      });
      if (result.session?.sessionId) session = result.session;
      return result;
    },
  };

  // Nesting would open a second session while the first is still held, and the
  // semaphore permit is held for the whole session - with a low concurrency
  // limit that deadlocks.
  if (activeSession.getStore()) {
    throw new Error('withSession() must not be nested; pass the existing ctx down instead');
  }

  // A retried stateful sequence is a second booking. Air_Sell holds seats and
  // the ER commit creates a PNR, so replaying either sells inventory twice
  // against one payment - and the caller cannot tell, because the first attempt
  // looked like a failure. The plan called for this as a hard assertion rather
  // than a comment precisely because nothing else stops someone wrapping
  // ctx.call in a retry helper later.
  if (typeof fn !== 'function' || fn.__isRetryWrapper) {
    throw new Error('withSession() must not wrap a retry helper: a retried sell or commit is a duplicate booking');
  }

  // One permit for the WHOLE session, not one per call.
  //
  // Amadeus counts simultaneous SESSIONS against the WSAP ceiling, not
  // simultaneous HTTP requests. Taking the permit inside postEnvelope - which
  // is what happened before - bounded only the calls in flight: any number of
  // booking chains could sit holding open sessions between their calls, as long
  // as no more than `limit` were mid-request. That is precisely the overrun
  // this semaphore exists to prevent, and the module comment already claimed
  // this behaviour without implementing it.
  //
  // Held until AFTER sign-out, because the session is not returned to Amadeus
  // until then.
  await getSemaphore(config).acquire();
  try {
    return await activeSession.run(true, () => fn(ctx));
  } finally {
    try {
      if (session?.sessionId) {
        // Own try/catch and own short timeout: a hung sign-out must never become
        // the caller's error, and must never mask the real one.
        await signOutQuietly(session, config);
      }
    } finally {
      getSemaphore(config).release();
    }
  }
};

const signOutQuietly = async (session, config = getWsConfig()) => {
  try {
    await postEnvelope({
      operation: OPERATIONS.Security_SignOut,
      bodyXml: `    <Security_SignOut xmlns="${OPERATIONS.Security_SignOut.namespace}"/>`,
      session: {
        status: 'End',
        sessionId: session.sessionId,
        // A session opened by a stateless call comes back without a
        // SequenceNumber; parseInt(undefined) + 1 is NaN, and Amadeus rejects
        // the header outright rather than saying which field is wrong.
        sequenceNumber: String((Number.parseInt(session.sequenceNumber, 10) || 0) + 1),
        securityToken: session.securityToken,
      },
      config,
      timeoutMs: 5000,
      bypassSemaphore: true,
    });
  } catch (cause) {
    // `message` is the customer-facing string and says nothing useful in a log.
    // A leaked session counts against the WSAP quota until it expires, so the
    // raw Amadeus text is the only thing here worth having.
    log.warn({
      sessionId: session.sessionId,
      reason: cause?.technicalError ?? cause?.message,
    }, 'Security_SignOut failed; session will expire server-side');
  }
};

export { signOutQuietly };
