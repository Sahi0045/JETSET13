/**
 * Amadeus Web Services configuration.
 *
 * Every endpoint, WSAP, office and credential is read from the environment.
 * The production WSAP and its credentials are issued by Amadeus only after
 * certification, so switching environments must stay an edit to the env file -
 * never a code change. Nothing in this client hardcodes any of them.
 *
 * Fails fast listing every missing name at once, the same way
 * backend/routes/payment/arcpay.config.js does, so a misconfigured deploy says
 * what is wrong instead of failing later inside a SOAP call.
 */

const REQUIRED = Object.freeze({
  AMADEUS_WS_ENDPOINT: 'endpoint',
  AMADEUS_WS_USERNAME: 'username',
  AMADEUS_WS_PASSWORD: 'password',
  AMADEUS_WS_OFFICE_ID: 'officeId',
});

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isTrue = (value, fallback = false) => (
  value === undefined || value === '' ? fallback : String(value).toLowerCase() === 'true'
);

let cached = null;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Readonly<object>} frozen config
 * @throws {Error} listing every missing required variable
 */
const readWsConfig = (env = process.env) => {
  const missing = Object.keys(REQUIRED).filter((name) => !env[name] || String(env[name]).trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Amadeus Web Services is not configured. Missing: ${missing.join(', ')}. `
      + 'Set these in the environment, or set AMADEUS_WS_ENABLED=false to disable flights cleanly.',
    );
  }

  return Object.freeze({
    endpoint: env.AMADEUS_WS_ENDPOINT.trim(),
    wsap: (env.AMADEUS_WS_WSAP || '').trim() || env.AMADEUS_WS_ENDPOINT.trim().split('/').pop(),
    username: env.AMADEUS_WS_USERNAME.trim(),
    password: env.AMADEUS_WS_PASSWORD,
    officeId: env.AMADEUS_WS_OFFICE_ID.trim(),
    dutyCode: (env.AMADEUS_WS_DUTY_CODE || 'SU').trim(),
    requestorType: (env.AMADEUS_WS_REQUESTOR_TYPE || 'U').trim(),
    currency: (env.AMADEUS_WS_CURRENCY || 'USD').trim().toUpperCase(),

    bookingEnabled: isTrue(env.AMADEUS_WS_BOOKING_ENABLED, false),
    autoTicket: isTrue(env.AMADEUS_WS_AUTO_TICKET, false),
    queueNumber: (env.AMADEUS_WS_QUEUE_NUMBER || '50').trim(),
    queueOffice: (env.AMADEUS_WS_QUEUE_OFFICE || env.AMADEUS_WS_OFFICE_ID).trim(),
    // No FOP free-text setting: fopDetails accepts only fopCode, fopMapTable,
    // fopBillingCode and fopStatus, so there is nowhere to put the ARC
    // transaction id. It lives in booking_details.transaction_id instead.
    // CASH, not CA: we are the merchant of record - the card is charged at
    // ARC Pay before the GDS is involved - so from the airline's side this is
    // an agency collection settling through ARC. The WSAP rejects CA.
    fopCode: (env.AMADEUS_WS_FOP_CODE || 'CASH').trim(),

    maxConcurrency: asInt(env.AMADEUS_WS_MAX_CONCURRENCY, 4),
    queueTimeoutMs: asInt(env.AMADEUS_WS_QUEUE_TIMEOUT_MS, 8000),
    timeoutMs: asInt(env.AMADEUS_WS_TIMEOUT_MS, 25000),
    offerMaxAgeMin: asInt(env.AMADEUS_WS_OFFER_MAX_AGE_MIN, 30),
    priceTolerance: asFloat(env.AMADEUS_WS_PRICE_TOLERANCE, 0),
    logEnvelopes: isTrue(env.AMADEUS_WS_LOG_ENVELOPES, false) && env.NODE_ENV !== 'production',
  });
};

/** Memoised for the process. Tests get a fresh read via vi.resetModules(). */
export const getWsConfig = (env = process.env) => {
  if (!cached) cached = readWsConfig(env);
  return cached;
};

/** True when flights should use the SOAP provider at all. */
export const isWsEnabled = (env = process.env) => isTrue(env.AMADEUS_WS_ENABLED, true);

/** Cheap presence check for the health endpoint - never reports values. */
export const describeWsConfig = (env = process.env) => ({
  enabled: isWsEnabled(env),
  configured: Object.keys(REQUIRED).every((name) => Boolean(env[name])),
  endpoint: env.AMADEUS_WS_ENDPOINT || null,
  wsap: env.AMADEUS_WS_WSAP || null,
  officeId: env.AMADEUS_WS_OFFICE_ID || null,
  bookingEnabled: isTrue(env.AMADEUS_WS_BOOKING_ENABLED, false),
  autoTicket: isTrue(env.AMADEUS_WS_AUTO_TICKET, false),
});
