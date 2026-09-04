import logger from '../logger.js';
import { OPERATIONS, STATELESS_OPERATIONS } from './codes.js';
import { getWsConfig } from './config.js';
import { postEnvelope } from './transport.js';

const log = logger.child({ svc: 'amadeus-ws' });

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

  // If a session comes back despite no Session header, close it rather than
  // leak it - and say so, because it would mean this WSAP is stateful-only.
  if (result.session?.sessionId) {
    log.warn({ op: operationName, sessionId: result.session.sessionId },
      'stateless call returned a session; signing out to avoid a leak');
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
  let depth = 0;

  const ctx = {
    get sessionId() { return session?.sessionId ?? null; },

    async call(operationName, bodyXml, callOptions = {}) {
      const operation = OPERATIONS[operationName];
      if (!operation) throw new Error(`Unknown operation: ${operationName}`);
      if (depth > 0) throw new Error('withSession() must not be nested');

      const outgoing = session
        ? {
          status: 'InSeries',
          sessionId: session.sessionId,
          // Amadeus may skip numbers; always echo the reply's value + 1 rather
          // than counting locally.
          sequenceNumber: String(Number.parseInt(session.sequenceNumber, 10) + 1),
          securityToken: session.securityToken,
        }
        : { status: 'Start' };

      const result = await postEnvelope({ operation, bodyXml, session: outgoing, config, ...callOptions });
      if (result.session?.sessionId) session = result.session;
      return result;
    },
  };

  try {
    return await fn(ctx);
  } finally {
    if (session?.sessionId) {
      // Own try/catch and own short timeout: a hung sign-out must never become
      // the caller's error, and must never mask the real one.
      await signOutQuietly(session, config);
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
        sequenceNumber: String(Number.parseInt(session.sequenceNumber, 10) + 1),
        securityToken: session.securityToken,
      },
      config,
      timeoutMs: 5000,
    });
  } catch (cause) {
    log.warn({ sessionId: session.sessionId, reason: cause?.message }, 'Security_SignOut failed; session will expire server-side');
  }
};

export { signOutQuietly };
