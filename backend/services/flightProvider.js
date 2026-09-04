import logger from './logger.js';
import soapProvider from './amadeusSoap/index.js';
import { describeWsConfig, isWsEnabled } from './amadeusSoap/config.js';
import { datasetInfo } from './airportsIndex.js';

const log = logger.child({ svc: 'flight-provider' });

/**
 * The single place flight routes get their provider from.
 *
 * Two reasons this indirection exists rather than routes importing the SOAP
 * client directly:
 *
 * 1. The kill switch. AMADEUS_WS_ENABLED=false turns every flight call into a
 *    clean 503 in about five seconds - restart the container, no deploy. That
 *    is the rollback path if a WSAP misbehaves in production.
 *
 * 2. There is deliberately NO fallback to the old REST service. Its host has no
 *    DNS, so "falling back" would mean a slow ENOTFOUND instead of an honest
 *    error, and a mock would mean fabricating flights for a customer about to
 *    pay. Disabled means unavailable, and says so.
 */

const disabled = (method) => async () => {
  log.warn({ method }, 'flight provider is disabled (AMADEUS_WS_ENABLED=false)');
  const error = new Error('Flight search is temporarily unavailable');
  error.code = 503;
  error.error = error.message;
  throw error;
};

const provider = new Proxy({}, {
  get(_target, method) {
    if (typeof method !== 'string') return undefined;
    if (!isWsEnabled()) return disabled(method);

    const impl = soapProvider[method];
    if (typeof impl !== 'function') {
      throw new Error(`FlightProvider has no method "${method}"`);
    }
    return impl;
  },
});

/** Config presence and dataset version for the health endpoint. Never values. */
export const providerStatus = () => ({
  provider: 'amadeus-soap',
  ...describeWsConfig(),
  airportDataset: datasetInfo(),
});

export default provider;
