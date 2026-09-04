import axios from 'axios';
import logger from '../logger.js';
import { getWsConfig } from './config.js';
import { buildEnvelope } from './envelope.js';
import { faultToError, transportError } from './errors.js';
import { at, parseSoap, txt, unwrapEnvelope } from './parseXml.js';
import { redactEnvelope } from './xml.js';
import { Semaphore } from './semaphore.js';

const log = logger.child({ svc: 'amadeus-ws' });

let semaphore = null;
const getSemaphore = (config) => {
  if (!semaphore) semaphore = new Semaphore(config.maxConcurrency, config.queueTimeoutMs);
  return semaphore;
};

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
  const parsed = parseSoap(xml);
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

  if (faultstring) throw faultToError(faultstring, operation.name, response.status);

  return { status: response.status, xml, body, session: readSession(header), durationMs };
};
