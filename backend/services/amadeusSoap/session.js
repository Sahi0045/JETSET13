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
  // The highest SequenceNumber this session has SENT. The reply's number is the
  // one to build on, but a call that gets no reply leaves only this: whether it
  // reached Amadeus cannot be known, and if it did, its number is used up.
  let lastSent = 0;

  const ctx = {
    get sessionId() { return session?.sessionId ?? null; },

    async call(operationName, bodyXml, callOptions = {}) {
      const operation = OPERATIONS[operationName];
      if (!operation) throw new Error(`Unknown operation: ${operationName}`);

      const outgoing = session
        ? {
          status: 'InSeries',
          sessionId: session.sessionId,
          // Amadeus may skip numbers, so build on the reply's value rather than
          // counting locally - but never below a number already SENT. After a
          // call that got no reply the reply's value is stale: in the booking
          // chain a Queue_PlacePNR that timed out left DocIssuance_IssueTicket
          // going out with the number the queue call had used, and Amadeus
          // refuses a reused number (93|Session|Illogical conversation), so the
          // ticket failed to issue. A read timeout means the request went out,
          // which is our captured case.
          sequenceNumber: String(Math.max(Number.parseInt(session.sequenceNumber, 10) || 0, lastSent) + 1),
          securityToken: session.securityToken,
        }
        : { status: 'Start' };
      // Recorded before sending, so it survives whatever the send does - a
      // timeout, a reset, or a reply that cannot be parsed and escapes as a raw
      // throw. It used to be computed and thrown away.
      if (outgoing.sequenceNumber) lastSent = Math.max(lastSent, Number(outgoing.sequenceNumber));

      // The permit is already held for the whole session (below), so each call
      // inside it must not try to take a second one - with a low limit that is
      // an immediate self-deadlock.
      let result;
      try {
        result = await postEnvelope({
          operation, bodyXml, session: outgoing, config, bypassSemaphore: true, ...callOptions,
        });
      } catch (cause) {
        // Keep the session a fault reply carries. Without it a failed first
        // call left `session` null and the sign-out below never ran, and a
        // failed later call signed out with a sequence number already used.
        if (cause?.session?.sessionId) session = cause.session;
        throw cause;
      }
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
      if (session?.sessionId && session.status !== 'End') {
        // Own try/catch and own short timeout: a hung sign-out must never become
        // the caller's error, and must never mask the real one.
        //
        // One past the number SENT first, then one past the number last
        // REPLIED. They differ only when a call got no reply, and then which is
        // right depends on whether it reached Amadeus - which cannot be known.
        // Our 15 Sep capture (flow log 10): reply 1, a Ticket_CancelDocument
        // sent at 2 timed out, and the sign-out at 2 was refused "93|Session|
        // Illogical conversation" - Amadeus had used 2. Signing out at the
        // reply's number alone left that session, and the seats a seat check
        // had sold in it, open until it expired.
        const replied = Number.parseInt(session.sequenceNumber, 10) || 0;
        await signOutQuietly(session, config, {
          sequenceNumbers: [...new Set([Math.max(lastSent, replied) + 1, replied + 1])],
        });
      }
    } finally {
      getSemaphore(config).release();
    }
  }
};

/**
 * Close a session, trying each of `sequenceNumbers` in turn until one is
 * accepted. Never throws; answers whether the session was closed.
 *
 * Without `sequenceNumbers` it is one past the session's last reply, as it
 * always was - the stateless path, where every call had its reply.
 */
const signOutQuietly = async (session, config = getWsConfig(), { sequenceNumbers } = {}) => {
  // A session opened by a stateless call comes back without a SequenceNumber;
  // parseInt(undefined) + 1 is NaN, and Amadeus rejects the header outright
  // rather than saying which field is wrong.
  const numbers = sequenceNumbers?.length
    ? sequenceNumbers
    : [(Number.parseInt(session.sequenceNumber, 10) || 0) + 1];

  let lastCause = null;
  for (const sequenceNumber of numbers) {
    try {
      await postEnvelope({
        operation: OPERATIONS.Security_SignOut,
        bodyXml: `    <Security_SignOut xmlns="${OPERATIONS.Security_SignOut.namespace}"/>`,
        session: {
          status: 'End',
          sessionId: session.sessionId,
          sequenceNumber: String(sequenceNumber),
          securityToken: session.securityToken,
        },
        config,
        timeoutMs: 5000,
        bypassSemaphore: true,
      });
      return true;
    } catch (cause) {
      lastCause = cause;
      // Amadeus answers a refused sign-out with the session header it holds.
      // It used to be discarded; it is the one clue to what it expected.
      log.warn({
        sessionId: session.sessionId,
        sentSequence: sequenceNumber,
        amadeusSequence: cause?.session?.sequenceNumber ?? null,
        reason: cause?.technicalError ?? cause?.message,
      }, 'Security_SignOut refused');
    }
  }

  // `message` is the customer-facing string and says nothing useful in a log.
  // A leaked session counts against the WSAP quota until it expires, so the
  // raw Amadeus text is the only thing here worth having.
  log.warn({
    sessionId: session.sessionId,
    tried: numbers,
    reason: lastCause?.technicalError ?? lastCause?.message,
  }, 'Security_SignOut failed; session will expire server-side');
  return false;
};

export { signOutQuietly };
