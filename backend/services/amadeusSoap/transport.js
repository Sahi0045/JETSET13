import axios from 'axios';
import logger from '../logger.js';
import { getWsConfig } from './config.js';
import { buildEnvelope } from './envelope.js';
import { faultToError, transportError } from './errors.js';
import { at, parseSoap, txt, unwrapEnvelope } from './parseXml.js';
import { redactEnvelope } from './xml.js';
import { getSemaphore } from './semaphore.js';

const log = logger.child({ svc: 'amadeus-ws' });

/** Read the Session header Amadeus echoes back, if any. */
const readSession = (header) => {
  const node = at(header, 'Session');
  if (!node) return null;
  return {
    status: txt(node['@TransactionStatusCode']) || null,
    sessionId: txt(node.SessionId) || null,
    sequenceNumber: txt(node.SequenceNumber) || null,
    securityToken: txt(node.SecurityToken) || null,
  };
};

/**
 * Send one SOAP request.
 *
 * Amadeus returns faults with HTTP 500, so a non-2xx status is still a response
 * worth parsing - `validateStatus` must stay permissive or every fault becomes
 * an opaque axios error.
 *
 * Nothing here logs an envelope or a traveller. The metrics line carries only
 * shape and timing, which is what makes fault rates measurable without putting
 * passport numbers in a log sink.
 */
export const postEnvelope = async ({ operation, bodyXml, session = null, config = getWsConfig(), timeoutMs, bypassSemaphore = false }) => {
  const envelope = buildEnvelope({ action: operation.action, bodyXml, config, session });
  const started = Date.now();

  if (config.logEnvelopes) {
    log.debug({ op: operation.name, envelope: redactEnvelope(envelope) }, 'amadeus request');
  }

  let response;
  try {
    // Sign-out releases a session rather than consuming one, so it must not
    // queue behind customer traffic. Every stateless call on this WSAP comes
    // back with a session to close, so charging sign-outs against the same
    // budget halves effective throughput.
    const send = () => axios.post(config.endpoint, envelope, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: operation.action },
      timeout: timeoutMs ?? config.timeoutMs,
      validateStatus: () => true,
      responseType: 'text',
      transitional: { silentJSONParsing: false },
    });

    response = bypassSemaphore ? await send() : await getSemaphore(config).run(send);
  } catch (cause) {
    const durationMs = Date.now() - started;
    log.warn({ op: operation.name, ok: false, durationMs, reason: cause?.code || 'transport' }, 'flight.ws.call');
    if (cause?.code === 503) {
      throw Object.assign(new Error('Too many concurrent requests, please retry'), { code: 503, retryAfter: cause.retryAfter });
    }
    throw transportError(cause, operation.name);
  }

  const durationMs = Date.now() - started;
  const xml = typeof response.data === 'string' ? response.data : String(response.data ?? '');

  // Only a whole SOAP envelope is an answer. The permissive `validateStatus`
  // above lets through whatever else is on the wire too - a gateway's HTML
  // 502/503/504 page, an empty body, an envelope cut off mid-reply - and each
  // of those used to parse to an empty body: no Fault, no error container, so
  // inspectReply answered ok. A PNR_Cancel answered by a 503 page was
  // "cancelled" and the customer refunded over a live PNR; a PNR_Retrieve
  // answered by one read as "no tickets", so the void was skipped. Nobody saw
  // Amadeus's answer to any of them, which is what a timeout means too, so
  // they are the same error: the outcome is unknown.
  //
  // The parser is lenient and closes whatever it was given, so a truncated
  // envelope parses to a plausible, shorter reply. The closing Envelope tag is
  // the last thing sent; without it the reply was not received whole.
  let parsed = null;
  try {
    parsed = parseSoap(xml);
  } catch {
    parsed = null;
  }
  const env = parsed?.Envelope ?? parsed?.envelope;
  const whole = /<\/(?:[\w.-]+:)?Envelope\s*>\s*$/.test(xml.slice(-256));
  if (!env || !whole || !env.Body || typeof env.Body !== 'object') {
    // Shape and size only: a truncated reply can still carry a traveller.
    log.warn({
      op: operation.name, ok: false, durationMs, httpStatus: response.status, bytesIn: xml.length, reason: 'not_soap',
    }, 'flight.ws.call');
    const error = transportError(
      new Error(`HTTP ${response.status}: the reply is not a SOAP envelope (${xml.length} bytes${env && !whole ? ', truncated' : ''})`),
      operation.name,
    );
    error.httpStatus = response.status;
    // A cut-off reply may still have carried the session header; keep it for
    // sign-out, as a fault does, and as non-enumerable for the same reason.
    const session = env ? readSession(env.Header ?? {}) : null;
    if (session?.sessionId) Object.defineProperty(error, 'session', { value: session, enumerable: false });
    throw error;
  }
  const { header, body } = unwrapEnvelope(parsed);

  const fault = at(body, 'Fault');
  const faultstring = fault ? txt(fault.faultstring) : null;

  log.info({
    op: operation.name,
    ok: !faultstring,
    durationMs,
    httpStatus: response.status,
    bytesOut: envelope.length,
    bytesIn: xml.length,
    sessionId: readSession(header)?.sessionId ?? null,
    fault: faultstring || undefined,
  }, 'flight.ws.call');

  if (config.logEnvelopes) {
    log.debug({ op: operation.name, reply: redactEnvelope(xml) }, 'amadeus reply');
  }

  if (faultstring) {
    // A fault can still open a session: on PDT a Start call answered 1931 NO
    // MATCH FOR RECORD LOCATOR comes back InSeries, with a SessionId. withSession
    // needs that header to sign out. Not enumerable, so the security token never
    // reaches a log line that serialises the error.
    const error = faultToError(faultstring, operation.name, response.status);
    Object.defineProperty(error, 'session', { value: readSession(header), enumerable: false });
    throw error;
  }

  return { status: response.status, xml, body, session: readSession(header), durationMs };
};
